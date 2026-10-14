import { describe, expect, it } from 'vitest';
import { generateBookingConfirmationTemplate, generateTripRewardTemplate } from '../../backend/services/email/templates.js';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

describe('the "Your Jet Coins have arrived" email', () => {
  const html = generateTripRewardTemplate({ customerName: 'Jane Doe', coins: 5000, code: 'SHUBHAM', bookingReference: 'FLT1', origin: 'JFK', destination: 'LHR' });

  it('leads with the coins and what they are worth', () => {
    expect(text(html)).toContain('Your Jet Coins have arrived');
    expect(text(html)).toContain('5,000 Jet Coins');
    expect(text(html)).toContain('Worth $50.00');
  });

  it('names the voucher and the trip', () => {
    expect(text(html)).toContain('voucher SHUBHAM has paid out for your trip FLT1 · JFK → LHR');
  });

  it('links to the wallet', () => {
    expect(html).toContain('https://www.jetsetterss.com/profiledashboard?tab=wallet');
  });

  it('uses the brand colours, never a generic blue', () => {
    expect(html).toContain('#055B75');
    for (const blue of ['#0066ff', '#1e40af', '#1976d2', '#0ea5e9']) expect(html.toLowerCase()).not.toContain(blue);
  });

  it('still reads as a sentence with only the coins known', () => {
    const bare = text(generateTripRewardTemplate({ coins: 100 }));
    expect(bare).toContain('100 Jet Coins');
    expect(bare).toContain('Your trip reward has paid out.');
    expect(bare).not.toMatch(/undefined|null|NaN/);
  });
});

describe('the booking confirmation email with a trip-reward voucher', () => {
  const base = { customerName: 'Jane Doe', bookingReference: 'FLT1', bookingType: 'flight', paymentAmount: 122.2, currency: 'USD', passengers: 1, travelDate: '2026-11-15' };
  const charge = { fare: 120, serviceFee: 2.2, discount: 0, total: 122.2, voucher: { id: 'v1', code: 'SHUBHAM', coins: 5000 } };
  const reserved = { code: 'SHUBHAM', coins: 5000, due_at: '2026-11-17T00:00:00.000Z' };

  it('says the coins come after the trip, not as money off, once the reward was reserved', () => {
    const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { verified_charge: charge, trip_reward: reserved } }));
    expect(words).toContain('Voucher SHUBHAM: 5,000 Jet Coins after your trip');
    expect(words).toContain('Total paid $122.20');
    expect(words).not.toContain('−$50.00');
  });

  it('reads the reservation in either spelling of the booking details', () => {
    const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { tripReward: reserved } }));
    expect(words).toContain('Voucher SHUBHAM: 5,000 Jet Coins after your trip');
  });

  it('says nothing when the checkout carried a voucher but no reward was reserved', () => {
    const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { verified_charge: charge } }));
    expect(words).not.toContain('Voucher SHUBHAM');
    expect(words).not.toContain('after your trip');
  });

  it('says nothing about it when the voucher was refused at booking', () => {
    const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { verified_charge: charge, voucher_issue: { kind: 'voucher_refused', code: 'SHUBHAM' } } }));
    expect(words).not.toContain('Voucher SHUBHAM');
  });

  it('says nothing for a booking without a voucher', () => {
    const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { verified_charge: { ...charge, voucher: null } } }));
    expect(words).not.toContain('after your trip');
  });

  it('says nothing for a reservation with no code or no coins', () => {
    for (const trip_reward of [{ coins: 5000 }, { code: 'SHUBHAM', coins: 0 }, { code: 'SHUBHAM' }]) {
      const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { trip_reward } }));
      expect(words).not.toContain('after your trip');
    }
  });
});
