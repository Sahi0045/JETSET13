import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';

/**
 * The Phase 2 endpoints over HTTP, with Amadeus replaced by recorded XML.
 *
 * These responses are money. Admin pricing is applied on the client from what
 * these return - serviceFee = flight_taxes_fees + price.total * pct, charged =
 * total + fee - so a wrong total here is a wrong charge, not a display bug.
 */

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
const reply = (xml) => ({ status: 200, data: xml, headers: {} });

const makeApp = async () => {
  const routes = (await import('../../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
};

/** A search offer carrying _ama, which pricing needs to describe the segments. */
const offerFrom = async (searchFixture) => {
  const { mapMasterPricerReply } = await import('../../../backend/services/amadeusSoap/mappers/offer.js');
  const { parseSoap, unwrapEnvelope } = await import('../../../backend/services/amadeusSoap/parseXml.js');
  const { body } = unwrapEnvelope(parseSoap(fixture(searchFixture)));
  const reply = body[Object.keys(body).find((k) => k !== 'Fault')];
  const { offers } = mapMasterPricerReply(reply, {
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

describe('POST /api/flights/price', () => {
  it('returns the REST flight-offers-pricing envelope', async () => {
    axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr') });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('flight-offers-pricing');
    expect(res.body.data.flightOffers).toHaveLength(1);

    const price = res.body.data.flightOffers[0].price;
    expect(price).toMatchObject({ total: '291.00', base: '110.00', currency: 'USD' });
  });

  it('rejects an offer that did not come from this provider', async () => {
    const app = await makeApp();
    // A UI-shaped card with no _ama cannot be described to Amadeus.
    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: { id: '1', price: { total: '291.00' } } });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
    // A fare the airline cannot price is not an outage: checkout on Vercel
    // reads this code to say "search again" rather than "try again".
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FARE_UNAVAILABLE');
  });

  it('answers an outage as one, without the refused-fare code', async () => {
    axios.post.mockRejectedValue(new Error('network down'));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/price')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr') });

    expect(res.status).toBe(500);
    expect(res.body.code).toBeUndefined();
  });

  // Checkout asks for the seats to be confirmed before the charge. The review
  // page prices through this route on every load and must not sell each time.
  describe('confirming the seats', () => {
    const session = '<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session>';
    const sellReply = (...statuses) => `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3"><soap:Header>${session}</soap:Header><soap:Body><Air_SellFromRecommendationReply>`
      + `<itineraryDetails>${statuses.map((s) => `<segmentInformation><actionDetails><quantity>1</quantity><statusCode>${s}</statusCode></actionDetails></segmentInformation>`).join('')}</itineraryDetails>`
      + '</Air_SellFromRecommendationReply></soap:Body></soap:Envelope>';
    const signOut = '<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body><Security_SignOutReply/></soap:Body></soap:Envelope>';
    const sells = () => axios.post.mock.calls.filter(([, body]) => String(body).includes('<Air_SellFromRecommendation'));

    beforeEach(() => {
      vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
      // The seat check exists to protect a booking this host would make.
      vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    });

    // AMADEUS_WS_BOOKING_ENABLED false is the switch that says this deployment
    // makes no GDS writes. The seat check is one - Air_SellFromRecommendation
    // and Fare_PricePNRWithBookingClass - and anyone could ask for it here with
    // a request body flag, so seats were sold and released against the office
    // while booking was off, for checkouts that could only end in
    // BOOKING_DISABLED.
    it('does not sell while booking is switched off, whoever asks', async () => {
      vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
      axios.post.mockReset();
      axios.post
        .mockResolvedValueOnce(reply(fixture('informative-pricing')))
        .mockResolvedValueOnce(reply(sellReply('OK', 'OK')))
        .mockResolvedValue(reply(signOut));
      const app = await makeApp();

      const res = await request(app).post('/api/flights/price').send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr'), confirmSeats: true });

      expect(res.status).toBe(200);
      expect(res.body.meta.bookingEnabled).toBe(false);
      expect(res.body.meta.seatsConfirmed).toBe(false);
      expect(sells()).toHaveLength(0);
    });

    it('does not sell when the request does not ask', async () => {
      axios.post.mockReset();
      axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
      const app = await makeApp();

      const res = await request(app).post('/api/flights/price').send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr') });

      expect(res.status).toBe(200);
      expect(res.body.meta.seatsConfirmed).toBe(false);
      expect(sells()).toHaveLength(0);
    });

    it('prices, then confirms the seats, when checkout asks', async () => {
      axios.post.mockReset();
      axios.post
        .mockResolvedValueOnce(reply(fixture('informative-pricing')))
        // Both flights of the connection: a reply confirming one of two is a
        // refusal (readAirSellReply).
        .mockResolvedValueOnce(reply(sellReply('OK', 'OK')))
        .mockResolvedValue(reply(signOut));
      const app = await makeApp();

      const res = await request(app).post('/api/flights/price').send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr'), confirmSeats: true });

      expect(res.status).toBe(200);
      expect(res.body.meta.seatsConfirmed).toBe(true);
      expect(sells()).toHaveLength(1);
    });

    it('answers seats the airline will not sell as FARE_UNAVAILABLE', async () => {
      axios.post.mockReset();
      axios.post
        .mockResolvedValueOnce(reply(fixture('informative-pricing')))
        .mockResolvedValueOnce(reply(sellReply('UNS')))
        .mockResolvedValue(reply(signOut));
      const app = await makeApp();

      const res = await request(app).post('/api/flights/price').send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr'), confirmSeats: true });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('FARE_UNAVAILABLE');
    });

    it('skips the check when it is switched off', async () => {
      vi.stubEnv('AMADEUS_WS_SEAT_CHECK_BEFORE_PAYMENT', 'false');
      axios.post.mockReset();
      axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
      const app = await makeApp();

      const res = await request(app).post('/api/flights/price').send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr'), confirmSeats: true });

      expect(res.status).toBe(200);
      expect(res.body.meta.seatsConfirmed).toBe(false);
      expect(sells()).toHaveLength(0);
    });
  });

  it('requires a flightOffer', async () => {
    const app = await makeApp();
    const res = await request(app).post('/api/flights/price').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/flights/fare-rules', () => {
  it('populates bags, rules and a cancellation policy', async () => {
    axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/fare-rules')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr') });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.bags)).toBe(true);
    expect(res.body.fareRules.length).toBeGreaterThan(0);
    for (const rule of res.body.fareRules) {
      expect(rule).toMatchObject({ title: expect.any(String), text: expect.any(String) });
    }
  });

  // The panel used to default to INR while the fare was USD, which is the one
  // currency ARC Pay cannot charge.
  it('reports the cancellation policy in the fare currency', async () => {
    axios.post.mockResolvedValue(reply(fixture('informative-pricing')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/fare-rules')
      .send({ flightOffer: await offerFrom('mptbs-oneway-jfk-lhr') });

    expect(res.body.cancellation.currency).toBe('USD');
    expect(res.body.cancellation.fareCurrency).toBe('USD');
    expect(res.body.cancellation.refundable).toBe(false);   // fixture is NON-REFUNDABLE
  });
});

describe('calendar endpoints', () => {
  it('prices each requested date', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/date-prices')
      .send({ from: 'JFK', to: 'LHR', dates: ['2026-11-15', '2026-11-16'], adults: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body.dateWisePrices)).toHaveLength(2);
    expect(res.body.lowestPrice).toBeGreaterThan(0);
    expect(res.body.currency).toBe('USD');
  });

  it('caps the fan-out so a calendar cannot become dozens of GDS calls', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const dates = Array.from({ length: 31 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    await request(app).post('/api/flights/calendar-prices')
      .send({ origin: 'JFK', destination: 'LHR', dates });

    // Fare_MasterPricerCalendar is not permitted on this WSAP, so each date
    // costs a search. Without a cap a month view would be 31 of them.
    expect(axios.post.mock.calls.length).toBeLessThanOrEqual(10);
  });

  // Taking the first ten dates blanked days 11-31 of the month, because the
  // fare calendar posts the whole month and only the prefix came back priced.
  it('spreads the capped sample across the whole month, not just the start', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    const dates = Array.from({ length: 30 }, (_, i) => `2099-11-${String(i + 1).padStart(2, '0')}`);
    const res = await request(app).post('/api/flights/calendar-prices')
      .send({ origin: 'JFK', destination: 'LHR', dates });

    const priced = Object.keys(res.body.prices).sort();
    expect(priced.length).toBeGreaterThan(0);
    // First and last day of the range are both represented, and the sample
    // reaches past the first third of the month.
    expect(priced[0]).toBe('2099-11-01');
    expect(priced[priced.length - 1]).toBe('2099-11-30');
    expect(priced.some((d) => d > '2099-11-20')).toBe(true);
  });

  // Dates in the past cannot be priced; spending a capped slot on one costs a
  // live GDS call and returns nothing.
  it('does not spend cap slots on dates that have already passed', async () => {
    axios.post.mockResolvedValue(reply(fixture('mptbs-oneway-jfk-lhr')));
    const app = await makeApp();

    await request(app).post('/api/flights/calendar-prices').send({
      origin: 'JFK',
      destination: 'LHR',
      dates: ['2020-01-01', '2020-01-02', '2020-01-03', '2099-11-01'],
    });

    expect(axios.post.mock.calls.length).toBe(1);
  });

  // withCache stores any non-null value, so returning {success:false} from the
  // provider pinned one transient WSAP failure in Redis for six hours and every
  // visitor got an empty strip until it expired.
  it('does not cache an empty result when nothing could be priced', async () => {
    const { withCache } = await import('../../../backend/services/cache.service.js');
    axios.post.mockRejectedValue(new Error('amadeus unreachable'));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/calendar-prices')
      .send({ origin: 'JFK', destination: 'LHR', dates: ['2099-11-01'] });

    expect(res.body.success).toBe(false);
    expect(res.body.prices).toEqual({});

    // Each date is priced under Promise.allSettled, so a total outage looks
    // like "no prices" rather than an error. The producer must hand back null
    // so withCache stores nothing - otherwise one blip pins an empty strip in
    // Redis for six hours.
    const producer = withCache.mock.calls.at(-1)?.[2];
    await expect(producer()).resolves.toBeNull();
  });

  it('rejects a request with no dates before calling Amadeus', async () => {
    const app = await makeApp();
    const res = await request(app).post('/api/flights/date-prices').send({ from: 'JFK', to: 'LHR' });

    expect(res.status).toBe(400);
    expect(axios.post).not.toHaveBeenCalled();
  });

  // Advisory endpoints: the date strip shows no prices rather than breaking the
  // page it sits on.
  it('soft-fails rather than erroring when Amadeus is unavailable', async () => {
    axios.post.mockRejectedValue(new Error('network down'));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/date-prices')
      .send({ from: 'JFK', to: 'LHR', dates: ['2026-11-15'], adults: 1 });

    expect(res.status).toBe(200);
    expect(res.body.dateWisePrices).toEqual({});
  });
});
