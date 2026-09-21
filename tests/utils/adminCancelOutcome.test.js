import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminCancelOutcome } from '../../frontend/src/utils/adminBookingActions';

/**
 * The admin who presses Cancel & Refund is told what actually happened to the money.
 *
 * The admin bookings list built its own message from `paymentAction`, branching
 * on seven codes. Four of them - FEE_CHARGED, FULL_FEE, VOID_AND_FEE and a bare
 * REFUND - the backend has never sent. It missed seven it does send. So when ARC
 * Pay refused a refund (REFUND_FAILED, refundAmount 0), the operator got a green
 * toast reading "Booking FLT... cancelled successfully." and a result modal
 * headed "Booking Cancelled" over a green panel with nothing in it. The seats
 * were gone, the customer's card still held the full fare, and the one person
 * in the loop had been told it worked. Found by the flight-flow audit.
 *
 * The customer pages, the cancel API and the email already read the outcome
 * through shared/cancellationOutcome.js; its own header describes this exact
 * green-over-a-refused-refund bug. The admin page now reads it the same way,
 * in words written for the operator.
 */

const REF = 'FLT123456';
const outcome = (cancellation, extra = {}) => adminCancelOutcome(cancellation, { bookingReference: REF, paid: 450, ...extra });

// Every paymentAction the backend emits (backend/routes/payment/operations.handlers.js
// returnFlightPayment and cancelOtherBooking). Read from the code on 2026-09-21.
const FAILED = ['REFUND_FAILED', 'VOID_FAILED', 'VOID_MISSING_TXN_ID', 'MANUAL_PROCESS_REQUIRED'];
const EMITTED = [...FAILED, 'REFUND_UNDER_REVIEW', 'NOTHING_TO_REFUND', 'NO_REFUND_FEE_COVERS', 'FULL_REFUND', 'PARTIAL_REFUND', 'VOID'];

describe('a refund that did not go through', () => {
  // The audit finding, exactly: HTTP 200, result FAILURE, refundAmount 0.
  it('is never reported as a success', () => {
    const result = outcome({ paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 0 });

    expect(result.tone).toBe('error');
    expect(result.summary).not.toMatch(/successfully/i);
    expect(result.summary).toMatch(/did not go through/i);
    expect(result.summary).toMatch(/nothing has gone back to the customer's card/i);
  });

  it.each(FAILED)('%s is an error, and tells the operator how to finish it', (paymentAction) => {
    const result = outcome({ paymentAction, refundAmount: 0 });

    expect(result.tone).toBe('error');
    expect(result.detail).toMatch(/Finish refund/);
  });

  it('says why, per cause', () => {
    expect(outcome({ paymentAction: 'REFUND_FAILED' }).detail).toMatch(/ARC Pay refused the refund/);
    expect(outcome({ paymentAction: 'VOID_FAILED' }).detail).toMatch(/refused to void/);
    expect(outcome({ paymentAction: 'VOID_MISSING_TXN_ID' }).detail).toMatch(/no ARC Pay transaction/);
    expect(outcome({ paymentAction: 'MANUAL_PROCESS_REQUIRED' }).detail).toMatch(/cannot be refunded automatically/);
  });

  // The backend does not say what was due when a refund fails, so no refund
  // figure is invented. What the customer paid is known, and is what the
  // operator needs to decide the refund.
  it('shows what the customer paid, not a refund amount it does not have', () => {
    const result = outcome({ paymentAction: 'REFUND_FAILED', refundAmount: 0 });

    expect(result.figure).toEqual({ label: 'Customer paid', amount: 450 });
  });
});

describe('a refund held for review', () => {
  it('is a warning, not a success, and says no refund was made', () => {
    const result = outcome({ paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, reviewReason: 'no refund rule for NON_REFUNDABLE' });

    expect(result.tone).toBe('warning');
    expect(result.summary).toMatch(/No refund was made/);
    expect(result.detail).toMatch(/Finish refund/);
  });

  // Why the system would not decide is the first thing the operator needs.
  it('passes on why it was held', () => {
    expect(outcome({ paymentAction: 'REFUND_UNDER_REVIEW', reviewReason: 'no refund rule for NON_REFUNDABLE' }).reason)
      .toBe('no refund rule for NON_REFUNDABLE');
  });
});

describe('a booking with no payment behind it', () => {
  it('is a warning that asks for a check, not a success', () => {
    const result = outcome({ paymentAction: 'NOTHING_TO_REFUND', refundAmount: 0 });

    expect(result.tone).toBe('warning');
    expect(result.summary).toMatch(/holds no payment/);
    expect(result.detail).toMatch(/check the order in ARC Pay/);
  });
});

describe('outcomes where the money is settled', () => {
  it('a full refund says how much went back', () => {
    const result = outcome({ paymentAction: 'FULL_REFUND', refundAmount: 450 });

    expect(result.tone).toBe('success');
    expect(result.summary).toMatch(/\$450 refunded to the customer's card/);
    expect(result.figure).toEqual({ label: 'Refunded', amount: 450 });
  });

  it('a partial refund says what was kept', () => {
    const result = outcome({ paymentAction: 'PARTIAL_REFUND', refundAmount: 400, cancellationFee: 50 });

    expect(result.tone).toBe('success');
    expect(result.summary).toMatch(/\$400 refunded/);
    expect(result.summary).toMatch(/\$50 cancellation fee kept/);
  });

  it('a void says the charge is reversed', () => {
    const result = outcome({ paymentAction: 'VOID', refundAmount: 450 });

    expect(result.tone).toBe('success');
    expect(result.summary).toMatch(/payment voided/i);
  });

  // It used to be reported with no amount and an empty panel.
  it('a fee that covers the fare says no refund is due, and shows the fee', () => {
    const result = outcome({ paymentAction: 'NO_REFUND_FEE_COVERS', refundAmount: 0, cancellationFee: 450 });

    expect(result.tone).toBe('success');
    expect(result.summary).toMatch(/no refund is due/);
    expect(result.figure).toEqual({ label: 'Cancellation fee kept', amount: 450 });
  });
});

describe('an outcome the page cannot read', () => {
  // Unknown must not promise anything - the shared classifier's own rule.
  it('is a warning that sends the operator to ARC, never a success', () => {
    const result = outcome({ refundAmount: 0 });

    expect(result.tone).toBe('warning');
    expect(result.summary).toMatch(/was not reported/);
  });
});

describe('every code the backend sends', () => {
  it.each(EMITTED)('%s gets a title and a sentence', (paymentAction) => {
    const result = outcome({ paymentAction, refundAmount: 100, cancellationFee: 10 });

    expect(result.title).toBeTruthy();
    expect(result.summary).toContain(REF);
  });

  // The invariant the old page broke.
  it.each([...FAILED, 'REFUND_UNDER_REVIEW', 'NOTHING_TO_REFUND'])('%s is never shown as a success', (paymentAction) => {
    expect(outcome({ paymentAction, refundAmount: 0 }).tone).not.toBe('success');
  });
});

describe('the admin bookings list', () => {
  const page = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Admin/BookingsList.jsx'), 'utf8');

  // Codes the backend has never sent. Branching on them is how the page ended
  // up with nothing to say about the codes it does send.
  it('no longer branches on outcome codes the backend never sends', () => {
    for (const ghost of ['FEE_CHARGED', 'FULL_FEE', 'VOID_AND_FEE']) expect(page).not.toMatch(new RegExp(`'${ghost}'`));
    expect(page).not.toMatch(/paymentAction === 'REFUND'[^_]/);
  });

  it('builds both the toast and the result from the shared reading', () => {
    expect(page).toMatch(/adminCancelOutcome\(/);
    expect(page).toMatch(/setActionMessage\(\{ type: outcome\.tone, text: outcome\.summary \}\)/);
  });

  it('never hard-codes a success banner over a cancellation', () => {
    expect(page).not.toMatch(/cancelled successfully\./);
  });
});
