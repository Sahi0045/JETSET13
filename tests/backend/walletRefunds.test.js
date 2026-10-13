import { describe, expect, it, vi } from 'vitest';
import { settleCoinsOnCancel } from '../../backend/routes/payment/operations.handlers.js';

const clientAnswering = (...answers) => {
  const rpc = vi.fn();
  answers.forEach((answer) => rpc.mockResolvedValueOnce(answer));
  return { rpc };
};

const captured = { data: { status: 'captured' }, error: null };

describe('coins on a cancel', () => {
  it('gives every coin back on a free cancel, and takes back nothing earned it never had', async () => {
    const client = clientAnswering(captured, { data: { status: 'captured', coins: 5000 }, error: null }, { data: { coins: 0 }, error: null });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'refund_less_fee' }, heldAmount: 72.2, kept: 2.2, coins: 5000,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'wallet_capture', { p_ref: 'FLT1' });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'wallet_return', { p_ref: 'FLT1', p_coins: 5000, p_reason: 'cancel', p_note: null });
    expect(client.rpc).toHaveBeenNthCalledWith(3, 'wallet_reverse_earn', { p_ref: 'FLT1' });
    expect(result).toEqual({ ok: true, coins: 5000 });
  });

  it('gives back only what is owed when the fee covers the card', async () => {
    const client = clientAnswering(captured, { data: { status: 'captured', coins: 12000 }, error: null }, { data: { coins: 0 }, error: null });
    await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'fee_covers' }, heldAmount: 1, kept: 2.2, coins: 12120,
    });
    expect(client.rpc.mock.calls[1][0]).toBe('wallet_return');
    expect(client.rpc.mock.calls[1][1].p_coins).toBe(12000);
  });

  it('captures a hold still held before it returns only the coins that are owed', async () => {
    const client = clientAnswering(
      { data: { status: 'captured' }, error: null },
      { data: { status: 'captured', coins: 12000 }, error: null },
      { data: { coins: 0 }, error: null },
    );
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'fee_covers' }, heldAmount: 1, kept: 2.2, coins: 12120,
    });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['wallet_capture', 'wallet_return', 'wallet_reverse_earn']);
    expect(client.rpc.mock.calls[1][1].p_coins).toBe(12000);
    expect(result).toEqual({ ok: true, coins: 12000 });
  });

  it('returns nothing, and does not capture, when the fee takes everything', async () => {
    const client = clientAnswering();
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'fee_covers' }, heldAmount: 1, kept: 101, coins: 100,
    });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, coins: 0 });
  });

  it('releases the hold of a checkout that was never paid', async () => {
    const client = clientAnswering({ data: { status: 'released', coins: 5000 }, error: null });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'nothing_held' }, heldAmount: 0, kept: 0, coins: 5000,
    });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('wallet_release', { p_ref: 'FLT1' });
    expect(result.coins).toBe(5000);
  });

  it('leaves coins to the desk when the cancel goes to review', async () => {
    const client = clientAnswering();
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'review' }, heldAmount: 72.2, kept: 2.2, coins: 5000,
    });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, coins: 0 });
  });

  it('says so when the coins could not go back, without failing the cancel', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = clientAnswering(captured, { data: null, error: { message: 'connection reset' } });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'refund_all' }, heldAmount: 72.2, kept: 0, coins: 5000,
    });
    expect(result).toEqual({ ok: false, coins: 0 });
    silence.mockRestore();
  });

  it('does not try to return coins whose hold could not be captured', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = clientAnswering({ data: null, error: { message: 'connection reset' } });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'refund_all' }, heldAmount: 72.2, kept: 0, coins: 5000,
    });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, coins: 0 });
    silence.mockRestore();
  });

  it('reports the coins that went back even when the earned coins could not be taken back', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = clientAnswering(captured, { data: { status: 'captured', coins: 5000 }, error: null }, { data: null, error: { message: 'connection reset' } });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'refund_all' }, heldAmount: 72.2, kept: 0, coins: 5000,
    });
    expect(result).toEqual({ ok: true, coins: 5000, earnedReversed: false });
    silence.mockRestore();
  });
});

describe('earned coins on a refund that used no coins', () => {
  it('takes back what the booking earned when the card is refunded', async () => {
    const client = clientAnswering({ data: { coins: 130 }, error: null });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'refund_less_fee' }, heldAmount: 130.38, kept: 50, coins: 0,
    });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('wallet_reverse_earn', { p_ref: 'FLT1' });
    expect(result).toEqual({ ok: true, coins: 0 });
  });

  it('leaves them alone when nothing goes back to the customer', async () => {
    const client = clientAnswering();
    await settleCoinsOnCancel(client, { bookingReference: 'FLT1', decision: { action: 'review' }, heldAmount: 130.38, kept: 0, coins: 0 });
    await settleCoinsOnCancel(client, { bookingReference: 'FLT1', decision: { action: 'fee_covers' }, heldAmount: 30, kept: 50, coins: 0 });
    await settleCoinsOnCancel(client, { bookingReference: 'FLT1', decision: { action: 'nothing_held' }, heldAmount: 0, kept: 0, coins: 0 });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('says the earned coins were not taken back, and still lets the cancel through', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = clientAnswering({ data: null, error: { message: 'connection reset' } });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'refund_all' }, heldAmount: 130.38, kept: 0, coins: 0,
    });
    expect(result).toEqual({ ok: true, coins: 0, earnedReversed: false });
    silence.mockRestore();
  });
});
