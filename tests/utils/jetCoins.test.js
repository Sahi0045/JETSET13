import { describe, expect, it } from 'vitest';
import { computeFlightCharge, MIN_CARD_CHARGE } from '../../shared/flightCharge.js';
import {
  coinsBackOnCancel, coinsToUsd, earnedCoinsFor, formatCoins, grossPaidOf, maxWalletCoinsFor,
} from '../../shared/jetCoins.js';
import { cancelTermsLines, customerCancelTerms } from '../../shared/flightCancelPolicy.js';

const config = { flight_taxes_fees: 1, flight_taxes_fees_percentage: 1 };
const THREE_DAYS_AGO = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

describe('Jet Coins in the charge', () => {
  it('takes coins off after the fee and leaves the card the rest', () => {
    const charge = computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, walletAmount: 50 });
    expect(charge.subtotal).toBe(122.2);
    expect(charge.walletAmount).toBe(50);
    expect(charge.walletCoins).toBe(5000);
    expect(charge.total).toBe(72.2);
  });

  it('always leaves at least $1 on the card', () => {
    const charge = computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, walletAmount: 500 });
    expect(MIN_CARD_CHARGE).toBe(1);
    expect(charge.total).toBe(1);
    expect(charge.walletAmount).toBe(121.2);
  });

  it('takes the coupon first', () => {
    const charge = computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, discount: 20, walletAmount: 50 });
    expect(charge.total).toBe(52.2);
  });

  it('applies no coins when a coupon leaves less than $1', () => {
    const charge = computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, discount: 121.5, walletAmount: 50 });
    expect(charge.walletAmount).toBe(0);
    expect(charge.total).toBe(0.7);
  });

  it('charges exactly as before with no coins', () => {
    const before = computeFlightCharge({ fareTotal: 128.1, travellerTypes: ['ADULT'], config });
    expect(before.walletAmount).toBe(0);
    expect(before.total).toBe(130.38);
  });

  it('ignores coins that are negative or not a number', () => {
    expect(computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, walletAmount: -50 })).toMatchObject({ walletAmount: 0, walletCoins: 0, total: 122.2 });
    expect(computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, walletAmount: 'abc' })).toMatchObject({ walletAmount: 0, walletCoins: 0, total: 122.2 });
  });
});

describe('coin helpers', () => {
  it('converts and caps', () => {
    expect(coinsToUsd(5000)).toBe(50);
    expect(maxWalletCoinsFor(122.2, 5000)).toBe(5000);
    expect(maxWalletCoinsFor(30, 5000)).toBe(2900);
    expect(maxWalletCoinsFor(0.7, 5000)).toBe(0);
    expect(maxWalletCoinsFor(30, -5)).toBe(0);
  });

  it('knows the whole price paid', () => {
    expect(grossPaidOf({ total: 72.2, walletAmount: 50 })).toBe(122.2);
    expect(grossPaidOf({ total: 130.38 })).toBe(130.38);
  });

  it('earns a coin per whole card dollar', () => {
    expect(earnedCoinsFor(130.38)).toBe(130);
    expect(earnedCoinsFor(0.99)).toBe(0);
  });

  it('formats coins', () => {
    expect(formatCoins(5000)).toBe('5,000');
  });
});

describe('coins back on a cancel', () => {
  it('gives every coin back on a whole or fee-kept refund', () => {
    expect(coinsBackOnCancel({ action: 'refund_all', heldAmount: 72.2, kept: 0, coins: 5000 })).toBe(5000);
    expect(coinsBackOnCancel({ action: 'refund_less_fee', heldAmount: 72.2, kept: 2.2, coins: 5000 })).toBe(5000);
  });

  it('fee_covers returns only the coins still owed', () => {
    expect(coinsBackOnCancel({ action: 'fee_covers', heldAmount: 1, kept: 2.2, coins: 12120 })).toBe(12000);
    expect(coinsBackOnCancel({ action: 'fee_covers', heldAmount: 1, kept: 300, coins: 5000 })).toBe(0);
  });

  it('gives nothing back automatically on a review', () => {
    expect(coinsBackOnCancel({ action: 'review', heldAmount: 72.2, kept: 2.2, coins: 5000 })).toBe(0);
  });
});

describe('cancel terms with coins', () => {
  const cancel = (over = {}) => customerCancelTerms({
    charge: { total: 72.2, walletAmount: 50, walletCoins: 5000, serviceFee: 2.2, discount: 0 },
    paidAt: new Date().toISOString(),
    timeZone: 'America/Los_Angeles',
    hasReservation: true,
    ticketed: false,
    ...over,
  });

  it('works the airline price from the whole price paid, coins first', () => {
    const terms = cancel();
    expect(terms.paid).toBe(122.2);
    expect(terms.airlinePrice).toBe(120);
    expect(terms.coinsBack).toBe(5000);
    expect(terms.cardBack).toBe(70);
  });

  it('gives back no coins on a booking paid without any', () => {
    const terms = cancel({ charge: { total: 122.2, serviceFee: 2.2, discount: 0 } });
    expect(terms.coinsBack).toBe(0);
    expect(terms.cardBack).toBe(120);
  });

  it('gives the fee-kept share back in coins first when the card part is small', () => {
    const terms = cancel({ charge: { total: 1, walletAmount: 121.2, walletCoins: 12120, serviceFee: 2.2, discount: 0 } });
    expect(terms.airlinePrice).toBe(120);
    expect(terms.coinsBack).toBe(12000);
    expect(terms.cardBack).toBe(0);
  });

  it('returns every coin and every card dollar for a booking the airline never had', () => {
    const terms = cancel({ hasReservation: false });
    expect(terms).toMatchObject({ policy: 'never_booked', refundAmount: 122.2, coinsBack: 5000, cardBack: 72.2 });
  });

  it('leaves the coin split open when the amount is decided later', () => {
    const terms = cancel({ ticketed: true, paidAt: THREE_DAYS_AGO, fareRule: { refundable: false, penalty: null, currency: null } });
    expect(terms).toMatchObject({ policy: 'non_refundable', automatic: false, refundAmount: null, coinsBack: 0, cardBack: null });
  });

  it('says in words where the money goes', () => {
    const lines = cancelTermsLines(cancel());
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('$50.00 goes back to your Jet Wallet as 5,000 Jet Coins, and the rest to your card.');
  });

  it('leaves out the card when coins cover the whole refund', () => {
    const lines = cancelTermsLines(cancel({ charge: { total: 1, walletAmount: 121.2, walletCoins: 12120, serviceFee: 2.2, discount: 0 } }));
    expect(lines[1]).toBe('$120.00 goes back to your Jet Wallet as 12,000 Jet Coins.');
  });

  it('says nothing about coins on a booking paid without any', () => {
    expect(cancelTermsLines(cancel({ charge: { total: 122.2, serviceFee: 2.2, discount: 0 } }))).toHaveLength(1);
  });

  it('says nothing about coins when the amount is not yet decided', () => {
    const lines = cancelTermsLines(cancel({ ticketed: true, paidAt: THREE_DAYS_AGO, fareRule: { refundable: false, penalty: null, currency: null } }));
    expect(lines.join(' ')).not.toContain('Jet Coins');
  });
});
