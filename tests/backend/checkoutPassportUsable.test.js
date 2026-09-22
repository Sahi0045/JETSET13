import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookingTravellerProblems } from '../../shared/travellerDetails.js';
import { buildDocsFreetext } from '../../backend/services/amadeusSoap/operations/travelDocs.js';

/**
 * Passport details checked for use, not only for presence.
 *
 * Checkout (verifyFlightCharge -> bookingTravellerProblems) required a
 * nationality, a passport number and an expiry after the last flight on a
 * trip abroad. The SSR DOCS builder (backend/services/amadeusSoap/operations/
 * travelDocs.js) then dropped any of them it could not use - a nationality
 * with no three-letter code, an expiry not written YYYY-MM-DD, a DOCS longer
 * than the element holds - and the booking went ahead with no passport record:
 * the airline refuses to ticket it (27791 SSR DOCS MISSING), after the charge.
 *
 * Checkout now asks the builder itself, with the traveller as the order route
 * hands them to it, and refuses exactly what the builder drops - and nothing
 * else: every passport the builder writes still passes.
 */

const ABROAD = { international: true, passportRequired: true, travelDate: '2026-10-04', lastDate: '2026-10-25' };

const adult = (over = {}) => ({
  firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT',
  nationality: 'US', passportNumber: 'X1234567', passportExpiry: '2030-01-01', ...over,
});

/** The traveller as the order route builds them for the chain (flight.routes.js amadeusTravelers). */
const asBooked = (t) => ({
  firstName: String(t.firstName).trim(),
  lastName: String(t.lastName).trim(),
  dateOfBirth: t.dateOfBirth,
  gender: String(t.gender).trim().toUpperCase().startsWith('F') ? 'FEMALE' : 'MALE',
  ptc: t.type,
  documents: [{
    documentType: t.documentType || 'PASSPORT',
    number: t.passportNumber || '',
    expiryDate: t.passportExpiry || '',
    issuanceCountry: t.nationality || '',
    nationality: t.nationality || '',
    holder: true,
  }],
});

/** Whether the builder, handed this traveller at booking, would drop their passport. */
const builderDrops = (t) => {
  let dropped = false;
  const text = buildDocsFreetext(asBooked(t), { onUnusable: () => { dropped = true; } });
  return dropped || text === null;
};

/** Real passports the builder writes: they must pass. */
const realWorld = [
  ['United States, two-letter code', adult({ nationality: 'US', passportNumber: '546712345', passportExpiry: '2031-05-14' })],
  ['United Kingdom as GB', adult({ firstName: 'Oliver', lastName: 'Smith', gender: 'male', nationality: 'GB', passportNumber: '123456789', passportExpiry: '2032-02-29' })],
  ['India, lower-case code', adult({ firstName: 'Priya', lastName: 'Venkataraman', nationality: 'in', passportNumber: 'Z1234567' })],
  ['Germany, three-letter code', adult({ firstName: 'Jürgen', lastName: 'Müller-Lüdenscheidt', gender: 'male', nationality: 'DEU', passportNumber: 'C01X00T47' })],
  ['France, three-letter code', adult({ firstName: 'Anne-Marie', lastName: 'Dubois', nationality: 'FRA', passportNumber: '19AB12345' })],
  ['Brazil', adult({ firstName: 'João', lastName: 'da Silva Santos', gender: 'male', nationality: 'BR', passportNumber: 'FZ123456' })],
  ['Nigeria', adult({ firstName: 'Chukwuemeka', lastName: 'Okonkwo-Adeyemi', gender: 'male', nationality: 'NG', passportNumber: 'A12345678' })],
  ['Ireland, an apostrophe', adult({ firstName: 'Siobhan', lastName: "O'Brien", nationality: 'IE', passportNumber: 'PA1234567' })],
  ['India, an apostrophe', adult({ firstName: 'Clive', lastName: "D'Souza", gender: 'male', nationality: 'IN', passportNumber: 'M7654321' })],
  ['Saudi Arabia, a long name', adult({ firstName: 'Mohammed bin Abdullah bin Abdulaziz', lastName: 'Al Saud', gender: 'male', nationality: 'SA', passportNumber: 'Y123456' })],
  ['Spain, a long name', adult({ firstName: 'María de los Ángeles', lastName: 'Fernández de Córdoba y González de la Vega', nationality: 'ES', passportNumber: 'PAA123456' })],
  ['Thailand, a long name', adult({ firstName: 'Chaiyaporn', lastName: 'Suwannaphakdeechaiwongsakul', gender: 'male', nationality: 'TH', passportNumber: 'AA1234567' })],
  ['Japan', adult({ firstName: 'Haruka', lastName: 'Takahashi', nationality: 'JP', passportNumber: 'TK1234567' })],
  ['a number typed with spaces and a dash', adult({ nationality: 'CA', passportNumber: 'AB 123-456' })],
  ['a lap infant with a passport', adult({ firstName: 'Mia', dateOfBirth: '2025-06-01', type: 'HELD_INFANT', nationality: 'AU', passportNumber: 'PA7654321' })],
  ['any three letters, as the builder takes them', adult({ nationality: 'XYZ' })],
];

describe('a passport the DOCS builder would drop', () => {
  it('refuses exactly what the builder drops, and passes exactly what it writes', () => {
    const cases = [
      ...realWorld.map(([, traveller]) => traveller),
      ...['UK', 'Britain', 'Indian', 'XK', 'EU'].map((nationality) => adult({ nationality })),
      ...['25/12/2030', '2030-13-01', 'Dec 2030', '2030-12-25T00:00:00Z'].map((passportExpiry) => adult({ passportExpiry })),
      // 140 characters exactly, which the element holds, and 141, which it does not.
      adult({ firstName: 'A'.repeat(50), lastName: 'B'.repeat(50) }),
      adult({ firstName: 'A'.repeat(50), lastName: 'B'.repeat(51) }),
    ];
    for (const traveller of cases) {
      expect(bookingTravellerProblems(traveller, ABROAD).length > 0, JSON.stringify(traveller)).toBe(builderDrops(traveller));
    }
  });

  it('a nationality with no country code: refused, and told to pick it from the list', () => {
    for (const nationality of ['UK', 'Britain', 'Indian', 'South Africa']) {
      expect(builderDrops(adult({ nationality })), nationality).toBe(true);
      expect(bookingTravellerProblems(adult({ nationality }), ABROAD), nationality)
        .toEqual(['Select the nationality from the list, so the airline can read it.']);
    }
  });

  it('an expiry the builder cannot read: refused, and asked for again as a full date', () => {
    for (const passportExpiry of ['25/12/2030', '2030-13-01', 'Dec 2030']) {
      expect(builderDrops(adult({ passportExpiry })), passportExpiry).toBe(true);
      expect(bookingTravellerProblems(adult({ passportExpiry }), ABROAD), passportExpiry)
        .toEqual(['Enter the passport expiry date again as a full date (day, month and year).']);
    }
  });

  it('a DOCS longer than the element holds: refused, with what to do', () => {
    const long = adult({ firstName: 'Maximiliana Alejandra Guadalupe Concepcion Esperanza', lastName: 'Fernandez de Cordoba y Montenegro de la Santisima Trinidad' });
    expect(builderDrops(long)).toBe(true);
    expect(bookingTravellerProblems(long, ABROAD)).toEqual([
      'The names and passport number are too long together for the airline\'s passport record. '
        + 'Enter the names exactly as printed on the passport, without titles. If they already are, call (877) 538-7380 to book.',
    ]);
  });

  it('checkout refuses it before anything is charged', async () => {
    const { verifyFlightCharge } = await import('../../backend/services/flightCheckout.service.js');
    const offer = {
      id: '1',
      price: { total: '400.00', currency: 'USD' },
      itineraries: [
        { segments: [{ departure: { iataCode: 'JFK', at: '2026-10-04T18:00:00' }, arrival: { iataCode: 'LHR', at: '2026-10-05T06:00:00' } }] },
        { segments: [{ departure: { iataCode: 'LHR', at: '2026-10-25T10:00:00' }, arrival: { iataCode: 'JFK', at: '2026-10-25T13:00:00' } }] },
      ],
      travelerPricings: [{ travelerType: 'ADULT' }],
    };
    const client = { from: () => ({ select: () => ({ single: async () => ({ data: { settings: { flight_taxes_fees: 1, flight_taxes_fees_percentage: 0 } }, error: null }) }) }) };
    const priceOffer = vi.fn().mockResolvedValue({ price: { total: '400.00', base: '300.00', currency: 'USD' }, _ama: { international: true } });

    const result = await verifyFlightCharge({
      client, amount: 401, priceOffer, bookingData: { originalOffer: offer, passengerData: [adult({ nationality: 'UK' })] },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('PASSENGERS_INCOMPLETE');
    expect(result.message).toBe('Traveller 1: Select the nationality from the list, so the airline can read it. Nothing has been charged.');
  });
});

/**
 * Fence: real-world passports the builder writes, which must still pass - and
 * the rules around them, as on main.
 */
describe('fence: passports the builder writes still pass', () => {

  for (const [label, traveller] of realWorld) {
    it(label, () => {
      expect(builderDrops(traveller)).toBe(false);
      expect(bookingTravellerProblems(traveller, ABROAD)).toEqual([]);
    });
  }

  it('every country the review page offers, by its two-letter and its three-letter code', async () => {
    const { COUNTRIES } = await import('../../shared/countries.js');
    expect(COUNTRIES.length).toBeGreaterThan(190);
    for (const country of COUNTRIES) {
      for (const nationality of [country.code, country.alpha3]) {
        const traveller = adult({ nationality });
        expect(builderDrops(traveller), nationality).toBe(false);
        expect(bookingTravellerProblems(traveller, ABROAD), nationality).toEqual([]);
      }
    }
  });


  it('a missing nationality, number or expiry, and an expiry before the trip ends: the same words as before', () => {
    expect(bookingTravellerProblems(adult({ nationality: '' }), ABROAD)).toEqual(['Select a nationality.']);
    expect(bookingTravellerProblems(adult({ passportNumber: ' ' }), ABROAD)).toEqual(['Enter the passport number.']);
    expect(bookingTravellerProblems(adult({ passportExpiry: '' }), ABROAD)).toEqual(['Enter the passport expiry date.']);
    expect(bookingTravellerProblems(adult({ passportExpiry: '2026-10-15' }), ABROAD)).toEqual(['The passport expires before the trip ends.']);
  });

  it('no passport asked for, or checked, on a trip that does not cross a border', () => {
    const domestic = { international: false, travelDate: '2026-10-04', lastDate: '2026-10-25' };
    expect(bookingTravellerProblems(adult({ nationality: 'Britain', passportExpiry: '25/12/2030' }), domestic)).toEqual([]);
    expect(bookingTravellerProblems(adult({ nationality: '', passportNumber: '', passportExpiry: '' }), domestic)).toEqual([]);
  });

  it('a traveller refused for something else is told that first, as before', () => {
    expect(bookingTravellerProblems(adult({ gender: '', nationality: 'Britain' }), ABROAD)[0]).toBe('Select a gender.');
  });
});

beforeEach(() => {
  vi.resetModules();
});
