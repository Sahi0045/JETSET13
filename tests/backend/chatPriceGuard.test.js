import { describe, expect, it } from 'vitest';
import { allowedAmounts, guardPrices, moneyAmounts } from '../../backend/services/chat/priceGuard.js';

const card = (total) => ({ price: { total: total.toFixed(2), amount: total, currency: 'USD' } });

describe('moneyAmounts', () => {
  it('reads dollars written every common way', () => {
    expect(moneyAmounts('$12, $1,234.50, US$ 99, USD 98, 97 USD and 96 dollars')).toEqual([12, 1234.5, 99, 98, 97, 96]);
  });

  it('reads rupees and other currencies', () => {
    expect(moneyAmounts('₹6,228 or INR 6228 or €50 or £40')).toEqual([6228, 6228, 50, 40]);
  });

  it('does not read travellers, flight numbers or times as money', () => {
    expect(moneyAmounts('2 adults on AI 423 at 08:30, 1 stop, 5h 40m')).toEqual([]);
  });

  it('does not read the end of a word as a currency', () => {
    expect(moneyAmounts('for travellers 2, about 3 hours 5 minutes')).toEqual([]);
  });
});

describe('guardPrices', () => {
  it('keeps card prices', () => {
    const allowed = allowedAmounts({ cards: [card(189.4)] });

    expect(guardPrices('The cheapest is $189.40 on Delta.', allowed)).toEqual({ text: 'The cheapest is $189.40 on Delta.', removed: 0 });
  });

  it("keeps booking amounts and the customer's budget", () => {
    const allowed = allowedAmounts({
      context: { bookings: [{ totalAmount: 512 }], upcomingBookings: [{ totalAmount: '77.10' }], quotes: [{ amount: 1200 }] },
      customerTexts: ['anything under $300 please'],
    });
    const text = 'Your trip cost $512. The next one was USD 77.10 and the quote is $1,200. I kept it under $300.';

    expect(guardPrices(text, allowed)).toEqual({ text, removed: 0 });
  });

  it('removes an estimate', () => {
    const result = guardPrices('Flights to LA are usually around $200. Here are three options.', allowedAmounts({}));

    expect(result).toEqual({ text: 'Here are three options.', removed: 1 });
  });

  it('removes a worked-out difference', () => {
    const allowed = allowedAmounts({ cards: [card(150), card(190)] });
    const result = guardPrices('The first is $150. It is $40 cheaper than the nonstop.', allowed);

    expect(result).toEqual({ text: 'The first is $150.', removed: 1 });
  });

  it('removes a line of a list on its own', () => {
    const result = guardPrices('Options:\n- Delta $999\n- United, see the cards', allowedAmounts({}));

    expect(result).toEqual({ text: 'Options:\n- United, see the cards', removed: 1 });
  });

  it('reads Rs. as one amount, not the end of a sentence', () => {
    const result = guardPrices('The fare is Rs. 500 per person. Book now.', allowedAmounts({}));

    expect(result).toEqual({ text: 'Book now.', removed: 1 });
  });

  it('does not leave an abbreviation behind', () => {
    const result = guardPrices('Flights are approx. $250 one way. Here are options.', allowedAmounts({}));

    expect(result).toEqual({ text: 'Here are options.', removed: 1 });
  });

  it('text with no money is untouched', () => {
    expect(guardPrices('One way or return, and how many people?', allowedAmounts({})))
      .toEqual({ text: 'One way or return, and how many people?', removed: 0 });
  });

  it('a reply with every sentence removed is empty', () => {
    expect(guardPrices('Usually about $999.', allowedAmounts({})).text).toBe('');
  });
});
