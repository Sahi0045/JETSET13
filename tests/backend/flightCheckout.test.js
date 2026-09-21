import { readFileSync } from 'node:fs';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * Checkout charges what the airline prices, not what the page sends.
 *
 * Hosted checkout took `amount` from the body verbatim. The offer rode in the
 * same payload and nothing priced it, so a two-adult booking was charged four
 * fares plus $90 of add-ons that did not exist, and a tampered request could
 * set any figure. Nothing re-priced before payment either.
 */

const rows = {};
// What the booking row write answers. supabase-js does not throw on a rejected
// write - it resolves with `{ data, error }` - which is exactly how a failed
// write used to pass for a successful one here.
let upsertError = null;
// When true the FIRST upsert fails and the retry succeeds, which is what a
// rejected owner looks like: the row saves once `user_id` is dropped.
let upsertErrorOnce = false;
let upsertAttempts = 0;
const clientFor = () => ({
  from: vi.fn((table) => {
    const c = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update']) c[m] = vi.fn(() => c);
    c.upsert = vi.fn(() => ({
      ...c,
      then: (resolve) => {
        upsertAttempts += 1;
        const fails = upsertErrorOnce ? upsertAttempts === 1 : Boolean(upsertError);
        resolve({ data: null, error: fails ? upsertError : null });
      },
    }));
    c.single = vi.fn(async () => ({ data: rows[table] ?? null, error: null }));
    c.maybeSingle = c.single;
    return c;
  }),
});

const offerFor = (passengers) => ({
  id: '1',
  price: { total: '400.00', currency: 'USD' },
  travelerPricings: Array.from({ length: passengers }, (_, i) => ({ travelerId: String(i + 1), travelerType: 'ADULT' })),
});

const bookingFor = (passengers) => ({
  originalOffer: offerFor(passengers),
  passengerData: Array.from({ length: passengers }, (_, i) => ({
    firstName: `P${i}`, lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT',
  })),
});

const pricedAt = (total, currency = 'USD') => vi.fn().mockResolvedValue({ price: { total: String(total), base: '300.00', currency } });

const verify = async (opts) => {
  const { verifyFlightCharge } = await import('../../backend/services/flightCheckout.service.js');
  return verifyFlightCharge({ client: clientFor(), ...opts });
};

beforeEach(() => {
  vi.resetModules();
  upsertError = null;
  upsertErrorOnce = false;
  upsertAttempts = 0;
  for (const key of Object.keys(rows)) delete rows[key];
  rows.price_settings = { settings: { flight_taxes_fees: 1, flight_taxes_fees_percentage: 0 } };
});

describe('verifyFlightCharge', () => {
  it('accepts the airline fare plus the configured fee, charged once', async () => {
    const result = await verify({ amount: 402, bookingData: bookingFor(2), priceOffer: pricedAt(400) });

    expect(result.ok).toBe(true);
    expect(result.charge.total).toBe(402);
  });

  // The page's old arithmetic: 400 x 2 passengers + 2 x fee.
  it('refuses the multiplied amount and says what the right one is', async () => {
    const result = await verify({ amount: 802, bookingData: bookingFor(2), priceOffer: pricedAt(400) });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe('PRICE_CHANGED');
    expect(result.charge.total).toBe(402);
  });

  it('refuses a tampered low amount', async () => {
    const result = await verify({ amount: 1, bookingData: bookingFor(2), priceOffer: pricedAt(400) });
    expect(result.code).toBe('PRICE_CHANGED');
  });

  // Found before the card is charged, not after.
  it('refuses when the airline fare moved since the search, and returns the new fare', async () => {
    const result = await verify({ amount: 402, bookingData: bookingFor(2), priceOffer: pricedAt(450) });

    expect(result.code).toBe('PRICE_CHANGED');
    expect(result.pricedFare.total).toBe(450);
    expect(result.charge.total).toBe(452);
  });

  it('refuses more travellers than the fare was priced for', async () => {
    const booking = { ...bookingFor(1), passengerData: [{}, {}] };
    const result = await verify({ amount: 401, bookingData: booking, priceOffer: pricedAt(400) });

    expect(result.code).toBe('PASSENGER_COUNT_MISMATCH');
  });

  // The PNR prints A-Z only: a name in another script was refused by the chain
  // after payment and refunded. Refused here before the fare is priced.
  it('refuses a name the airline cannot print, before pricing', async () => {
    const booking = bookingFor(2);
    booking.passengerData[1] = { ...booking.passengerData[1], firstName: 'Иван' };
    const priceOffer = pricedAt(400);

    const result = await verify({ amount: 402, bookingData: booking, priceOffer });

    expect(result.code).toBe('PASSENGER_NAME_UNUSABLE');
    expect(result.message).toMatch(/^Traveller 2: .*Latin letters/);
    expect(priceOffer).not.toHaveBeenCalled();
  });

  it('accepts a name it can spell in Latin letters', async () => {
    const booking = bookingFor(1);
    booking.passengerData[0] = { ...booking.passengerData[0], firstName: 'Łukasz', lastName: 'Øberg' };

    const result = await verify({ amount: 401, bookingData: booking, priceOffer: pricedAt(400) });

    expect(result.ok).toBe(true);
  });

  it('refuses without an offer to price', async () => {
    const result = await verify({ amount: 401, bookingData: {}, priceOffer: pricedAt(400) });
    expect(result.code).toBe('OFFER_MISSING');
  });

  it('fails closed when the airline cannot price the offer', async () => {
    const result = await verify({
      amount: 401, bookingData: bookingFor(1), priceOffer: vi.fn().mockRejectedValue(new Error('amadeus down')),
    });

    expect(result.status).toBe(503);
    expect(result.code).toBe('PRICE_UNAVAILABLE');
  });

  // Every pricing failure read "try again in a moment", so a fare the airline
  // would no longer sell was retried for ever.
  it('says a fare the airline refuses to price is gone, and to search again', async () => {
    const refused = Object.assign(new Error('the airline refused to price the fare'), { fareUnavailable: true });
    const result = await verify({ amount: 401, bookingData: bookingFor(1), priceOffer: vi.fn().mockRejectedValue(refused) });

    expect(result.status).toBe(409);
    expect(result.code).toBe('FARE_UNAVAILABLE');
    expect(result.message).toMatch(/search again/i);
  });

  it('refuses a fare the merchant cannot settle', async () => {
    const result = await verify({ amount: 401, bookingData: bookingFor(1), priceOffer: pricedAt(400, 'EUR') });
    expect(result.code).toBe('CURRENCY_UNSUPPORTED');
  });

  it('fails closed without price settings rather than inventing a fee', async () => {
    rows.price_settings = null;
    const result = await verify({ amount: 401, bookingData: bookingFor(1), priceOffer: pricedAt(400) });
    expect(result.code).toBe('PRICE_CONFIG_UNAVAILABLE');
  });

  it('applies a coupon it evaluated itself', async () => {
    rows.coupons = { id: 'c1', code: 'FLY10', discount_type: 'percentage', discount_value: 10, min_order_value: 0, max_uses: null, applicable_to: 'all', is_active: true };

    const result = await verify({ amount: 361.8, bookingData: bookingFor(2), couponCode: 'FLY10', priceOffer: pricedAt(400) });

    expect(result.ok).toBe(true);
    expect(result.charge.discount).toBe(40.2);
    expect(result.coupon.code).toBe('FLY10');
  });

  // A payment page cannot be opened for $0.00. The page sent 0 and was answered
  // "Missing required fields: amount and orderId are required".
  it('refuses a coupon that leaves nothing to charge, and says why', async () => {
    rows.coupons = { id: 'c1', code: 'FREE', discount_type: 'percentage', discount_value: 100, min_order_value: 0, max_uses: null, applicable_to: 'all', is_active: true };

    const result = await verify({ amount: 0, bookingData: bookingFor(1), couponCode: 'FREE', priceOffer: pricedAt(400) });

    expect(result.code).toBe('COUPON_INVALID');
    expect(result.message).toMatch(/covers the whole fare/);
    expect(result.message).toMatch(/\$0\.00/);
  });

  it('refuses a coupon that does not exist', async () => {
    rows.coupons = null;
    const result = await verify({ amount: 361.8, bookingData: bookingFor(2), couponCode: 'NOPE', priceOffer: pricedAt(400) });
    expect(result.code).toBe('COUPON_INVALID');
  });

  // A guest has no account, so the one-per-customer check was skipped for them.
  it("holds a guest to the coupon's one use by their email", async () => {
    rows.coupons = { id: 'c1', code: 'FLY10', discount_type: 'percentage', discount_value: 10, min_order_value: 0, max_uses: null, applicable_to: 'all', is_active: true };
    rows.coupon_usage = { id: 'u1' };

    const result = await verify({
      amount: 361.8, bookingData: bookingFor(2), couponCode: 'FLY10', userId: null, email: 'guest@example.com', priceOffer: pricedAt(400),
    });

    expect(result.code).toBe('COUPON_INVALID');
  });

  // The order route refused an incomplete traveller too - after the charge,
  // and then had to reverse it.
  it('refuses a traveller the airline would need more from, before payment', async () => {
    const booking = bookingFor(2);
    booking.passengerData[1] = { ...booking.passengerData[1], dateOfBirth: '' };

    // Pricing did not say whether the trip crosses a border: that counts as crossing.
    const result = await verify({ amount: 402, bookingData: booking, priceOffer: pricedAt(400) });

    expect(result.code).toBe('PASSENGERS_INCOMPLETE');
  });

  // The owner's decision of 2026-09-15: a lap infant pays no fixed service fee.
  // Checkout and the review page both take it from the offer's own pricings,
  // so they cannot disagree - and neither reads it from the traveller forms.
  describe('a lap infant', () => {
    const withLapInfant = () => {
      const booking = bookingFor(2);
      booking.originalOffer.travelerPricings.push({ travelerId: '3', travelerType: 'HELD_INFANT', associatedAdultId: '1' });
      booking.passengerData.push({ firstName: 'Mia', lastName: 'Doe', gender: 'female', dateOfBirth: '2025-06-01', type: 'HELD_INFANT' });
      return booking;
    };

    it('adds no fixed fee: two adults and a lap infant pay two', async () => {
      const result = await verify({ amount: 402, bookingData: withLapInfant(), priceOffer: pricedAt(400) });

      expect(result.ok).toBe(true);
      expect(result.charge.fixedFee).toBe(2);
      expect(result.charge.total).toBe(402);
    });

    it('refuses the old figure, which charged the infant a fee too', async () => {
      const result = await verify({ amount: 403, bookingData: withLapInfant(), priceOffer: pricedAt(400) });

      expect(result.code).toBe('PRICE_CHANGED');
      expect(result.charge.total).toBe(402);
    });

    it('accepts exactly the total the review page computes for the same offer', async () => {
      const { computeFlightCharge, travellerTypesOf } = await import('../../shared/flightCharge.js');
      const booking = withLapInfant();
      // The page's own call (FlightBookingConfirmation.jsx), on the same settings.
      const page = computeFlightCharge({
        fareTotal: 400, travellerTypes: travellerTypesOf(booking.originalOffer), config: rows.price_settings.settings,
      });

      const result = await verify({ amount: page.total, bookingData: booking, priceOffer: pricedAt(400) });

      expect(result.ok).toBe(true);
      expect(result.charge.total).toBe(page.total);
      expect(result.charge.fixedFeeByType).toEqual(page.fixedFeeByType);
    });

    it('takes a coupon off the total without the infant fee', async () => {
      rows.coupons = { id: 'c1', code: 'FLY10', discount_type: 'percentage', discount_value: 10, min_order_value: 0, max_uses: null, applicable_to: 'all', is_active: true };

      const result = await verify({ amount: 361.8, bookingData: withLapInfant(), couponCode: 'FLY10', priceOffer: pricedAt(400) });

      expect(result.ok).toBe(true);
      expect(result.charge.discount).toBe(40.2);
    });
  });

  // Checkout checked only that names, a gender and a needed date of birth were
  // there. The order route then refused - after payment - a child on an adult's
  // fare, and the airline would not ticket a trip abroad without a passport.
  describe('travellers, checked as the review page checks them', () => {
    const roundTrip = (passengerData, travelerPricings) => ({
      originalOffer: {
        id: '1',
        price: { total: '400.00', currency: 'USD' },
        itineraries: [
          { segments: [{ departure: { iataCode: 'JFK', at: '2026-10-04T18:00:00' }, arrival: { iataCode: 'LHR', at: '2026-10-05T06:00:00' } }] },
          { segments: [{ departure: { iataCode: 'LHR', at: '2026-10-25T10:00:00' }, arrival: { iataCode: 'JFK', at: '2026-10-25T13:00:00' } }] },
        ],
        travelerPricings,
      },
      passengerData,
    });
    const adult = { firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT', nationality: 'US', passportNumber: 'X1234567', passportExpiry: '2030-01-01' };
    const abroad = () => vi.fn().mockResolvedValue({ price: { total: '400.00', base: '300.00', currency: 'USD' }, _ama: { international: true } });

    it("refuses a child booked on an adult's fare, before pricing", async () => {
      const priceOffer = abroad();
      const booking = roundTrip(
        [adult, { ...adult, firstName: 'Tom', dateOfBirth: '2018-05-05', type: 'CHILD' }],
        [{ travelerType: 'ADULT' }, { travelerType: 'ADULT' }],
      );

      const result = await verify({ amount: 402, bookingData: booking, priceOffer });

      expect(result.code).toBe('PASSENGER_COUNT_MISMATCH');
      expect(result.message).toMatch(/for 2 adults/);
      expect(priceOffer).not.toHaveBeenCalled();
    });

    it('refuses an infant who turns 2 before the flight home', async () => {
      const infant = { ...adult, firstName: 'Mia', dateOfBirth: '2024-10-20', type: 'HELD_INFANT' };
      const booking = roundTrip([adult, infant], [{ travelerType: 'ADULT' }, { travelerType: 'HELD_INFANT' }]);

      const result = await verify({ amount: 401, bookingData: booking, priceOffer: abroad() });

      expect(result.code).toBe('PASSENGERS_INCOMPLETE');
      expect(result.message).toMatch(/^Traveller 2: Infant fares are for travellers under 2 on every flight of the trip\./);
    });

    it('refuses a trip abroad without a passport', async () => {
      const booking = roundTrip([{ ...adult, passportNumber: '' }], [{ travelerType: 'ADULT' }]);

      const result = await verify({ amount: 401, bookingData: booking, priceOffer: abroad() });

      expect(result.code).toBe('PASSENGERS_INCOMPLETE');
      expect(result.message).toMatch(/Enter the passport number\./);
    });

    it('refuses a passport that expires before the flight home', async () => {
      const booking = roundTrip([{ ...adult, passportExpiry: '2026-10-15' }], [{ travelerType: 'ADULT' }]);

      const result = await verify({ amount: 401, bookingData: booking, priceOffer: abroad() });

      expect(result.message).toMatch(/The passport expires before the trip ends\./);
    });

    it('asks for no passport when the airport index does not know the trip crosses a border', async () => {
      const booking = roundTrip([{ ...adult, passportNumber: '' }], [{ travelerType: 'ADULT' }]);

      const result = await verify({ amount: 401, bookingData: booking, priceOffer: pricedAt(400) });

      expect(result.ok).toBe(true);
    });

    it('says what the review page says a traveller still needs', async () => {
      const { travellerProblems } = await import('../../frontend/src/utils/travellerChecks.js');
      const { tripDates } = await import('../../shared/travellerDetails.js');
      const traveller = { ...adult, passportExpiry: '2026-10-15' };
      const booking = roundTrip([traveller], [{ travelerType: 'ADULT' }]);
      const { firstDate, lastDate } = tripDates(booking.originalOffer);
      const page = travellerProblems(traveller, { index: 1, international: true, travelDate: firstDate, lastDate });

      const result = await verify({ amount: 401, bookingData: booking, priceOffer: abroad() });

      expect(page).toHaveLength(1);
      expect(result.message).toBe(`Traveller 1: ${page[0]} Nothing has been charged.`);
    });

    it('passes a complete traveller', async () => {
      const result = await verify({ amount: 401, bookingData: roundTrip([adult], [{ travelerType: 'ADULT' }]), priceOffer: abroad() });
      expect(result.ok).toBe(true);
    });
  });

  it('lets domestic adults pay without a date of birth', async () => {
    const booking = bookingFor(2);
    booking.passengerData = booking.passengerData.map(({ dateOfBirth, ...rest }) => rest);
    const priceOffer = vi.fn().mockResolvedValue({ price: { total: '400.00', base: '300.00', currency: 'USD' }, _ama: { international: false } });

    const result = await verify({ amount: 402, bookingData: booking, priceOffer });

    expect(result.ok).toBe(true);
  });

  /**
   * Booking switched off, refused before the card rather than after it.
   *
   * AMADEUS_WS_BOOKING_ENABLED is false in production while the office waits
   * for Amadeus certification. The order route honours it - but it runs after
   * ARC's hosted checkout has completed, so its refusal means charging the
   * customer and reversing it. Its own comment says so: "this gate does NOT run
   * before the money moves... by now the customer has already paid." A charge
   * and a refund for a booking that was never possible defeats the purpose of
   * the flag.
   *
   * The answer cannot come from checkout's own environment, because checkout
   * runs on Vercel and Vercel never books - it forwards pricing to the host
   * that does. So the host that priced the offer says whether it would book it,
   * on `_ama.bookingEnabled`, exactly as it already answers `international`.
   */
  describe('booking switched off', () => {
    const pricedWith = (ama) => vi.fn().mockResolvedValue({
      price: { total: '400.00', base: '300.00', currency: 'USD' },
      _ama: { international: false, ...ama },
    });

    it('refuses before the charge when the booking host says it would not book', async () => {
      const result = await verify({ amount: 402, bookingData: bookingFor(1), priceOffer: pricedWith({ bookingEnabled: false }) });

      expect(result.ok).toBe(false);
      expect(result.code).toBe('BOOKING_DISABLED');
      expect(result.status).toBe(503);
    });

    it('tells the customer nothing was taken, and how to book instead', async () => {
      const result = await verify({ amount: 402, bookingData: bookingFor(1), priceOffer: pricedWith({ bookingEnabled: false }) });

      // The phrase "nothing has been charged" is deliberately absent: the
      // review page strips it, and the sentence came out mangled.
      expect(result.message).toMatch(/temporarily unavailable/i);
      expect(result.message).toMatch(/877\) 538-7380/);
    });

    it('proceeds when the booking host says it would book', async () => {
      const result = await verify({ amount: 401, bookingData: bookingFor(1), priceOffer: pricedWith({ bookingEnabled: true }) });

      expect(result.ok).toBe(true);
    });

    /**
     * An older server that does not send the field must not stop a booking that
     * would have worked. Absent is unknown, and unknown is not "off".
     */
    it('does not refuse when the answer is absent', async () => {
      const result = await verify({ amount: 401, bookingData: bookingFor(1), priceOffer: pricedWith({}) });

      expect(result.ok).toBe(true);
    });

    /**
     * Asked before the traveller checks, so a customer who cannot book at all is
     * not first sent away to find a passport number.
     */
    it('is answered before the traveller details are picked over', async () => {
      const incomplete = bookingFor(1);
      delete incomplete.passengerData[0].dateOfBirth;

      const result = await verify({ amount: 402, bookingData: incomplete, priceOffer: pricedWith({ bookingEnabled: false }) });

      expect(result.code).toBe('BOOKING_DISABLED');
    });
  });
});

describe('priceOfferForCheckout tells a refused fare from an outage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('../../backend/services/flightProvider.js');
  });

  const price = async () => {
    const { priceOfferForCheckout } = await import('../../backend/services/flightCheckout.service.js');
    return priceOfferForCheckout({ id: '1' }).then(() => null, (error) => error);
  };

  describe('through the pricing route (Vercel)', () => {
    beforeEach(() => {
      vi.stubEnv('FLIGHTS_API_BASE', 'https://api.test');
      axios.post.mockReset();
    });

    it("flags the route's FARE_UNAVAILABLE", async () => {
      axios.post.mockResolvedValue({ status: 409, data: { success: false, code: 'FARE_UNAVAILABLE', error: 'This flight can no longer be priced - please search again' } });
      expect((await price()).fareUnavailable).toBe(true);
    });

    it('does not flag a failure to price', async () => {
      axios.post.mockResolvedValue({ status: 500, data: { success: false, error: 'Flight service is not responding' } });
      const error = await price();
      expect(error).toBeInstanceOf(Error);
      expect(error.fareUnavailable).toBeUndefined();
    });

    // Checkout runs just before the charge, so it asks the route to confirm the
    // seats with the airline as well as the price.
    it('asks the pricing route to confirm the seats', async () => {
      axios.post.mockResolvedValue({ status: 200, data: { success: true, data: { flightOffers: [{ price: { total: '400.00' } }] }, meta: { international: true } } });
      await price();
      expect(axios.post).toHaveBeenCalledWith('https://api.test/api/flights/price', { flightOffer: { id: '1' }, confirmSeats: true }, expect.any(Object));
    });
  });

  describe('directly (Lightsail)', () => {
    const withProvider = (priceFlightOffer) => {
      vi.stubEnv('FLIGHTS_API_BASE', '');
      vi.stubEnv('VERCEL', '');
      vi.doMock('../../backend/services/flightProvider.js', () => ({ default: { priceFlightOffer } }));
    };

    it("flags the airline's refusal", async () => {
      const { AmadeusSoapError } = await import('../../backend/services/amadeusSoap/errors.js');
      withProvider(vi.fn().mockRejectedValue(new AmadeusSoapError({ error: 'That flight is no longer available at this price', code: 409 })));
      expect((await price()).fareUnavailable).toBe(true);
    });

    it('does not flag an airline that did not answer', async () => {
      const { AmadeusSoapError } = await import('../../backend/services/amadeusSoap/errors.js');
      withProvider(vi.fn().mockRejectedValue(new AmadeusSoapError({ error: 'Flight service is not responding', code: 504 })));
      expect((await price()).fareUnavailable).toBeUndefined();
    });

    const pricedOk = () => vi.fn().mockResolvedValue({ success: true, data: { flightOffers: [{ price: { total: '400.00' } }] } });
    const withSeatCheck = (confirmSeats, seatCheckBeforePayment = true, bookingEnabled = true) => {
      vi.stubEnv('FLIGHTS_API_BASE', '');
      vi.stubEnv('VERCEL', '');
      vi.stubEnv('AMADEUS_WS_SEAT_CHECK_BEFORE_PAYMENT', String(seatCheckBeforePayment));
      vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', String(bookingEnabled));
      vi.doMock('../../backend/services/flightProvider.js', () => ({
        default: { priceFlightOffer: pricedOk(), confirmSeats },
      }));
    };

    it('flags seats the airline will not sell, after pricing', async () => {
      const { AmadeusSoapError } = await import('../../backend/services/amadeusSoap/errors.js');
      const confirmSeats = vi.fn().mockRejectedValue(new AmadeusSoapError({ error: 'That flight is no longer available at this price', code: 409 }));
      withSeatCheck(confirmSeats);
      expect((await price()).fareUnavailable).toBe(true);
      expect(confirmSeats).toHaveBeenCalledTimes(1);
    });

    it('does not confirm the seats when the check is switched off', async () => {
      const confirmSeats = vi.fn();
      withSeatCheck(confirmSeats, false);
      expect(await price()).toBeNull();
      expect(confirmSeats).not.toHaveBeenCalled();
    });

    // With booking off, verifyFlightCharge answers BOOKING_DISABLED for every
    // checkout - but only after this returns, so the seats were sold and
    // released at the airline first, for a checkout that could never become a
    // booking. Each one counted against the office's look-to-book ratio.
    it('does not sell the seats while booking is switched off', async () => {
      const confirmSeats = vi.fn();
      withSeatCheck(confirmSeats, true, false);
      const { priceOfferForCheckout } = await import('../../backend/services/flightCheckout.service.js');

      const priced = await priceOfferForCheckout({ id: '1' });

      expect(confirmSeats).not.toHaveBeenCalled();
      // And the answer still says so, for verifyFlightCharge to refuse on.
      expect(priced._ama.bookingEnabled).toBe(false);
    });
  });
});

describe('hosted checkout for a flight', () => {
  const arcSession = { status: 201, data: { result: 'SUCCESS', session: { id: 'S1' }, successIndicator: 'SI' } };

  const CUSTOMER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4' };

  const run = async (verdict, { user = CUSTOMER, body = {} } = {}) => {
    const verifyFlightCharge = vi.fn().mockResolvedValue(verdict);
    vi.doMock('../../backend/services/flightCheckout.service.js', () => ({ verifyFlightCharge }));
    vi.doMock('../../backend/routes/payment/arcpay.config.js', async () => {
      const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
      return {
        ...actual,
        supabase: clientFor(),
        ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
      };
    });
    const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
    const req = createRequest({
      method: 'POST',
      user,
      body: { amount: '802.00', orderId: 'FLTX1', bookingType: 'flight', bookingData: bookingFor(2), ...body },
    });
    const res = createResponse();
    await handleHostedCheckout(req, res);
    return { res, verifyFlightCharge };
  };

  beforeEach(() => {
    axios.post.mockReset();
    axios.post.mockResolvedValue(arcSession);
  });

  it('never opens a payment session for an amount the server did not verify', async () => {
    const { res } = await run({ ok: false, status: 409, code: 'PRICE_CHANGED', message: 'The total is 402.00 USD.', charge: { total: 402 } });

    expect(res.statusCode).toBe(409);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('answers a request with nothing to charge in words for the customer, not its field names', async () => {
    const { res, verifyFlightCharge } = await run({ ok: true, charge: { total: 402 } }, { body: { amount: 0 } });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CHECKOUT_INCOMPLETE');
    expect(res.body.error).not.toMatch(/Missing required fields|orderId/);
    expect(verifyFlightCharge).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('charges the verified total, not the amount in the request', async () => {
    await run({ ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } });

    const sent = axios.post.mock.calls.find(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT')?.[1];
    expect(sent.order.amount).toBe('402.00');
  });

  // The success indicator is what proves the payer to the order route. ARC gives
  // it to the paying browser on the way back; this response handed it to
  // whoever opened the session, before any payment.
  it('never returns the payment secret to the page that opened the session', async () => {
    const { res } = await run({ ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('successIndicator');
    expect(JSON.stringify(res.body)).not.toContain('"SI"');
  });

  // Checkout upserted on the reference whatever the row held - a paid booking,
  // a PNR, someone else's checkout - resetting it to unpaid with a new secret.
  describe('an order reference that is already in use', () => {
    const verified = { ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } };

    it("refuses another customer's reference, before pricing or a payment session", async () => {
      rows.bookings = { user_id: 'someone-else', status: 'pending', payment_status: 'unpaid', booking_details: {} };

      const { res, verifyFlightCharge } = await run(verified);

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('ORDER_REFERENCE_IN_USE');
      expect(verifyFlightCharge).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it("refuses the customer's own reference once it has been paid", async () => {
      rows.bookings = { user_id: CUSTOMER.id, status: 'pending', payment_status: 'paid', booking_details: { arc_captured_amount: 402 } };

      const { res } = await run(verified);

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('ORDER_REFERENCE_IN_USE');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('lets the same customer start their own unpaid checkout again', async () => {
      rows.bookings = { user_id: CUSTOMER.id, status: 'pending', payment_status: 'unpaid', booking_details: {} };

      const { res } = await run(verified);

      expect(res.statusCode).toBe(200);
    });
  });

  // Guest flight booking is an admin switch (Feature Flags), off unless an
  // admin turns it on: a booking with no account behind it never shows in My
  // Trips, and the email it was made with is the only way back to it.
  describe('a signed-out customer', () => {
    const verified = { ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } };
    const guest = { user: null, body: { customerEmail: 'guest@example.com' } };

    it('is refused while guest booking has never been switched on, before pricing or a payment session', async () => {
      const { res, verifyFlightCharge } = await run(verified, guest);

      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('LOGIN_REQUIRED');
      expect(verifyFlightCharge).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('is refused once an admin switches guest booking off', async () => {
      rows.feature_flags = { enabled: false };
      const { res, verifyFlightCharge } = await run(verified, guest);

      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('LOGIN_REQUIRED');
      expect(verifyFlightCharge).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('books as a guest while guest booking is on, priced for no account', async () => {
      rows.feature_flags = { enabled: true };
      const { res, verifyFlightCharge } = await run(verified, guest);

      expect(res.statusCode).toBe(200);
      expect(verifyFlightCharge).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
      const sent = axios.post.mock.calls.find(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT')?.[1];
      expect(sent.order.amount).toBe('402.00');
    });

    it.each([[undefined], [''], ['not-an-email']])('must give an email to book as a guest (%j)', async (customerEmail) => {
      rows.feature_flags = { enabled: true };
      const { res, verifyFlightCharge } = await run(verified, { user: null, body: { customerEmail } });

      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('EMAIL_REQUIRED');
      expect(verifyFlightCharge).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  // No feature_flags row here: guest booking is off, and a signed-in customer
  // is not affected by it.

  it('prices the fare for the signed-in customer', async () => {
    const { verifyFlightCharge } = await run({ ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } });

    expect(verifyFlightCharge).toHaveBeenCalledWith(expect.objectContaining({ userId: CUSTOMER.id }));
  });

  describe('airline data sent with the charge', () => {
    const verified = { ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } };
    const withLegs = {
      flightData: {
        itineraries: [{
          segments: [{ carrierCode: 'LH', number: '401', departure: { iataCode: 'JFK', at: '2026-10-04T18:00:00' }, arrival: { iataCode: 'FRA' } }],
        }],
      },
    };
    const initiated = () => axios.post.mock.calls.find(([, sent]) => sent?.apiOperation === 'INITIATE_CHECKOUT')?.[1];

    afterEach(() => vi.unstubAllEnvs());

    it("carries the agency's own ARC code when one is configured", async () => {
      vi.stubEnv('ARC_TRAVEL_AGENT_CODE', '12345678');
      await run(verified, { body: withLegs });

      expect(initiated().airline.ticket.issue.travelAgentCode).toBe('12345678');
    });

    // Only the first itinerary was read, so a round trip went to the card
    // network as one way.
    it('sends the legs home of a round trip, and names the outbound destination', async () => {
      vi.stubEnv('ARC_TRAVEL_AGENT_CODE', '12345678');
      const roundTrip = {
        flightData: {
          itineraries: [
            withLegs.flightData.itineraries[0],
            { segments: [{ carrierCode: 'LH', number: '400', departure: { iataCode: 'FRA', at: '2026-10-20T10:00:00' }, arrival: { iataCode: 'JFK' } }] },
          ],
        },
      };
      await run(verified, { body: roundTrip });

      const legs = initiated().airline.itinerary.leg;
      expect(legs.map((leg) => `${leg.departureAirport}-${leg.destinationAirport}`)).toEqual(['JFK-FRA', 'FRA-JFK']);
      expect(legs[1]).toMatchObject({ flightNumber: 'LH400', departureDate: '2026-10-20' });
    });

    // Unset, it was derived from the merchant id: the live merchant sent part of
    // its merchant id to the card network as an agency code.
    it('sends no airline data rather than an invented agency code, and still opens the checkout', async () => {
      vi.stubEnv('ARC_TRAVEL_AGENT_CODE', '');
      await run(verified, { body: withLegs });

      expect(initiated()).toBeDefined();
      expect(initiated().airline).toBeUndefined();
    });

    it('holds no test merchant id to derive a code from', () => {
      const source = readFileSync(new URL('../../backend/routes/payment/checkout.handlers.js', import.meta.url), 'utf8');
      expect(source).not.toMatch(/TESTARC|05511704/);
    });
  });

  /**
   * A payment page is only handed back once the booking is recorded.
   *
   * The row write was `await supabase...upsert(...)` with the result discarded.
   * supabase-js does not throw on a rejected write - a foreign key on `user_id`,
   * an RLS refusal, a CHECK - it answers `{ data, error }`. So the failure logged
   * "Pending booking saved to DB" and returned 200 with a live ARC checkout URL,
   * and the `catch` only ever fired on a transport error.
   *
   * Without that row the customer is unreachable by everything: the order route
   * answers 402 PAYMENT_NOT_FOUND, and every job - abandoned checkout, the
   * booking queue, both alarms, ticket sync - starts from the `bookings` table.
   * Money captured, no ticket, no refund, no alert, no record.
   */
  describe('a checkout whose booking row cannot be written', () => {
    const verified = { ok: true, charge: { total: 402, base: 400, fee: 2, discount: 0 }, coupon: null, pricedFare: { total: 400 } };

    beforeEach(() => {
      axios.post.mockReset();
      axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'S1' }, successIndicator: 'SI' } });
    });

    it('does not hand back a payment page', async () => {
      upsertError = { message: 'null value in column "total_amount" violates not-null constraint', code: '23502' };

      const { res } = await run(verified);

      expect(res.statusCode).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('CHECKOUT_NOT_RECORDED');
      expect(res.body.paymentPageUrl).toBeUndefined();
      expect(res.body.sessionId).toBeUndefined();
    });

    it('tells the customer nothing was charged, and how else to book', async () => {
      upsertError = { message: 'permission denied', code: '42P01' };

      const { res } = await run(verified);

      expect(res.body.error).toMatch(/could not start your payment/i);
      expect(res.body.error).toMatch(/877\) 538-7380/);
    });

    /**
     * An owner the bookings table cannot accept is NOT a reason to refuse the
     * sale, and the first version of this refused exactly those two codes.
     *
     * `bookings.user_id` REFERENCES auth.users(id), and `resolveBookingUserId`
     * can legitimately return an id that is not in it - a travel agent's token
     * carries a `travel_agents` id, a legacy login a `public.users` id. The
     * order route has always recovered by saving without the owner
     * (flight.routes.js, "Retrying booking save without user_id"); refusing
     * here would have stopped those customers buying at all.
     */
    it('saves without the owner when the owner is rejected, and still opens the payment page', async () => {
      upsertError = { message: 'insert or update on table "bookings" violates foreign key constraint', code: '23503' };
      // The retry succeeds - that is what `upsertAttempts` models.
      upsertErrorOnce = true;

      const { res } = await run(verified);

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentPageUrl).toMatch(/arcpay\.travel\/checkout\/pay\/S1/);
    });

    it('does the same for a row-level security refusal', async () => {
      upsertError = { message: 'new row violates row-level security policy', code: '42501' };
      upsertErrorOnce = true;

      const { res } = await run(verified);

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentPageUrl).toBeDefined();
    });

    it('still refuses when even the unowned save fails', async () => {
      upsertError = { message: 'violates foreign key constraint', code: '23503' };
      upsertErrorOnce = false;

      const { res } = await run(verified);

      expect(res.statusCode).toBe(503);
      expect(res.body.code).toBe('CHECKOUT_NOT_RECORDED');
    });

    it('still opens the payment page when the row is written', async () => {
      const { res } = await run(verified);

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentPageUrl).toMatch(/arcpay\.travel\/checkout\/pay\/S1/);
    });
  });
});
