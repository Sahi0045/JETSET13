import { describe, expect, it } from 'vitest';
import { airlineRuleWords, ifYouCancel } from '../../shared/ifYouCancel.js';

const cell = (allowed, amount = null) => ({ allowed, amount, varies: false });
const usd = (amount) => `US$${amount}`;
const lufthansa = { currency: 'USD', bookBy: null, change: { before: cell(true, 336) }, refund: { before: cell(false, 0) } };

describe('ifYouCancel', () => {
  it('says what cancelling costs before the ticket, and the airline rules once it is issued', () => {
    expect(ifYouCancel({ ticketState: 'none', penalties: lufthansa, airline: 'Lufthansa', fee: usd })).toEqual([
      'No ticket has been issued yet, so no cancellation fee applies and what you paid is returned.',
      "Once the ticket is issued, Lufthansa's rules apply: not refundable; a date change costs US$336 per adult plus any fare difference.",
    ]);
  });

  it('gives the airline rules for an issued ticket', () => {
    expect(ifYouCancel({ ticketState: 'issued', penalties: lufthansa, airline: 'Lufthansa', fee: usd })).toEqual([
      'Your ticket has been issued, so a cancellation fee may apply.',
      "Lufthansa's rules for this fare: not refundable; a date change costs US$336 per adult plus any fare difference.",
      "What is refunded depends on your fare's rules; some fares need our team to review the refund first.",
    ]);
  });

  it('reads a ticket whose number has not arrived as issued', () => {
    expect(ifYouCancel({ ticketState: 'pending', penalties: null, airline: 'Lufthansa', fee: usd })[0])
      .toBe('Your ticket has been issued, so a cancellation fee may apply.');
  });

  it('keeps the website wording for a voided ticket', () => {
    expect(ifYouCancel({ ticketState: 'none', ticketsVoided: true, penalties: lufthansa, airline: 'Lufthansa', fee: usd })).toEqual([
      'Your ticket has been voided, so a cancellation fee may apply.',
      'Some refunds need our team to review them first.',
    ]);
  });

  it('says nothing of a cancelled booking', () => {
    expect(ifYouCancel({ ticketState: 'cancelled', penalties: lufthansa, airline: 'Lufthansa', fee: usd })).toEqual([]);
  });

  it('leaves out airline rules it does not have', () => {
    expect(ifYouCancel({ ticketState: 'none', penalties: null, airline: 'Lufthansa', fee: usd })).toEqual([
      'No ticket has been issued yet, so no cancellation fee applies and what you paid is returned.',
    ]);
    expect(ifYouCancel({ ticketState: 'issued', penalties: null, airline: 'Lufthansa', fee: usd })).toHaveLength(2);
  });

  it('names no airline it does not know', () => {
    expect(ifYouCancel({ ticketState: 'none', penalties: lufthansa, airline: '', fee: usd })[1])
      .toBe("Once the ticket is issued, the airline's rules apply: not refundable; a date change costs US$336 per adult plus any fare difference.");
    expect(ifYouCancel({ ticketState: 'issued', penalties: lufthansa, airline: '', fee: usd })[1])
      .toBe("The airline's rules for this fare: not refundable; a date change costs US$336 per adult plus any fare difference.");
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
