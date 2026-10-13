import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { fareBreakdownOf, giveBackAllCoins, settleCoinsAfterBooking } from '../../backend/routes/flight.routes.js';

const REF = 'FLT1';
const booking = () => ({
  id: 'b1', booking_reference: REF, travel_type: 'flight', status: 'pending', payment_status: 'paid',
  booking_details: { order_id: REF, customer_email: 'jane@example.com' },
});

let table;
const issueOnRow = () => table.row(REF).booking_details.wallet_issue;

beforeEach(() => {
  supabaseMock.rpc = vi.fn();
  table = fakeBookingsTable([booking()]);
  supabaseMock.from.mockImplementation(table.from);
});

describe('coins and the order route', () => {
  it('captures the held coins once the booking exists', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'captured' }, error: null });
    const reported = vi.fn();
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: { wallet: { coins: 5000 } } }, { report: reported });
    expect(supabaseMock.rpc).toHaveBeenCalledWith('wallet_capture', { p_ref: 'FLT1' });
    expect(reported).not.toHaveBeenCalled();
    expect(issueOnRow()).toBeUndefined();
  });

  it('reports a hold that was released before the payment landed', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'released' }, error: null });
    const reported = vi.fn();
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: { wallet: { coins: 5000 } } }, { report: reported });
    expect(reported).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ bookingReference: 'FLT1', status: 'released', coins: 5000 }));
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a booking paid without coins', async () => {
    const reported = vi.fn();
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: { total: 100 } }, { report: reported });
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: { total: 100, wallet: null } }, { report: reported });
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: null }, { report: reported });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(reported).not.toHaveBeenCalled();
    expect(issueOnRow()).toBeUndefined();
  });

  it('reads the coins from the verified wallet, never from a raw top-level figure', async () => {
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: { walletCoins: 5000 } });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('keeps the receipt adding up with coins', () => {
    expect(fareBreakdownOf({ fare: 120, serviceFee: 2.2, discount: 0, walletAmount: 50, total: 72.2, pricedFare: { base: 100 } }))
      .toMatchObject({ serviceFee: 2.2, walletAmount: 50, totalAmount: 122.2 });
    expect(fareBreakdownOf({ fare: 120, discount: 0, walletAmount: 50, total: 72.2, pricedFare: { base: 100 } }).serviceFee).toBe(2.2);
  });

  it('leaves the receipt unchanged for a booking without coins', () => {
    expect(fareBreakdownOf({ fare: 120, serviceFee: 2.2, discount: 0, total: 122.2, pricedFare: { base: 100 } }))
      .toEqual({ baseFare: 100, totalTax: 20, serviceFee: 2.2, discount: 0, walletAmount: 0, totalAmount: 122.2, currency: 'USD' });
  });

  it('reports coins a failed booking could not give back', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const reported = vi.fn();
    const result = await giveBackAllCoins('FLT1', 'reversal', { report: reported });
    expect(result.ok).toBe(false);
    expect(reported).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bookingReference: 'FLT1', reason: 'reversal' }));
  });
});

describe('a coin problem is marked on the booking', () => {
  it('marks a capture that found the hold released, with the coins and the answer', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'released' }, error: null });
    await settleCoinsAfterBooking({ bookingReference: REF, verifiedCharge: { wallet: { coins: 5000 } } }, { report: vi.fn() });

    expect(issueOnRow()).toMatchObject({ kind: 'capture_failed', coins: 5000, status: 'released' });
    expect(Number.isNaN(Date.parse(issueOnRow().at))).toBe(false);
    expect(table.row(REF).booking_details).toMatchObject({ order_id: REF, customer_email: 'jane@example.com' });
    expect(table.row(REF).booking_details.needs_review).toBeUndefined();
    expect(table.row(REF).status).toBe('pending');
  });

  it('marks a capture that found no hold at all', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'none' }, error: null });
    await settleCoinsAfterBooking({ bookingReference: REF, verifiedCharge: { wallet: { coins: 300 } } }, { report: vi.fn() });

    expect(issueOnRow()).toMatchObject({ kind: 'capture_failed', coins: 300, status: 'none' });
  });

  it('marks a capture that threw, and still lets the booking stand', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const reported = vi.fn();

    await expect(settleCoinsAfterBooking({ bookingReference: REF, verifiedCharge: { wallet: { coins: 5000 } } }, { report: reported })).resolves.toBeUndefined();

    expect(reported).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bookingReference: REF, coins: 5000 }));
    expect(issueOnRow()).toMatchObject({ kind: 'capture_failed', coins: 5000, status: 'error' });
  });

  it('marks coins that could not be given back, with the reason', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const reported = vi.fn();

    const result = await giveBackAllCoins(REF, 'reversal', { report: reported, coins: 5000 });

    expect(result.ok).toBe(false);
    expect(issueOnRow()).toMatchObject({ kind: 'return_failed', coins: 5000, reason: 'reversal' });
    expect(issueOnRow()).not.toHaveProperty('status');
    expect(Number.isNaN(Date.parse(issueOnRow().at))).toBe(false);
    expect(table.row(REF).booking_details.needs_review).toBeUndefined();
  });

  it('marks a duplicate refund whose coins did not go back', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    await giveBackAllCoins(REF, 'duplicate', { report: vi.fn() });

    expect(issueOnRow()).toMatchObject({ kind: 'return_failed', reason: 'duplicate' });
  });

  it('reports a marker write that throws, and does not throw itself', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'released' }, error: null });
    supabaseMock.from.mockImplementation(() => { throw new Error('database down'); });
    const reported = vi.fn();

    await expect(settleCoinsAfterBooking({ bookingReference: REF, verifiedCharge: { wallet: { coins: 5000 } } }, { report: reported })).resolves.toBeUndefined();

    expect(reported).toHaveBeenCalledTimes(2);
    expect(reported).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'database down' }),
      expect.objectContaining({ where: 'markWalletIssue', bookingReference: REF }),
    );
  });

  it('reports a return marker write that throws, and still answers', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    supabaseMock.from.mockImplementation(() => { throw new Error('database down'); });
    const reported = vi.fn();

    const result = await giveBackAllCoins(REF, 'reversal', { report: reported });

    expect(result.ok).toBe(false);
    expect(reported).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'database down' }),
      expect.objectContaining({ where: 'markWalletIssue', bookingReference: REF }),
    );
  });

  it('reports a marker that could not be written because the booking could not be read', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'released' }, error: null });
    table = fakeBookingsTable([]);
    supabaseMock.from.mockImplementation(table.from);
    const reported = vi.fn();

    await settleCoinsAfterBooking({ bookingReference: REF, verifiedCharge: { wallet: { coins: 5000 } } }, { report: reported });

    expect(reported).toHaveBeenCalledTimes(2);
    expect(reported).toHaveBeenLastCalledWith(
      expect.any(Error),
      expect.objectContaining({ where: 'markWalletIssue', bookingReference: REF }),
    );
  });
});

describe('giving every coin back', () => {
  it('asks for the whole hold under the reason it was given', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'captured', coins: 5000, applied: true }, error: null });
    const reported = vi.fn();

    const result = await giveBackAllCoins(REF, 'reversal', { report: reported });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('wallet_return', expect.objectContaining({ p_ref: REF, p_reason: 'reversal' }));
    expect(result).toEqual({ ok: true, coins: 5000 });
    expect(reported).not.toHaveBeenCalled();
    expect(issueOnRow()).toBeUndefined();
  });

  it('asks for nothing when the booking is known to have used no coins', async () => {
    const result = await giveBackAllCoins(REF, 'reversal', { coins: 0 });

    expect(result).toEqual({ ok: true, coins: 0 });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('asks for nothing when there is no reference to ask under', async () => {
    const result = await giveBackAllCoins('', 'reversal');

    expect(result).toEqual({ ok: true, coins: 0 });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('still asks when it is not known whether the booking used coins', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'none', coins: 0 }, error: null });

    await giveBackAllCoins(REF, 'duplicate');

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
  });
});
