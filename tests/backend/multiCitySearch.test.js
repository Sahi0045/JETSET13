import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMasterPricerBody } from '../../backend/services/amadeusSoap/operations/masterPricer.js';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { get as cacheGet } from '../../backend/services/cache.service.js';

const inDays = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const ddmmyy = (iso) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`;

const threeLegs = () => [
  { from: 'DEL', to: 'DXB', departDate: inDays(30) },
  { from: 'DXB', to: 'LHR', departDate: inDays(34) },
  { from: 'LHR', to: 'DEL', departDate: inDays(41) },
];

describe('the Master Pricer request for a multi-city trip', () => {
  it('sends one itinerary per leg, numbered from 1, with each leg its own places and date', () => {
    const legs = threeLegs();
    const xml = buildMasterPricerBody({
      legs: legs.map((leg) => ({ ...leg, fromIsCity: false, toIsCity: leg.to === 'LHR' ? false : false })),
      adults: 1,
    });

    expect(xml.match(/<itinerary>/g)).toHaveLength(3);
    legs.forEach((leg, index) => {
      const itinerary = xml.split('<itinerary>')[index + 1];
      expect(itinerary).toContain(`<segRef>${index + 1}</segRef>`);
      expect(itinerary).toContain(`<depMultiCity><locationId>${leg.from}</locationId>`);
      expect(itinerary).toContain(`<arrivalMultiCity><locationId>${leg.to}</locationId>`);
      expect(itinerary).toContain(`<date>${ddmmyy(leg.departDate)}</date>`);
    });
  });

  it('qualifies a metro code as a city on the leg that has it', () => {
    const xml = buildMasterPricerBody({
      legs: [
        { from: 'DEL', to: 'LON', departDate: inDays(30), toIsCity: true },
        { from: 'LON', to: 'NYC', departDate: inDays(35), fromIsCity: true, toIsCity: true },
      ],
      adults: 1,
    });

    const second = xml.split('<itinerary>')[2];
    expect(second).toContain('<locationId>LON</locationId><airportCityQualifier>C</airportCityQualifier>');
    expect(second).toContain('<locationId>NYC</locationId><airportCityQualifier>C</airportCityQualifier>');
  });

  it('a one-way and a round trip are built exactly as before', () => {
    const oneWay = buildMasterPricerBody({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', adults: 1 });
    const roundTrip = buildMasterPricerBody({ from: 'JFK', to: 'LHR', departDate: '2026-11-15', returnDate: '2026-11-22', adults: 1 });

    expect(oneWay.match(/<itinerary>/g)).toHaveLength(1);
    expect(roundTrip.match(/<itinerary>/g)).toHaveLength(2);
    expect(roundTrip.split('<itinerary>')[2]).toContain('<depMultiCity><locationId>LHR</locationId>');
  });
});

const flight = (id, from, to, at) => ({
  id, carrierCode: 'EK', number: `50${id}`, aircraft: { code: '77W' }, numberOfStops: 0,
  departure: { iataCode: from, at: `${at}T09:00:00` },
  arrival: { iataCode: to, at: `${at}T13:00:00` },
});

const multiCityOffer = (legs) => ({
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: legs.map((leg, index) => ({ duration: 'PT4H', segments: [flight(String(index + 1), leg.from, leg.to, leg.departDate)] })),
  price: { currency: 'USD', total: '991.00', grandTotal: '991.00', base: '700.00', fees: [] },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '991.00', base: '700.00' },
    fareDetailsBySegment: legs.map((_, index) => ({ segmentId: String(index + 1), cabin: 'ECONOMY', fareBasis: 'YOWAE', class: 'Y' })),
  }],
});

let searchFlights;

async function appWithProvider() {
  searchFlights = vi.fn(async (params) => ({ success: true, data: [multiCityOffer(params.legs || threeLegs())], dictionaries: {} }));
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { searchFlights },
    providerStatus: () => ({ bookingEnabled: false, wsap: '1ASIWTEST' }),
  }));
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.resetModules();
  cacheGet.mockClear();
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('POST /api/flights/search with legs', () => {
  it('resolves every leg and hands the provider the legs', async () => {
    const app = await appWithProvider();
    const legs = threeLegs();

    const res = await request(app).post('/api/flights/search').send({
      tripType: 'multiCity',
      legs: [{ ...legs[0], from: 'Delhi' }, legs[1], legs[2]],
      adults: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const sent = searchFlights.mock.calls[0][0];
    expect(sent.legs).toEqual(legs);
    expect(sent.returnDate).toBeUndefined();
    expect(res.body.meta.searchParams.legs).toEqual(legs);
    expect(res.body.data[0].originalOffer.itineraries).toHaveLength(3);
  });

  it('does not share a cache entry with the one-way search of its first leg', async () => {
    const app = await appWithProvider();
    const legs = threeLegs();

    await request(app).post('/api/flights/search').send({ from: 'DEL', to: 'DXB', departDate: legs[0].departDate, adults: 1 });
    await request(app).post('/api/flights/search').send({ tripType: 'multiCity', legs, adults: 1 });

    const [oneWayKey, multiCityKey] = cacheGet.mock.calls.map(([key]) => key);
    expect(multiCityKey).not.toBe(oneWayKey);
    expect(multiCityKey).toContain('DXB-LHR');
  });

  it('names the leg it cannot place', async () => {
    const app = await appWithProvider();
    const legs = threeLegs();

    const res = await request(app).post('/api/flights/search').send({
      tripType: 'multiCity',
      legs: [legs[0], { ...legs[1], to: 'Qwertyville' }],
      adults: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_PLACE');
    expect(res.body.error).toContain('Qwertyville');
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it.each([
    ['one leg', () => [threeLegs()[0]], /2 to 6 flights/],
    ['seven legs', () => Array.from({ length: 7 }, (_, i) => ({ from: i % 2 ? 'DXB' : 'DEL', to: i % 2 ? 'DEL' : 'DXB', departDate: inDays(30 + i) })), /2 to 6 flights/],
    ['a leg before the one before it', () => { const l = threeLegs(); l[1].departDate = inDays(20); return l; }, /Flight 2/],
    ['a leg in the past', () => { const l = threeLegs(); l[0].departDate = inDays(-5); return l; }, /Flight 1/],
    ['a leg to where it starts', () => { const l = threeLegs(); l[2].to = 'LHR'; return l; }, /Flight 3/],
  ])('refuses %s', async (_name, legsOf, message) => {
    const app = await appWithProvider();

    const res = await request(app).post('/api/flights/search').send({ tripType: 'multiCity', legs: legsOf(), adults: 1 });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(message);
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it('refuses legs with a return date', async () => {
    const app = await appWithProvider();

    const res = await request(app).post('/api/flights/search').send({ tripType: 'multiCity', legs: threeLegs(), returnDate: inDays(50), adults: 1 });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/return date/i);
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it('a one-way search still needs from, to and a date', async () => {
    const app = await appWithProvider();

    const res = await request(app).post('/api/flights/search').send({ from: 'DEL', adults: 1 });

    expect(res.status).toBe(400);
  });
});

describe('the provider request for legs', () => {
  it('resolves each leg and marks metro codes', async () => {
    const { searchRequestFor } = await import('../../backend/services/amadeusSoap/index.js');
    const [first, second] = [inDays(30), inDays(36)];

    const req = searchRequestFor({
      legs: [{ from: 'Delhi', to: 'LON', departDate: first }, { from: 'LON', to: 'DEL', departDate: second }],
      adults: 1,
      returnDate: inDays(50),
    }, { currency: 'USD' });

    expect(req.legs).toEqual([
      { from: 'DEL', to: 'LON', departDate: first, fromIsCity: false, toIsCity: true },
      { from: 'LON', to: 'DEL', departDate: second, fromIsCity: true, toIsCity: false },
    ]);
    expect(req.returnDate).toBeUndefined();
    expect(buildMasterPricerBody(req).match(/<itinerary>/g)).toHaveLength(2);
  });

  it('names the leg it cannot place', async () => {
    const { searchRequestFor } = await import('../../backend/services/amadeusSoap/index.js');

    expect(() => searchRequestFor({
      legs: [{ from: 'DEL', to: 'DXB', departDate: inDays(30) }, { from: 'DXB', to: 'Qwertyville', departDate: inDays(33) }],
      adults: 1,
    }, { currency: 'USD' })).toThrow(/Qwertyville/);
  });
});
