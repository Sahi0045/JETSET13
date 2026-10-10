import { describe, expect, it } from 'vitest';
import { airlineRuleWords, ifYouCancel } from '../../shared/ifYouCancel.js';

const cell = (allowed, amount = null) => ({ allowed, amount, varies: false });
const usd = (amount) => `US$${amount}`;
const lufthansa = { currency: 'USD', bookBy: null, change: { before: cell(true, 336) }, refund: { before: cell(false, 0) } };

const money = (amount) => `$${Number(amount).toFixed(2)}`;
const time = () => 'Oct 12, 10:00 AM';
const quote = (policy, over = {}) => ({
  policy, paid: 300, serviceFeeKept: 12.5, airlinePrice: 287.5, refundAmount: 287.5,
  penalty: null, penaltyCurrency: null, cancellationFee: null, freeUntil: '2026-10-12T10:00:00.000Z', ...over,
});
const words = (over) => ifYouCancel({ penalties: lufthansa, airline: 'Lufthansa', fee: usd, money, time, ...over });

describe('ifYouCancel', () => {
  it('says what a cancel returns before the ticket, and the airline rules once it is issued', () => {
    expect(words({ quote: quote('not_ticketed') })).toEqual([
      'No ticket has been issued yet. You get back $287.50; the $12.50 service fee is not refundable.',
      "Once the ticket is issued, Lufthansa's rules apply: not refundable; a date change costs US$336 per adult plus any fare difference.",
    ]);
  });

  it('says what a cancel returns within 24 hours, and the airline rules for the fare', () => {
    expect(words({ quote: quote('free_window') })).toEqual([
      'You are within 24 hours of booking (until Oct 12, 10:00 AM). You get back $287.50; the $12.50 service fee is not refundable.',
      'If the airline no longer lets us void the ticket, our team claims the refund from the airline and returns what it gives back, less the service fee.',
      "Lufthansa's rules for this fare: not refundable; a date change costs US$336 per adult plus any fare difference.",
    ]);
  });

  it('says a non-refundable fare after 24 hours returns no fare', () => {
    expect(words({ quote: quote('non_refundable', { refundAmount: null }) })[0]).toBe('This fare is non-refundable, so the fare is not returned.');
  });

  it('gives no airline rules for a booking the airline never had', () => {
    expect(words({ quote: quote('never_booked', { serviceFeeKept: 0, airlinePrice: 300, refundAmount: 300 }) })).toEqual([
      'This booking was never confirmed with the airline, so everything you paid is returned.',
    ]);
  });

  it('says it could not work out the refund without a quote, and still gives the airline rules', () => {
    expect(words({ quote: null })).toEqual([
      'We could not work out your refund just now. You will see what happens to your payment as soon as the cancellation completes.',
      "Lufthansa's rules for this fare: not refundable; a date change costs US$336 per adult plus any fare difference.",
    ]);
  });

  it('leaves out airline rules it does not have, and names no airline it does not know', () => {
    expect(words({ quote: quote('not_ticketed'), penalties: null })).toHaveLength(1);
    expect(words({ quote: quote('free_window'), airline: '' })[2])
      .toBe("The airline's rules for this fare: not refundable; a date change costs US$336 per adult plus any fare difference.");
  });
});

describe('ifYouCancel, when no ticket is coming', () => {
  // A reservation the airline left without a confirmed seat, or one whose
  // cancellation is pending, will never be ticketed.
  it('does not promise the airline rules "once the ticket is issued"', () => {
    expect(words({ quote: quote('not_ticketed'), ticketComing: false })).toEqual([
      'No ticket has been issued yet. You get back $287.50; the $12.50 service fee is not refundable.',
    ]);
  });
});

describe('airlineRuleWords', () => {
  it('words a refund with a fee and a refused change', () => {
    expect(airlineRuleWords({ refund: { before: cell(true, 150) }, change: { before: cell(false, 0) } }, usd))
      .toBe('cancelling costs US$150 per adult; date changes are not allowed');
  });

  it('words a fee it has no figure for, and a change with no airline fee', () => {
    expect(airlineRuleWords({ refund: { before: cell(true, null) }, change: { before: cell(true, 0) } }, usd))
      .toBe('cancelling is allowed for a fee; a date change has no airline fee, only any fare difference');
  });

  it('is null when nothing is filed for before departure', () => {
    expect(airlineRuleWords({ refund: { before: cell(null) }, change: {} }, usd)).toBeNull();
    expect(airlineRuleWords(null, usd)).toBeNull();
  });
});
