import { describe, expect, it } from 'vitest';
import {
  FREE_CANCEL_HOURS,
  cancelPolicyLines,
  cancelTermsLines,
  customerCancelTerms,
  fareRuleOf,
  freeUntilOf,
  isWithinFreeWindow,
  serviceFeeKeptOf,
} from '../../shared/flightCancelPolicy.js';

// 10:30 AM in New York, 8:00 PM in India. The ticketing office's day ends at
// midnight New York time: 13.5 hours later.
const TZ = 'America/New_York';
const PAID_AT = '2026-10-12T14:30:00.000Z';
const VOID_DEADLINE = '2026-10-13T04:00:00.000Z';
const at = (hours) => new Date(Date.parse(PAID_AT) + hours * 60 * 60 * 1000);
const charge = { fare: 287.5, serviceFee: 12.5, discount: 0, total: 300 };
const cell = (allowed, amount = null) => ({ allowed, amount, varies: false });
const table = (refundBefore, currency = 'USD') => ({ currency, change: { before: cell(true, 100) }, refund: { before: refundBefore } });
const money = (amount, currency = 'USD') => `${currency} ${Number(amount).toFixed(2)}`;
const time = (iso) => `<${iso}>`;

describe('serviceFeeKeptOf', () => {
  it('keeps the service fee less any coupon discount', () => {
    expect(serviceFeeKeptOf(charge)).toBe(12.5);
    expect(serviceFeeKeptOf({ ...charge, discount: 5 })).toBe(7.5);
  });

  it('keeps nothing when the coupon is larger than the fee', () => {
    expect(serviceFeeKeptOf({ ...charge, discount: 20 })).toBe(0);
  });

  it('does not know the fee of a booking checkout never recorded', () => {
    expect(serviceFeeKeptOf(null)).toBeNull();
    expect(serviceFeeKeptOf({ total: 300 })).toBeNull();
  });
});

describe('the free cancellation window', () => {
  it("ends when the ticketing office's day ends, the last moment a ticket can be voided", () => {
    expect(FREE_CANCEL_HOURS).toBe(24);
    expect(freeUntilOf(PAID_AT, TZ)).toBe(VOID_DEADLINE);
    expect(freeUntilOf(new Date(PAID_AT), TZ)).toBe(VOID_DEADLINE);
  });

  it("is short for a booking made late in the office's day", () => {
    expect(freeUntilOf('2026-10-13T03:30:00.000Z', TZ)).toBe(VOID_DEADLINE);
  });

  it("follows the office's clock across the change from summer time", () => {
    expect(freeUntilOf('2026-10-31T16:00:00.000Z', TZ)).toBe('2026-11-01T04:00:00.000Z');
    expect(freeUntilOf('2026-11-01T15:00:00.000Z', TZ)).toBe('2026-11-02T05:00:00.000Z');
    expect(freeUntilOf('2026-11-03T15:00:00.000Z', TZ)).toBe('2026-11-04T05:00:00.000Z');
  });

  it('follows whichever office time zone is set', () => {
    expect(freeUntilOf(PAID_AT, 'Asia/Kolkata')).toBe('2026-10-12T18:30:00.000Z');
    expect(freeUntilOf(PAID_AT, 'America/Los_Angeles')).toBe('2026-10-13T07:00:00.000Z');
  });

  it('is open until the deadline and closed from it, though 24 hours have not passed', () => {
    expect(isWithinFreeWindow(PAID_AT, new Date(Date.parse(VOID_DEADLINE) - 1000), TZ)).toBe(true);
    expect(isWithinFreeWindow(PAID_AT, VOID_DEADLINE, TZ)).toBe(false);
    expect(isWithinFreeWindow(PAID_AT, at(14), TZ)).toBe(false);
  });

  it('is closed when the booking time or the office time zone cannot be read', () => {
    expect(freeUntilOf(undefined, TZ)).toBeNull();
    expect(freeUntilOf(PAID_AT, undefined)).toBeNull();
    expect(freeUntilOf(PAID_AT, 'Not/AZone')).toBeNull();
    expect(isWithinFreeWindow('not a date', at(1), TZ)).toBe(false);
    expect(isWithinFreeWindow(PAID_AT, at(1), undefined)).toBe(false);
  });
});

describe('fareRuleOf', () => {
  it('reads a non-refundable fare', () => {
    expect(fareRuleOf(table(cell(false, 0)))).toEqual({ refundable: false, penalty: null, currency: null });
  });

  it('reads a refundable fare and its penalty per adult', () => {
    expect(fareRuleOf(table(cell(true, 150), 'EUR'))).toEqual({ refundable: true, penalty: 150, currency: 'EUR' });
  });

  it('reads a refundable fare that states no penalty', () => {
    expect(fareRuleOf(table(cell(true, null)))).toEqual({ refundable: true, penalty: null, currency: null });
  });

  it('knows nothing without the fee table or its refund rule', () => {
    expect(fareRuleOf(null)).toEqual({ refundable: null, penalty: null, currency: null });
    expect(fareRuleOf(table(cell(null)))).toEqual({ refundable: null, penalty: null, currency: null });
  });
});

describe('customerCancelTerms', () => {
  const terms = (over = {}) => customerCancelTerms({
    charge, paidAt: PAID_AT, now: at(2), timeZone: TZ, hasReservation: true, ticketed: true, fareRule: null, cancellationFee: 50, ...over,
  });

  it('returns everything for a booking the airline never had', () => {
    expect(terms({ hasReservation: false, ticketed: false })).toMatchObject({
      policy: 'never_booked', automatic: true, serviceFeeKept: 0, airlinePrice: 300, refundAmount: 300,
    });
  });

  it('returns the airline price before the ticket is issued, at any time', () => {
    expect(terms({ ticketed: false, now: at(72) })).toMatchObject({
      policy: 'not_ticketed', automatic: true, paid: 300, serviceFeeKept: 12.5, airlinePrice: 287.5, refundAmount: 287.5,
    });
  });

  it('returns the airline price on a ticket cancelled before the void deadline', () => {
    expect(terms()).toMatchObject({
      policy: 'free_window', automatic: true, airlinePrice: 287.5, refundAmount: 287.5, freeUntil: VOID_DEADLINE,
    });
  });

  it('applies the fare rules once the void deadline has passed, inside 24 hours too', () => {
    expect(terms({ now: at(14), fareRule: { refundable: false, penalty: null, currency: null } })).toMatchObject({
      policy: 'non_refundable', automatic: false, refundAmount: null,
    });
    expect(terms({ now: at(14) })).toMatchObject({ policy: 'rules_unknown', automatic: false });
  });

  it('treats an office time zone it cannot read as past the deadline', () => {
    expect(terms({ timeZone: undefined, fareRule: null })).toMatchObject({ policy: 'rules_unknown', automatic: false, freeUntil: null });
  });

  it('leaves a non-refundable ticket after the deadline to our team', () => {
    expect(terms({ now: at(30), fareRule: { refundable: false, penalty: null, currency: null } })).toMatchObject({
      policy: 'non_refundable', automatic: false, refundAmount: null, cancellationFee: null,
    });
  });

  it('names the airline penalty and our fee on a refundable ticket after the deadline', () => {
    expect(terms({ now: at(30), fareRule: { refundable: true, penalty: 150, currency: 'USD' } })).toMatchObject({
      policy: 'refundable', automatic: false, refundAmount: null, penalty: 150, penaltyCurrency: 'USD', cancellationFee: 50, airlinePrice: 287.5,
    });
  });

  it('says the rules are unknown when the fare rules could not be read', () => {
    expect(terms({ now: at(30), fareRule: null })).toMatchObject({ policy: 'rules_unknown', automatic: false, refundAmount: null });
  });

  it('keeps nothing on a booking whose service fee was never recorded', () => {
    expect(terms({ charge: { total: 300 } })).toMatchObject({ policy: 'free_window', serviceFeeKept: 0, airlinePrice: 300, refundAmount: 300 });
  });

  it('never keeps more than was paid', () => {
    expect(terms({ charge: { ...charge, discount: 400, total: 0 } })).toMatchObject({ serviceFeeKept: 0, airlinePrice: 0 });
  });
});

describe('cancelTermsLines', () => {
  const lines = (over) => cancelTermsLines({
    paid: 300, serviceFeeKept: 12.5, airlinePrice: 287.5, penalty: null, penaltyCurrency: null, cancellationFee: null,
    freeUntil: VOID_DEADLINE, ...over,
  }, { money, time });

  it('says everything comes back for a booking never confirmed', () => {
    expect(lines({ policy: 'never_booked' })).toEqual(['This booking was never confirmed with the airline, so everything you paid is returned.']);
  });

  it('gives the amount before the ticket is issued', () => {
    expect(lines({ policy: 'not_ticketed' })).toEqual([
      'No ticket has been issued yet. You get back USD 287.50; the USD 12.50 service fee is not refundable.',
    ]);
  });

  it('gives the amount and the free cancellation deadline', () => {
    expect(lines({ policy: 'free_window' })).toEqual([
      'Free cancellation until <2026-10-13T04:00:00.000Z>. You get back USD 287.50; the USD 12.50 service fee is not refundable.',
    ]);
  });

  it('says nothing about a service fee when none is kept', () => {
    expect(lines({ policy: 'free_window', serviceFeeKept: 0, airlinePrice: 300 })).toEqual([
      'Free cancellation until <2026-10-13T04:00:00.000Z>. You get back USD 300.00.',
    ]);
  });

  it('names the penalty and our fee on a refundable fare', () => {
    expect(lines({ policy: 'refundable', penalty: 150, penaltyCurrency: 'EUR', cancellationFee: 50 })).toEqual([
      "This fare is refundable. You get back USD 287.50 less the airline's cancellation penalty of EUR 150.00 per adult and our USD 50.00 cancellation fee.",
      'The USD 12.50 service fee is not refundable.',
      'Our team confirms the amount with the airline and emails you within 2 business days.',
    ]);
  });

  it('leaves out a penalty the fare does not state and a fee of 0', () => {
    expect(lines({ policy: 'refundable', cancellationFee: 0 })[0]).toBe(
      "This fare is refundable. You get back USD 287.50 less the airline's cancellation penalty.",
    );
  });

  it('says a non-refundable fare returns no fare', () => {
    expect(lines({ policy: 'non_refundable' })).toEqual([
      'This fare is non-refundable, so the fare is not returned.',
      'Our team checks with the airline for any unused taxes and emails you within 2 business days.',
    ]);
  });

  it('says when the rules could not be read', () => {
    expect(lines({ policy: 'rules_unknown' })).toEqual([
      "We could not read this fare's rules just now. Our team checks them with the airline and emails you within 2 business days to confirm what is returned.",
    ]);
  });

  it('says nothing without terms', () => {
    expect(cancelTermsLines(null)).toEqual([]);
  });

  it('formats dollars by default', () => {
    expect(cancelTermsLines({ policy: 'not_ticketed', serviceFeeKept: 12.5, airlinePrice: 287.5 })).toEqual([
      'No ticket has been issued yet. You get back $287.50; the $12.50 service fee is not refundable.',
    ]);
  });
});

describe('cancelPolicyLines', () => {
  it('states the policy with the deadline for a booking made now and the flight cancellation fee', () => {
    expect(cancelPolicyLines({ cancellationFee: 50, freeUntil: VOID_DEADLINE, money, time })).toEqual([
      'Book now and you can cancel free until <2026-10-13T04:00:00.000Z>: you get back the airline price. The service fee is not refundable.',
      "After that the airline's fare rules apply: a refundable fare returns the airline price less the airline's penalty and our USD 50.00 cancellation fee; a non-refundable fare returns only unused taxes.",
      'If the airline cancels or changes your flight, you get back everything you paid.',
    ]);
  });

  it('names the end of the booking day when the deadline is not known yet', () => {
    expect(cancelPolicyLines({ cancellationFee: 50, money })[0]).toBe(
      'You can cancel free until 11:59 PM on the day you book (our ticketing office\'s time): you get back the airline price. The service fee is not refundable.',
    );
  });

  it('leaves out a fee of 0', () => {
    expect(cancelPolicyLines({ cancellationFee: 0, money })[1]).toBe(
      "After that the airline's fare rules apply: a refundable fare returns the airline price less the airline's penalty; a non-refundable fare returns only unused taxes.",
    );
  });
});
