import { describe, expect, it } from 'vitest';
import { generateBookingConfirmationTemplate } from '../../backend/services/email/templates.js';

const base = {
  customerName: 'Jane Doe', bookingReference: 'FLT-1234', bookingType: 'flight',
  paymentAmount: 72.2, currency: 'USD', passengers: 1, travelDate: '2026-11-15',
};

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

describe('the booking confirmation email, when part of the fare was paid with Jet Coins', () => {
  it('lists the coins before Total paid, so the lines add up to what the card paid', () => {
    const html = generateBookingConfirmationTemplate({
      ...base,
      bookingDetails: { baseFare: 100, taxes: 22.2, walletAmount: 50, walletCoins: 5000 },
    });
    const words = text(html);

    expect(words).toContain('Base fare $100.00');
    expect(words).toContain('Taxes and fees $22.20');
    expect(words).toContain('Jet Coins (5,000) −$50.00');
    expect(words).toContain('Total paid $72.20');
    expect(words.indexOf('Taxes and fees')).toBeLessThan(words.indexOf('Jet Coins'));
    expect(words.indexOf('Jet Coins')).toBeLessThan(words.indexOf('Total paid'));
  });

  it('reads the coins from the charge checkout recorded on the booking row', () => {
    const html = generateBookingConfirmationTemplate({
      ...base,
      bookingDetails: {
        verified_charge: { fare: 120, serviceFee: 2.2, discount: 0, walletAmount: 50, walletCoins: 5000, total: 72.2 },
      },
    });

    expect(text(html)).toContain('Jet Coins (5,000) −$50.00');
    expect(text(html)).toContain('Total paid $72.20');
  });

  it('reads them from the fare breakdown when that is all the row has, and then names no count', () => {
    const html = generateBookingConfirmationTemplate({
      ...base,
      bookingDetails: { fare_breakdown: { baseFare: 100, totalTax: 20, serviceFee: 2.2, walletAmount: 50, totalAmount: 122.2 } },
    });

    expect(text(html)).toContain('Jet Coins −$50.00');
    expect(text(html)).not.toContain('Jet Coins (');
  });

  it('is byte-identical to an email with no coins at all when the coins are zero or absent', () => {
    const plain = generateBookingConfirmationTemplate({ ...base, bookingDetails: { baseFare: 72.2, taxes: 0 } });
    const zero = generateBookingConfirmationTemplate({
      ...base,
      bookingDetails: {
        baseFare: 72.2, taxes: 0, walletAmount: 0, walletCoins: 0,
        verified_charge: { fare: 72.2, walletAmount: 0, walletCoins: 0, total: 72.2 },
        fare_breakdown: { walletAmount: 0 },
      },
    });

    expect(zero).toBe(plain);
    expect(plain).not.toContain('Jet Coins');
  });

  it('leaves a booking with no charge on the row exactly as it was', () => {
    const html = generateBookingConfirmationTemplate({ ...base, bookingDetails: { origin: 'DEL', destination: 'BOM', fare_breakdown: null, verified_charge: null } });

    expect(html).not.toContain('Jet Coins');
  });
});
