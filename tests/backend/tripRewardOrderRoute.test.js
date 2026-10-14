import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { reserveTripRewardAfterBooking, toClientBooking } from '../../backend/routes/flight.routes.js';

const REF = 'FLTTRIP1';
const offer = {
  itineraries: [{ segments: [{ departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614' }] }],
};
const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000 };
const row = (details = {}, over = {}) => ({
  id: 'b1', booking_reference: REF, travel_type: 'flight', status: 'pending', payment_status: 'paid', user_id: 'user-1',
  booking_details: { order_id: REF, ...details },
  ...over,
});

let table;
let pause;
const issueOnRow = () => table.row(REF).booking_details.voucher_issue;
const coinIssueOnRow = () => table.row(REF).booking_details.wallet_issue;
const reserve = (over = {}, report = vi.fn()) => reserveTripRewardAfterBooking({
  bookingReference: REF, userId: 'user-1', verifiedCharge: { total: 291, voucher }, offer, ...over,
}, { report, pause });
const reservedReply = { data: { status: 'pending', code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', created: true }, error: null };

beforeEach(() => {
  pause = vi.fn(async () => {});
  supabaseMock.rpc = vi.fn();
  table = fakeBookingsTable([row()]);
  supabaseMock.from.mockImplementation(table.from);
});

describe('reserving a trip reward once the booking exists', () => {
  it('reserves the voucher under the booking, due two days after the last arrival', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'pending', code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', created: true }, error: null });

    const reward = await reserve();

    expect(supabaseMock.rpc).toHaveBeenCalledWith('reserve_trip_voucher', { p_user: 'user-1', p_code: 'SHUBHAM', p_ref: REF, p_due_at: '2026-11-18T00:00:00.000Z' });
    expect(reward).toEqual({ code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' });
    expect(issueOnRow()).toBeUndefined();
    expect(table.row(REF).booking_details.trip_reward).toEqual({ code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00.000Z' });
  });

  it('records a reward that is already paid, too', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'paid', code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', created: false }, error: null });

    await reserve();

    expect(table.row(REF).booking_details.trip_reward).toEqual({ code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00.000Z' });
  });

  it('still answers the reward when it could not be written on the booking, and reports it', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'pending', code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', created: true }, error: null });
    table = fakeBookingsTable([]);
    supabaseMock.from.mockImplementation(table.from);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const report = vi.fn();

    const reward = await reserve({}, report);

    expect(reward).toEqual({ code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/trip reward could not be recorded/) }), expect.objectContaining({ bookingReference: REF }));
    silence.mockRestore();
  });

  it('marks a refused voucher on the booking and never throws', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_USED_UP' } });

    const reward = await reserve();

    expect(reward).toBeNull();
    expect(issueOnRow()).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'VOUCHER_USED_UP' });
    expect(Number.isNaN(Date.parse(issueOnRow().at))).toBe(false);
    expect(table.row(REF).booking_details.trip_reward).toBeUndefined();
    silence.mockRestore();
  });

  it('reports a reward that could not be reserved right now, but not a voucher that refused', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = vi.fn();

    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_USED_UP' } });
    await reserve({}, report);
    expect(report).not.toHaveBeenCalled();

    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    await reserve({}, report);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: 'WALLET_UNAVAILABLE' }), expect.objectContaining({ bookingReference: REF, reason: 'WALLET_UNAVAILABLE' }));
    expect(issueOnRow()).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'WALLET_UNAVAILABLE' });
    silence.mockRestore();
  });

  it('tries twice more when the reward could not be reserved right now, and reserves it', async () => {
    const report = vi.fn();
    supabaseMock.rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
      .mockResolvedValueOnce(reservedReply);

    const reward = await reserve({}, report);

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(3);
    expect(pause.mock.calls).toEqual([[300], [1000]]);
    expect(reward).toEqual({ code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' });
    expect(issueOnRow()).toBeUndefined();
    expect(table.row(REF).booking_details.trip_reward).toEqual({ code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00.000Z' });
    expect(report).not.toHaveBeenCalled();
  });

  it('marks and reports once a reward still cannot be reserved after three tries', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = vi.fn();
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    expect(await reserve({}, report)).toBeNull();

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(3);
    expect(report).toHaveBeenCalledTimes(1);
    expect(issueOnRow()).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'WALLET_UNAVAILABLE' });
    silence.mockRestore();
  });

  it('never asks again when the voucher itself refused', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_FIRST_TIME_ONLY' } });

    await reserve();

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
    silence.mockRestore();
  });

  it('closes the open refusal an earlier try left once a later one reserves the reward', async () => {
    table = fakeBookingsTable([row({ voucher_issue: { kind: 'voucher_refused', code: 'SHUBHAM', reason: 'WALLET_UNAVAILABLE', at: '2026-10-13T10:00:00.000Z' } })]);
    supabaseMock.from.mockImplementation(table.from);
    supabaseMock.rpc.mockResolvedValue(reservedReply);

    await reserve();

    expect(issueOnRow() ?? null).toBeNull();
    expect(table.row(REF).booking_details.trip_reward).toEqual({ code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00.000Z' });
  });

  it('leaves any other problem on the booking alone when it reserves the reward', async () => {
    const capture = { kind: 'capture_failed', coins: 500, status: 'released', at: '2026-10-13T10:00:00.000Z' };
    table = fakeBookingsTable([row({ wallet_issue: capture })]);
    supabaseMock.from.mockImplementation(table.from);
    supabaseMock.rpc.mockResolvedValue(reservedReply);

    await reserve();

    expect(coinIssueOnRow()).toEqual(capture);
  });

  // Both used to share `wallet_issue`, so an open capture problem kept the
  // refusal off the booking, and with it off the desk's queue.
  it('records the refusal beside an open Jet Coins problem, and leaves that problem in place', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    table = fakeBookingsTable([row({ wallet_issue: { kind: 'capture_failed', coins: 500, status: 'released', at: '2026-10-13T10:00:00.000Z' } })]);
    supabaseMock.from.mockImplementation(table.from);
    supabaseMock.rpc.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await reserve();

    expect(coinIssueOnRow()).toMatchObject({ kind: 'capture_failed', coins: 500 });
    expect(issueOnRow()).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'WALLET_UNAVAILABLE' });
    silence.mockRestore();
  });

  it('reserves nothing for a booking without a voucher', async () => {
    expect(await reserve({ verifiedCharge: { total: 291 } })).toBeNull();
    expect(await reserve({ verifiedCharge: null })).toBeNull();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('marks a voucher on a booking with no owner as refused, without asking the database', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await reserve({ userId: null })).toBeNull();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(issueOnRow()).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'LOGIN_REQUIRED' });
    silence.mockRestore();
  });

  it('reserves with no payout date when the itinerary cannot be read, and reports it', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'pending', code: 'SHUBHAM', coins: 5000, due_at: null, created: true }, error: null });
    const report = vi.fn();

    const reward = await reserve({ offer: { itineraries: [] } }, report);

    expect(supabaseMock.rpc.mock.calls[0][1].p_due_at).toBeNull();
    expect(reward).toEqual({ code: 'SHUBHAM', coins: 5000, dueAt: null });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/no payout date/) }), expect.objectContaining({ bookingReference: REF }));
  });

  it('gives nothing back for a booking whose reward was already voided', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'void', code: 'SHUBHAM', coins: 5000, created: false }, error: null });
    expect(await reserve()).toBeNull();
    expect(table.row(REF).booking_details.trip_reward).toBeUndefined();
  });
});

describe('the trip reward on a booking the customer reads', () => {
  const recorded = { code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00.000Z' };
  const confirmed = (details = {}, over = {}) => row({ verified_charge: { total: 291, voucher }, trip_reward: recorded, ...details }, { status: 'confirmed', ...over });

  it('names the voucher and its coins once a reward was reserved', () => {
    expect(toClientBooking(confirmed()).tripReward).toEqual({ code: 'SHUBHAM', coins: 5000 });
  });

  it('has none for a voucher checkout accepted but nothing was reserved for', () => {
    expect(toClientBooking(confirmed({ trip_reward: undefined })).tripReward).toBeNull();
    expect(toClientBooking(confirmed({ trip_reward: undefined, wallet_issue: { kind: 'capture_failed', coins: 500 } })).tripReward).toBeNull();
  });

  it('has none for a cancelled booking, a refunded or reversed payment, or no voucher', () => {
    expect(toClientBooking(confirmed({}, { status: 'cancelled' })).tripReward).toBeNull();
    expect(toClientBooking(confirmed({}, { payment_status: 'refunded' })).tripReward).toBeNull();
    expect(toClientBooking(confirmed({}, { payment_status: 'reversed' })).tripReward).toBeNull();
    expect(toClientBooking(row({ verified_charge: { total: 291 } }, { status: 'confirmed' })).tripReward).toBeNull();
  });

  it('keeps showing a reward on a payment only part of which was refunded', () => {
    expect(toClientBooking(confirmed({}, { payment_status: 'partially_refunded' })).tripReward).toEqual({ code: 'SHUBHAM', coins: 5000 });
  });
});
