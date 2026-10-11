import { describe, expect, it } from 'vitest';
import { decideFlightRefund } from '../../backend/routes/payment/operations.handlers.js';

/**
 * What a customer's own cancel returns: the airline price inside the free
 * window (until the ticket stops being voidable) or before the ticket is issued, with the service fee kept; after that our team
 * settles it by the fare's rules. Staff and server cancels keep their rules.
 */

const neverTicketed = { success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] };
const ticketsVoided = { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] };
const pastVoidWindow = { success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['057-2412345678'] };

const base = {
  heldAmount: 300, paidInFull: true, everCaptured: true, hasReservation: true,
  gds: neverTicketed, rowTicketed: false, refundable: null, fee: 50,
};
const inWindow = { freeWindow: true, serviceFeeKept: 12.5, fareRule: null, cancellationFee: 50 };
const after = (fareRule) => ({ freeWindow: false, serviceFeeKept: 12.5, fareRule, cancellationFee: 50 });
const decide = (over) => decideFlightRefund({ ...base, ...over });

describe('a customer cancel', () => {
  it('returns everything for a booking the airline never had', () => {
    expect(decide({ hasReservation: false, gds: null, customer: after(null) })).toMatchObject({
      action: 'refund_all', fee: 0, refundAmount: 300, policy: 'never_booked',
    });
  });

  it('keeps the service fee on a reservation released before a ticket, at any time', () => {
    expect(decide({ customer: after(null) })).toMatchObject({
      action: 'refund_less_fee', fee: 12.5, refundAmount: 287.5, policy: 'not_ticketed', serviceFeeKept: 12.5,
    });
  });

  it('returns everything when no service fee is kept', () => {
    expect(decide({ customer: { ...inWindow, serviceFeeKept: 0 } })).toMatchObject({
      action: 'refund_all', fee: 0, refundAmount: 300, policy: 'not_ticketed', serviceFeeKept: 0,
    });
    expect(decide({ customer: { ...inWindow, serviceFeeKept: null } })).toMatchObject({ action: 'refund_all', refundAmount: 300 });
  });

  it('returns the airline price on tickets voided inside the free window', () => {
    expect(decide({ gds: ticketsVoided, customer: inWindow })).toMatchObject({
      action: 'refund_less_fee', fee: 12.5, refundAmount: 287.5, policy: 'free_window', serviceFeeKept: 12.5,
    });
  });

  it('leaves a ticket the airline would not void inside the free window to our team, who refund the promised airline price', () => {
    const decision = decide({ gds: pastVoidWindow, customer: inWindow });
    expect(decision).toMatchObject({ action: 'review', refundAmount: 0, policy: 'not_voided', serviceFeeKept: 12.5 });
    expect(decision.reason).toMatch(/free cancellation time/);
    expect(decision.reason).toMatch(/refund 287\.50/);
    expect(decision.reason).toMatch(/keep the 12\.50 service fee/);
    expect(decision.reason).toMatch(/claim the refund from the airline/);
  });

  it('refunds nothing automatically on a non-refundable fare after the free window, voided or not', () => {
    const voided = decide({ gds: ticketsVoided, customer: after({ refundable: false, penalty: null, currency: null }) });
    expect(voided).toMatchObject({ action: 'review', refundAmount: 0, policy: 'non_refundable' });
    expect(voided.reason).toMatch(/non-refundable/);
    expect(voided.reason).toMatch(/unused taxes/);
    expect(voided.reason).toMatch(/voided/);

    const claimed = decide({ gds: pastVoidWindow, customer: after({ refundable: false, penalty: null, currency: null }) });
    expect(claimed).toMatchObject({ action: 'review', policy: 'non_refundable' });
    expect(claimed.reason).toMatch(/claim/);
  });

  it('names the airline price, the penalty and our fee on a refundable fare after the free window', () => {
    const decision = decide({ gds: pastVoidWindow, refundable: true, customer: after({ refundable: true, penalty: 150, currency: 'USD' }) });
    expect(decision).toMatchObject({ action: 'review', refundAmount: 0, policy: 'refundable' });
    expect(decision.reason).toMatch(/287\.50/);
    expect(decision.reason).toMatch(/150(\.00)? USD per adult/);
    expect(decision.reason).toMatch(/50\.00 cancellation fee/);
  });

  it('says when the fare rules could not be read', () => {
    const decision = decide({ gds: ticketsVoided, customer: after(null) });
    expect(decision).toMatchObject({ action: 'review', policy: 'rules_unknown' });
    expect(decision.reason).toMatch(/could not be read/);
  });

  it('never trusts the booking row for a refundable fare: only the airline rules count', () => {
    expect(decide({ gds: pastVoidWindow, refundable: true, customer: after({ refundable: false, penalty: null, currency: null }) }))
      .toMatchObject({ action: 'review', policy: 'non_refundable' });
  });

  it('still stops on what the airline and the gateway disagree about, with no policy', () => {
    const partlyBack = decide({ heldAmount: 200, paidInFull: false, customer: inWindow });
    expect(partlyBack.action).toBe('review');
    expect(partlyBack.policy).toBeUndefined();

    const airlineSilent = decide({ gds: { success: true }, customer: inWindow });
    expect(airlineSilent.action).toBe('review');
    expect(airlineSilent.policy).toBeUndefined();

    const noTicketShown = decide({ rowTicketed: true, customer: inWindow });
    expect(noTicketShown.action).toBe('review');
    expect(noTicketShown.policy).toBeUndefined();
  });

  it('has nothing to refund when the gateway holds nothing', () => {
    expect(decide({ heldAmount: 0, customer: inWindow })).toMatchObject({ action: 'nothing_held' });
  });

  it('keeps no more than what is held', () => {
    expect(decide({ heldAmount: 10, customer: inWindow })).toMatchObject({ action: 'fee_covers', fee: 10, refundAmount: 0, policy: 'not_ticketed' });
  });
});

describe('a staff or server cancel', () => {
  it('keeps today’s rules', () => {
    expect(decide({ gds: ticketsVoided })).toMatchObject({ action: 'refund_less_fee', fee: 50, refundAmount: 250 });
    expect(decide({ gds: pastVoidWindow, refundable: true })).toMatchObject({ action: 'refund_less_fee', fee: 50, refundAmount: 250 });
    expect(decide({})).toMatchObject({ action: 'refund_all', fee: 0, refundAmount: 300 });
    expect(decide({ gds: ticketsVoided }).policy).toBeUndefined();
  });
});
