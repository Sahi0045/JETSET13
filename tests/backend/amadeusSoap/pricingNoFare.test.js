import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';
import { readFileSync } from 'node:fs';

/**
 * A pricing reply that found no fare is a refusal, not a price.
 *
 * `inspectReply` classifies Amadeus's 931 "NO FARE FOUND FOR REQUESTED
 * ITINERARY" as `{ ok: false, empty: true }` - a *search* that succeeded and
 * found nothing. That is right for Master Pricer and wrong for pricing, and
 * pricing only ever threw on `status.error`, which `empty` does not carry. So
 * the throw never happened, `applyPricingToOffer` found no pricing group and
 * returned the untouched search offer, and the route answered 200 with
 * `success: true` carrying the price the customer had *searched* with.
 *
 * Nothing downstream could catch it: the review page compares the priced total
 * against the searched total, they were identical, so no "fare changed" notice
 * appeared; checkout only checks that `price` exists; and the order route marks
 * such an offer `repriced`, so its pre-sell guard compared the search price
 * against itself and passed. The customer paid a price no airline had
 * confirmed.
 */

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
const reply = (xml) => ({ status: 200, data: xml, headers: {} });

/** A Fare_InformativePricingWithoutPNR reply that priced nothing. */
const noFareReply = () => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Fare_InformativePricingWithoutPNRReply xmlns="http://xml.amadeus.com/TIPNRR_18_1_1A">
      <errorGroup>
        <errorOrWarningCodeDetails><errorDetails>
          <errorCode>931</errorCode>
          <errorCategory>EC</errorCategory>
        </errorDetails></errorOrWarningCodeDetails>
        <errorWarningDescription><freeTextDetails>
          <textSubjectQualifier>3</textSubjectQualifier>
          <source>F</source>
          <encoding>1</encoding>
        </freeTextDetails>
        <freeText>NO FARE FOUND FOR REQUESTED ITINERARY</freeText>
        </errorWarningDescription>
      </errorGroup>
    </Fare_InformativePricingWithoutPNRReply>
  </soap:Body>
</soap:Envelope>`;

const makeApp = async () => {
  const routes = (await import('../../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
};

const offerFrom = async (searchFixture) => {
  const { mapMasterPricerReply } = await import('../../../backend/services/amadeusSoap/mappers/offer.js');
  const { parseSoap, unwrapEnvelope } = await import('../../../backend/services/amadeusSoap/parseXml.js');
  const { body } = unwrapEnvelope(parseSoap(fixture(searchFixture)));
  const parsed = body[Object.keys(body).find((k) => k !== 'Fault')];
  const { offers } = mapMasterPricerReply(parsed, {
    config: { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' },
    searchSignature: 'test',
  });
  return offers[0];
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
});

describe('POST /api/flights/price when Amadeus priced nothing', () => {
  it('refuses the fare instead of handing back the search price', async () => {
    const offer = await offerFrom('mptbs-oneway-jfk-lhr');
    const searchedTotal = offer.price.total;
    axios.post.mockResolvedValue(reply(noFareReply()));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price').send({ flightOffer: offer });

    // The bug: 200 with success:true and the untouched searched price.
    expect(res.status).not.toBe(200);
    expect(res.body.success).not.toBe(true);
    expect(res.body?.data?.flightOffers?.[0]?.price?.total).not.toBe(searchedTotal);
  });

  it('answers 409 so checkout reads it as a fare refusal, not an outage', async () => {
    const offer = await offerFrom('mptbs-oneway-jfk-lhr');
    axios.post.mockResolvedValue(reply(noFareReply()));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price').send({ flightOffer: offer });

    // isFareRefusal accepts 400 and 409 only; a 502 would tell the customer to
    // try again on a fare that can never be sold.
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/no longer available|search again/i);
  });

  it('still prices a reply that carries a fare', async () => {
    axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr') });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.flightOffers[0].price.total)).toBeGreaterThan(0);
  });
});
