import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';

/**
 * Fares on airlines the office cannot ticket are not sold.
 *
 * On PDT, 15 Sep 2026, every airline on office SCK1S2400's list was booked end
 * to end. DocIssuance_IssueTicket refused AI (2161), GF (8100), AW, and BF CY EN
 * HF JX KC KU LG NT SQ SS (ETKT: NOT AUTHORISED) - the point at which a real
 * customer has already paid. Search offered every one of them.
 */

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const REQUIRED_ENV = {
  AMADEUS_WS_ENDPOINT: 'https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC',
  AMADEUS_WS_WSAP: '1ASIWJETJEC',
  AMADEUS_WS_USERNAME: 'WSTEST',
  AMADEUS_WS_PASSWORD: 'pw',
  AMADEUS_WS_OFFICE_ID: 'SCK1S2400',
};

const airIndiaOffer = () => ({
  id: '1',
  price: { total: '80.20', currency: 'USD' },
  validatingAirlineCodes: ['AI'],
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
  _ama: {
    wsap: '1ASIWJETJEC',
    paxRefs: [{ ref: '1', ptc: 'ADT' }],
    segments: [{
      legIndex: 0, boardPoint: 'DEL', offPoint: 'BOM', departureDate: '270926', departureTime: '1730',
      marketingCarrier: 'AI', flightNumber: '1736', rbd: 'T',
    }],
  },
});

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const [name, value] of Object.entries(REQUIRED_ENV)) vi.stubEnv(name, value);
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
});

describe('the carriers the office cannot ticket', () => {
  it('default to the ones issuance refused on PDT', async () => {
    const { getWsConfig } = await import('../../../backend/services/amadeusSoap/config.js');

    const { unticketableCarriers } = getWsConfig({ ...REQUIRED_ENV });

    expect(unticketableCarriers).toEqual([
      'AI', 'GF', 'AW', 'BF', 'CY', 'EN', 'HF', 'JX', 'KC', 'KU', 'LG', 'NT', 'SQ', 'SS',
      'CX', 'EK', 'QF', 'UL', 'VN',
    ]);
    // A link or timing failure is not a refusal of authority.
    expect(unticketableCarriers).not.toContain('CZ');
    expect(unticketableCarriers).not.toContain('BI');
    // Off the office's list but ticketed on PDT.
    for (const ticketed of ['TK', 'TG', 'WY', 'VS']) expect(unticketableCarriers).not.toContain(ticketed);
  });

  it('come from the environment when it sets them', async () => {
    const { getWsConfig } = await import('../../../backend/services/amadeusSoap/config.js');

    expect(getWsConfig({ ...REQUIRED_ENV, AMADEUS_WS_UNTICKETABLE_CARRIERS: 'ai, gf  SQ,,x' }).unticketableCarriers)
      .toEqual(['AI', 'GF', 'SQ']);
  });

  it('are none when the environment sets the list empty', async () => {
    const { getWsConfig } = await import('../../../backend/services/amadeusSoap/config.js');

    expect(getWsConfig({ ...REQUIRED_ENV, AMADEUS_WS_UNTICKETABLE_CARRIERS: '' }).unticketableCarriers).toEqual([]);
  });

  it('are shown on the health endpoint', async () => {
    const { describeWsConfig } = await import('../../../backend/services/amadeusSoap/config.js');

    expect(describeWsConfig({ ...REQUIRED_ENV, AMADEUS_WS_UNTICKETABLE_CARRIERS: 'AI' }).unticketableCarriers).toEqual(['AI']);
  });
});

describe('fares on those carriers', () => {
  const search = async () => {
    const routes = (await import('../../../backend/routes/flight.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/flights', routes);
    app.use(errorHandler);
    axios.post.mockReset();
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const res = await request(app)
      .post('/api/flights/search')
      .send({ from: 'JFK', to: 'LHR', departDate: inDays(60), adults: 1 });
    return (res.body.data ?? []).map((card) => card.originalOffer?.validatingAirlineCodes?.[0]);
  };

  it('are left out of search', async () => {
    vi.stubEnv('AMADEUS_WS_UNTICKETABLE_CARRIERS', '');
    const everything = await search();
    const listed = everything[0];
    expect(everything.length).toBeGreaterThan(1);
    expect(listed).toBeTruthy();

    vi.stubEnv('AMADEUS_WS_UNTICKETABLE_CARRIERS', listed);
    vi.resetModules();
    const offered = await search();

    expect(offered).not.toContain(listed);
    expect(offered).toEqual(everything.filter((carrier) => carrier !== listed));
  });

  it('are refused at pricing, before Amadeus is called, as a fare checkout cannot sell', async () => {
    vi.stubEnv('AMADEUS_WS_UNTICKETABLE_CARRIERS', 'AI');
    const provider = (await import('../../../backend/services/amadeusSoap/index.js')).default;
    const { isFareRefusal } = await import('../../../backend/services/flightCheckout.service.js');
    axios.post.mockReset();

    const error = await provider.priceFlightOffer(airIndiaOffer()).catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 409 });
    expect(error.technicalError).toContain('AI');
    expect(isFareRefusal(error)).toBe(true);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('are refused by the booking chain before any seat is sold', async () => {
    vi.stubEnv('AMADEUS_WS_UNTICKETABLE_CARRIERS', 'AI');
    const { runBookingChain } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    axios.post.mockReset();

    const error = await runBookingChain({
      offer: airIndiaOffer(),
      travelers: [{ firstName: 'Asha', lastName: 'Rao', ptc: 'ADULT', gender: 'FEMALE' }],
      expectedTotal: 80.2,
    }).catch((e) => e);

    expect(error).toMatchObject({ step: 'validate', code: 409 });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('are priced as before when the carrier is not listed', async () => {
    vi.stubEnv('AMADEUS_WS_UNTICKETABLE_CARRIERS', 'SQ');
    const provider = (await import('../../../backend/services/amadeusSoap/index.js')).default;
    axios.post.mockReset();
    axios.post.mockResolvedValue(reply(fixture('informative-pricing')));

    await provider.priceFlightOffer(airIndiaOffer()).catch(() => null);

    expect(axios.post).toHaveBeenCalled();
  });
});
