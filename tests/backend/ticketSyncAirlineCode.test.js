import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

let patched;
let stored;

vi.mock('../../backend/routes/flight.routes.js', () => ({
  patchBookingDetails: vi.fn(async (reference, patch) => {
    const changes = typeof patch === 'function' ? patch(stored) : patch;
    stored = { ...stored, ...changes };
    patched.push({ reference, changes });
    return [{ booking_reference: reference }];
  }),
}));

const PRD = 'nodea2.production.webservices.amadeus.com';
const PDT = 'nodea2.test.webservices.amadeus.com';

const row = (reference, details = {}, over = {}) => ({
  booking_reference: reference,
  status: 'confirmed',
  payment_status: 'paid',
  created_at: '2026-10-10T00:00:00Z',
  booking_details: {
    pnr: 'Q7XK2M',
    departure_date: '2026-12-01',
    gds: { ticketed: true, node: PRD },
    tickets: [{ number: '016-7491175288', travelerId: '1' }],
    ...details,
  },
  ...over,
});

const providerAnswering = (order) => ({
  getFlightOrderDetails: vi.fn(async () => ({ success: true, data: order, pnr: 'Q7XK2M' })),
});

let job;

beforeEach(async () => {
  patched = [];
  stored = {};
  vi.resetModules();
  job = await import('../../backend/jobs/ticketSync.job.js');
});

describe('a ticket recorded by ticket sync', () => {
  it("also records the airline's own booking code", async () => {
    const unticketed = row('FLT-1', { gds: { ticketed: false, node: PRD }, tickets: [] });
    stored = { ...unticketed.booking_details };
    const provider = providerAnswering({
      tickets: [{ number: '016-7491175288', travelerId: '1' }],
      travelers: [{ id: '1', name: { firstName: 'ASHA', lastName: 'RAO' } }],
      airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }],
    });

    const result = await job.syncOne(unticketed, { provider, sendEmail: vi.fn(async () => ({ success: true })) });

    expect(result.outcome).toBe('recorded');
    expect(patched[0].changes.airline_locators).toEqual([{ carrierCode: 'UA', locator: 'H8KQ2P' }]);
  });
});

describe("an earlier booking without the airline's code", () => {
  it('gets it from its PNR, once', async () => {
    const booking = row('FLT-2');
    const provider = providerAnswering({ airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] });

    const result = await job.fillAirlineCode(booking, { provider });

    expect(provider.getFlightOrderDetails).toHaveBeenCalledWith('Q7XK2M');
    expect(result.outcome).toBe('airline-code-recorded');
    expect(patched[0].changes.airline_locators).toEqual([{ carrierCode: 'UA', locator: 'H8KQ2P' }]);
    expect(patched[0].changes.airline_locators_checked_at).toEqual(expect.any(String));
  });

  it('is marked asked when the PNR carries none, and not asked again', async () => {
    const result = await job.fillAirlineCode(row('FLT-3'), { provider: providerAnswering({ airlineLocators: [] }) });

    expect(result.outcome).toBe('no-airline-code');
    expect(patched[0].changes).not.toHaveProperty('airline_locators');
    expect(patched[0].changes.airline_locators_checked_at).toEqual(expect.any(String));
  });

  it('is marked asked when the PNR cannot be read, so a purged PNR is not asked for ever', async () => {
    const provider = { getFlightOrderDetails: vi.fn(async () => { throw Object.assign(new Error('NO MATCH'), { technicalError: '284' }); }) };

    const result = await job.fillAirlineCode(row('FLT-4'), { provider });

    expect(result.outcome).toBe('unreadable');
    expect(patched[0].changes).toEqual({ airline_locators_checked_at: expect.any(String) });
  });
});

describe('which earlier bookings are asked about', () => {
  const find = async (rows) => {
    const table = fakeBookingsTable(rows);
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(table.from);
    return (await job.findMissingAirlineCode({ today: '2026-10-25', node: PRD })).map((r) => r.booking_reference);
  };

  it('asks about a ticketed, upcoming booking made on this Amadeus system', async () => {
    expect(await find([row('FLT-5')])).toEqual(['FLT-5']);
  });

  it('never asks about a booking made on the other Amadeus system', async () => {
    expect(await find([row('FLT-6', { gds: { ticketed: true, node: PDT } })])).toEqual([]);
    expect(await find([row('FLT-7', { gds: { ticketed: true } })])).toEqual([]);
  });

  it('leaves alone a booking that has the code, was asked already, has flown, is cancelled or has no ticket', async () => {
    expect(await find([
      row('FLT-8', { airline_locators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] }),
      row('FLT-9', { airline_locators_checked_at: '2026-10-24T00:00:00Z' }),
      row('FLT-10', { departure_date: '2026-10-01' }),
      row('FLT-11', {}, { status: 'cancelled' }),
      row('FLT-12', { gds: { ticketed: false, node: PRD }, tickets: [] }),
    ])).toEqual([]);
  });

  it('asks about one saved with an empty list', async () => {
    expect(await find([row('FLT-13', { airline_locators: [] })])).toEqual(['FLT-13']);
  });
});
