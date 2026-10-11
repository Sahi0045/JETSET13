import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const table = {
  currency: 'USD',
  bookBy: null,
  change: { before: { allowed: true, amount: 336, varies: false } },
  refund: { before: { allowed: false, amount: 0, varies: false } },
};
const booking = { booking_reference: 'FLTFEES1', booking_details: { pnr: '2OY43E' } };

let getBookedFeeTable;
let cache;

const service = async () => {
  vi.resetModules();
  vi.doMock('../../backend/services/flightProvider.js', () => ({ default: { getBookedFeeTable } }));
  cache = await import('../../backend/services/cache.service.js');
  return import('../../backend/services/bookedFeeTable.service.js');
};

beforeEach(() => {
  getBookedFeeTable = vi.fn(async () => table);
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('readBookedFeeTable', () => {
  it('asks nobody about a booking with no PNR', async () => {
    const { readBookedFeeTable } = await service();

    expect(await readBookedFeeTable({ booking_reference: 'X', booking_details: {} })).toBeNull();
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('answers from the cache without an Amadeus session', async () => {
    const { readBookedFeeTable, bookedFeeTableKey } = await service();
    cache.get.mockResolvedValueOnce(table);

    expect(await readBookedFeeTable(booking)).toEqual(table);
    expect(cache.get).toHaveBeenCalledWith(bookedFeeTableKey('FLTFEES1'));
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('reads the PNR and keeps the answer for six hours', async () => {
    const { readBookedFeeTable, BOOKED_FEE_TABLE_TTL_SECONDS } = await service();

    expect(await readBookedFeeTable(booking)).toEqual(table);
    expect(getBookedFeeTable).toHaveBeenCalledWith('2OY43E');
    expect(BOOKED_FEE_TABLE_TTL_SECONDS).toBe(6 * 60 * 60);
    expect(cache.set).toHaveBeenCalledWith('flight:booked-fee-table:FLTFEES1', table, BOOKED_FEE_TABLE_TTL_SECONDS);
  });

  it('answers null, and caches nothing, when the airline does not answer', async () => {
    getBookedFeeTable = vi.fn(async () => { throw new Error('session refused'); });
    const { readBookedFeeTable } = await service();

    expect(await readBookedFeeTable(booking)).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('caches nothing when the PNR has no fee table', async () => {
    getBookedFeeTable = vi.fn(async () => null);
    const { readBookedFeeTable } = await service();

    expect(await readBookedFeeTable(booking)).toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
