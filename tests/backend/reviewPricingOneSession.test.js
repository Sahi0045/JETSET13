import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';

/**
 * Amadeus's certification review of test case 7 (24 Sep 2026) asked why the
 * review page ran a stateless AND a stateful Fare_InformativePricingWithoutPNR
 * for the same offer. It did: /flights/price priced it statelessly, and each of
 * the page's two rule panels priced it again in a session to read
 * Fare_CheckRules. The page now asks once, with withFareRules, and the server
 * takes the price and the rules from ONE stateful session.
 */

const fixture = (name) => readFileSync(new URL(`../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
const reply = (xml) => ({ status: 200, data: xml, headers: {} });

const makeApp = async () => {
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
};

const offerFrom = async (searchFixture) => {
  const { mapMasterPricerReply } = await import('../../backend/services/amadeusSoap/mappers/offer.js');
  const { parseSoap, unwrapEnvelope } = await import('../../backend/services/amadeusSoap/parseXml.js');
  const { body } = unwrapEnvelope(parseSoap(fixture(searchFixture)));
  const answer = body[Object.keys(body).find((k) => k !== 'Fault')];
  const { offers } = mapMasterPricerReply(answer, {
    config: { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' },
    searchSignature: 'test',
  });
  return offers[0];
};

/** Every SOAP request sent, as { op, session } where session is Start/InSeries/End or none (stateless). */
const sent = () => axios.post.mock.calls.map(([, body]) => {
  const xml = String(body);
  const op = /<(Fare_InformativePricingWithoutPNR|Fare_CheckRules|Security_SignOut)[\s>]/.exec(xml)?.[1] ?? 'other';
  const session = /TransactionStatusCode="(\w+)"/.exec(xml)?.[1] ?? 'none';
  return { op, session };
});
const pricings = () => sent().filter((c) => c.op === 'Fare_InformativePricingWithoutPNR');

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
  axios.post.mockReset();
});

// A stubbed carrier list must not follow the test that set it.
afterEach(() => vi.unstubAllEnvs());

describe('the review page prices and reads rules in one session', () => {
  it('prices once, inside the session that reads the rules, with no stateless pricing beside it', async () => {
    axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr'), withFareRules: true });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.flightOffers[0].price.grandTotal ?? res.body.data.flightOffers[0].price.total)).toBeGreaterThan(0);
    expect(pricings()).toEqual([{ op: 'Fare_InformativePricingWithoutPNR', session: 'Start' }]);
    const rules = sent().filter((c) => c.op === 'Fare_CheckRules');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((c) => c.session === 'InSeries')).toBe(true);
    // The rule panels' data rides back with the price, shaped as /fare-rules shapes it.
    expect(Array.isArray(res.body.fareRules.bags)).toBe(true);
    expect(res.body.fareRules.fareRules.length).toBeGreaterThan(0);
    expect(res.body.fareRules.cancellation.currency).toBe('USD');
  });

  it("leaves checkout's price check as the one stateless call it was", async () => {
    axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr') });

    expect(res.status).toBe(200);
    expect(pricings()).toEqual([{ op: 'Fare_InformativePricingWithoutPNR', session: 'none' }]);
    expect(sent().some((c) => c.op === 'Fare_CheckRules')).toBe(false);
    expect(res.body.fareRules).toBeUndefined();
  });

  it('refuses a carrier this office cannot ticket, as the stateless check always did', async () => {
    const offer = await offerFrom('mptbs-oneway-jfk-lhr');
    vi.stubEnv('AMADEUS_WS_UNTICKETABLE_CARRIERS', offer.validatingAirlineCodes[0]);
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: offer, withFareRules: true });

    // Refused before any session was opened, and never priced another way.
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FARE_UNAVAILABLE');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('answers a fare it cannot price as FARE_UNAVAILABLE, without pricing it again statelessly', async () => {
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: { id: '1', _ama: {} }, withFareRules: true });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FARE_UNAVAILABLE');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('still checks the price on its own when the session cannot be had', async () => {
    axios.post
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(reply(fixture('informative-pricing')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr'), withFareRules: true });

    expect(res.status).toBe(200);
    expect(pricings().at(-1)).toEqual({ op: 'Fare_InformativePricingWithoutPNR', session: 'none' });
    // The thinner rule text informative pricing carries, rather than nothing.
    expect(res.body.fareRules.fareRules.length).toBeGreaterThan(0);
  });
});

describe('an answer from Amadeus is never asked again without a session', () => {
  // Amadeus answering the in-session pricing with an error it maps to no
  // refusal (a 502) is still its answer about this offer. The fallback priced
  // it again statelessly - the same pair the certification review flagged.
  const pricingError = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3"><soap:Header><awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header><soap:Body><Fare_InformativePricingWithoutPNRReply xmlns="http://xml.amadeus.com/TIPNRR_24_3_1A"><errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>1</errorCode><errorCategory>EC</errorCategory></errorDetails></errorOrWarningCodeDetails><errorWarningDescription><freeText>NO VALID FARE/RULE COMBINATIONS FOR PRICING</freeText></errorWarningDescription></errorGroup></Fare_InformativePricingWithoutPNRReply></soap:Body></soap:Envelope>`;
  const signOut = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3"><soap:Header><awsse:Session TransactionStatusCode="End"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>2</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header><soap:Body><Security_SignOutReply xmlns="http://xml.amadeus.com/VLSSOR_04_1_1A"><processStatus><statusCode>P</statusCode></processStatus></Security_SignOutReply></soap:Body></soap:Envelope>`;

  it('answers the error it got, having priced once, in the session', async () => {
    axios.post
      .mockResolvedValueOnce(reply(pricingError))
      .mockResolvedValue(reply(signOut));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr'), withFareRules: true });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(pricings()).toEqual([{ op: 'Fare_InformativePricingWithoutPNR', session: 'Start' }]);
  });
});

describe('/fare-rules is unchanged for the mobile app', () => {
  it('answers bags, rules and a cancellation policy as before', async () => {
    axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/fare-rules')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr') });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body).sort()).toEqual(['bags', 'cancellation', 'fareRules', 'success']);
    expect(res.body.cancellation.refundable).toBe(false);
  });
});
