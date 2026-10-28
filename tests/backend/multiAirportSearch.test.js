import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePlaces } from '../../backend/services/airportsIndex.js';
import { searchRequestFor } from '../../backend/services/amadeusSoap/index.js';
import { buildMasterPricerBody } from '../../backend/services/amadeusSoap/operations/masterPricer.js';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { get as cacheGet } from '../../backend/services/cache.service.js';

/**
 * Several airports on one side of a search, ticked as on booking.com: "JFK,EWR"
 * searches New York JFK and Newark together. Master Pricer takes up to 50
 * depMultiCity / arrivalMultiCity per side (Fare_MasterPricerTravelBoardSearch
 * 24.6 XSD); PDT answered JFK,EWR -> LAX with fares from both (28 Oct).
 */

const inDays = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

describe('the places one side names', () => {
  it.each([
    ['JFK,EWR', ['JFK', 'EWR']],
    ['jfk, ewr , lga', ['JFK', 'EWR', 'LGA']],
    ['JFK,JFK', ['JFK']],
    ['LON,PAR', ['LON', 'PAR']],
    ['JFK', ['JFK']],
    ['San Francisco, CA', ['SFO']],
  ])('%s is %j', (text, codes) => {
    expect(resolvePlaces(text)).toEqual(codes);
  });

  it('is nothing when one of them is not a place, or there are more than six', () => {
    expect(resolvePlaces('JFK,XQZ')).toBeNull();
    expect(resolvePlaces('JFK,EWR,LGA,BOS,PHL,DCA,IAD')).toBeNull();
  });
});

describe('the Master Pricer request', () => {
  it('names every airport of a side, and the return leg flies back to them', () => {
    const xml = buildMasterPricerBody(searchRequestFor({ from: 'JFK,EWR', to: 'LON', departDate: inDays(30), returnDate: inDays(37), adults: 1 }, { currency: 'USD' }));
    const [, outbound, back] = xml.split('<itinerary>');

    expect(outbound).toContain('<departureLocalization><depMultiCity><locationId>JFK</locationId><airportCityQualifier>A</airportCityQualifier></depMultiCity><depMultiCity><locationId>EWR</locationId><airportCityQualifier>A</airportCityQualifier></depMultiCity></departureLocalization>');
    expect(outbound).toContain('<arrivalMultiCity><locationId>LON</locationId><airportCityQualifier>C</airportCityQualifier></arrivalMultiCity>');
    expect(back).toContain('<depMultiCity><locationId>LON</locationId><airportCityQualifier>C</airportCityQualifier></depMultiCity>');
    expect(back.match(/<arrivalMultiCity>/g)).toHaveLength(2);
  });

  it('refuses a side with a place it cannot find', () => {
    expect(() => searchRequestFor({ from: 'JFK,XQZ', to: 'LAX', departDate: inDays(30), adults: 1 })).toThrow();
  });
});

let searchFlights;

async function appWithProvider() {
  searchFlights = vi.fn(async () => ({ success: true, data: [], dictionaries: {} }));
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

describe('POST /api/flights/search with several airports', () => {
  it('searches them all, under a cache entry of their own', async () => {
    const app = await appWithProvider();
    const departDate = inDays(30);

    const res = await request(app).post('/api/flights/search').send({ from: 'JFK,EWR', to: 'LAX', departDate, adults: 1 });
    await request(app).post('/api/flights/search').send({ from: 'JFK', to: 'LAX', departDate, adults: 1 });

    expect(res.status).toBe(200);
    expect(searchFlights.mock.calls[0][0]).toMatchObject({ from: 'JFK,EWR', to: 'LAX' });
    const [both, one] = cacheGet.mock.calls.map(([key]) => key);
    expect(both).not.toBe(one);
  });

  it('names the place it cannot find', async () => {
    const app = await appWithProvider();

    const res = await request(app).post('/api/flights/search').send({ from: 'JFK,XQZ', to: 'LAX', departDate: inDays(30), adults: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_PLACE');
    expect(searchFlights).not.toHaveBeenCalled();
  });
});
