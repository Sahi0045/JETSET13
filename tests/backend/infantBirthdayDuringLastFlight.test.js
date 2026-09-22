import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookingTravellerProblems, tripDates } from '../../shared/travellerDetails.js';

/**
 * An infant whose second birthday falls while the last flight is in the air.
 *
 * Infant fares are for travellers under 2 on every flight of the trip - their
 * age when each flight departs. The later age was read on the day the last
 * flight LANDS (tripDates' lastDate, which the passport rule needs), so a baby
 * on an overnight flight that leaves the day before the birthday and lands on
 * it was refused at checkout, and on the page before it, with no way to pay.
 * The age now goes by the day the last flight leaves; the passport still has
 * to last until it lands.
 */

// supabase-js as checkout reads it: the fee settings, and a booking row write
// that succeeds.
const rows = {};
const clientFor = () => ({
  from: vi.fn((table) => {
    const c = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update']) c[m] = vi.fn(() => c);
    c.upsert = vi.fn(() => ({ ...c, then: (resolve) => resolve({ data: null, error: null }) }));
    c.single = vi.fn(async () => ({ data: rows[table] ?? null, error: null }));
    c.maybeSingle = c.single;
    return c;
  }),
});
const verify = async (opts) => {
  const { verifyFlightCharge } = await import('../../backend/services/flightCheckout.service.js');
  return verifyFlightCharge({ client: clientFor(), ...opts });
};
const abroad = () => vi.fn().mockResolvedValue({ price: { total: '400.00', base: '300.00', currency: 'USD' }, _ama: { international: true } });

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(rows)) delete rows[key];
  rows.price_settings = { settings: { flight_taxes_fees: 1, flight_taxes_fees_percentage: 0 } };
});

const flight = (from, to, departAt, arriveAt) => ({ departure: { iataCode: from, at: departAt }, arrival: { iataCode: to, at: arriveAt } });

// JFK 22:00 on 15 Nov, LHR 10:00 on 16 Nov.
const overnight = [{ segments: [flight('JFK', 'LHR', '2026-11-15T22:00:00', '2026-11-16T10:00:00')] }];
// Out on 4 Oct; home LHR 22:00 on 15 Nov, JFK 01:00 on 16 Nov.
const roundTripHomeOvernight = [
  { segments: [flight('JFK', 'LHR', '2026-10-04T18:00:00', '2026-10-05T06:00:00')] },
  { segments: [flight('LHR', 'JFK', '2026-11-15T22:00:00', '2026-11-16T01:00:00')] },
];

const adult = { firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT', nationality: 'US', passportNumber: 'X1234567', passportExpiry: '2030-01-01' };
const infant = (dateOfBirth, over = {}) => ({ ...adult, firstName: 'Mia', dateOfBirth, type: 'HELD_INFANT', passportNumber: 'X7654321', ...over });

const booking = (itineraries, passengerData) => ({
  originalOffer: {
    id: '1',
    price: { total: '400.00', currency: 'USD' },
    itineraries,
    travelerPricings: passengerData.map((p, i) => ({ travelerId: String(i + 1), travelerType: p.type, ...(p.type === 'HELD_INFANT' ? { associatedAdultId: '1' } : {}) })),
  },
  passengerData,
});

describe('the days of a trip', () => {
  it('gives the day the last flight leaves as well as the day it lands', () => {
    expect(tripDates({ itineraries: overnight })).toEqual({ firstDate: '2026-11-15', lastDate: '2026-11-16', lastDepartureDate: '2026-11-15' });
    expect(tripDates({ itineraries: roundTripHomeOvernight }))
      .toEqual({ firstDate: '2026-10-04', lastDate: '2026-11-16', lastDepartureDate: '2026-11-15' });
  });

  it('falls back to the day it lands when the last flight has no departure time', () => {
    const noDeparture = [{ segments: [{ departure: { iataCode: 'JFK' }, arrival: { iataCode: 'LHR', at: '2026-11-16T10:00:00' } }] }];
    expect(tripDates({ itineraries: noDeparture }).lastDepartureDate).toBe('2026-11-16');
  });
});

describe('an infant who turns 2 while the last flight is in the air', () => {
  it('is accepted at checkout on a one-way overnight flight', async () => {
    const result = await verify({ amount: 401, bookingData: booking(overnight, [adult, infant('2024-11-16')]), priceOffer: abroad() });

    expect(result.message).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it('is accepted at checkout when the flight home is the overnight one', async () => {
    const result = await verify({ amount: 401, bookingData: booking(roundTripHomeOvernight, [adult, infant('2024-11-16')]), priceOffer: abroad() });

    expect(result.ok).toBe(true);
  });
});

describe('the rules around it, unchanged', () => {
  it('refuses an infant who turns 2 on the day the last flight leaves', async () => {
    const result = await verify({ amount: 401, bookingData: booking(roundTripHomeOvernight, [adult, infant('2024-11-15')]), priceOffer: abroad() });

    expect(result.code).toBe('PASSENGERS_INCOMPLETE');
    expect(result.message).toBe('Traveller 2: Infant fares are for travellers under 2 on every flight of the trip. '
      + 'To book an infant who turns 2 during the trip, call (877) 538-7380. Nothing has been charged.');
  });

  it('refuses an infant who turns 2 between the flight out and the flight home', async () => {
    const result = await verify({ amount: 401, bookingData: booking(roundTripHomeOvernight, [adult, infant('2024-10-20')]), priceOffer: abroad() });

    expect(result.code).toBe('PASSENGERS_INCOMPLETE');
    expect(result.message).toMatch(/^Traveller 2: Infant fares are for travellers under 2 on every flight of the trip\./);
  });

  it('refuses an infant already 2 when the first flight leaves', async () => {
    const result = await verify({ amount: 401, bookingData: booking(overnight, [adult, infant('2024-11-15')]), priceOffer: abroad() });

    expect(result.code).toBe('PASSENGERS_INCOMPLETE');
    expect(result.message).toMatch(/^Traveller 2: Infant fares are for travellers under 2 on the day of travel\./);
  });

  it('still wants the passport valid until the last flight lands', async () => {
    const result = await verify({
      amount: 401,
      bookingData: booking(overnight, [adult, infant('2025-06-01', { passportExpiry: '2026-11-16' })]),
      priceOffer: abroad(),
    });

    expect(result.code).toBe('PASSENGERS_INCOMPLETE');
    expect(result.message).toMatch(/The passport expires before the trip ends\./);
  });

  it('goes by the last day given when a caller passes no departure day', () => {
    const ctx = { type: 'HELD_INFANT', international: false, travelDate: '2026-11-15', lastDate: '2026-11-16' };
    expect(bookingTravellerProblems(infant('2024-11-16'), ctx)).toEqual([
      'Infant fares are for travellers under 2 on every flight of the trip. To book an infant who turns 2 during the trip, call (877) 538-7380.',
    ]);
  });

  it('keeps a child on a child fare whose 12th birthday falls on the day the last flight lands', async () => {
    const child = { ...adult, firstName: 'Tom', dateOfBirth: '2014-11-16', type: 'CHILD' };
    const bookingData = booking(overnight, [adult, child]);

    const result = await verify({ amount: 402, bookingData, priceOffer: abroad() });

    expect(result.ok).toBe(true);
  });
});
