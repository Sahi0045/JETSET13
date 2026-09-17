import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * One trip, one open payment page.
 *
 * Every Pay click on the review page opened a new ARC hosted checkout under a
 * new reference: a double click, the back button after the payment page
 * opened, or a second tab gave the customer two live payment pages, and paying
 * both booked the trip twice. Hosted checkout now hands back the page this
 * customer opened moments ago for exactly this trip - and never the success
 * indicator, the secret that proves who paid.
 */

const CUSTOMER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4' };
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const SITE = 'https://www.jetsetterss.com';

const offer = {
  id: '1',
  itineraries: [{ segments: [{ carrierCode: 'LH', number: '401', departure: { iataCode: 'JFK', at: '2026-10-04T18:00:00' }, arrival: { iataCode: 'FRA' } }] }],
  price: { total: '400.00', currency: 'USD' },
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }, { travelerId: '2', travelerType: 'ADULT' }],
};
const passengers = [
  { firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT', passportNumber: 'X1234567' },
  { firstName: 'John', lastName: 'Doe', gender: 'male', dateOfBirth: '1988-02-02', type: 'ADULT', passportNumber: 'X7654321' },
];
const bookingData = (over = {}) => ({
  originalOffer: offer,
  passengerData: passengers,
  bookingDetails: { contact: { email: 'jane@example.com', phone: '5550100' } },
  ...over,
});

/** The payment page opened two minutes ago for this trip, still unpaid. */
const openCheckout = (over = {}) => ({
  booking_reference: 'FLTFIRST1',
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'unpaid',
  user_id: CUSTOMER.id,
  total_amount: 402,
  created_at: minutesAgo(2),
  ...over,
  booking_details: {
    order_id: 'FLTFIRST1',
    session_id: 'SESSION-FIRST',
    success_indicator: 'SECRET-FIRST',
    arc_pay_checkout_url: 'https://api.arcpay.travel/checkout/pay/SESSION-FIRST',
    checkout_created_at: minutesAgo(2),
    customer_email: 'jane@example.com',
    verified_charge: { total: 402, coupon: null, pricedFare: { total: 400, currency: 'USD' } },
    pending_booking_data: {
      returnUrl: `${SITE}/payment/callback?orderId=FLTFIRST1&bookingType=flight`,
      customerEmail: 'jane@example.com',
      bookingData: bookingData(),
    },
    ...(over.booking_details || {}),
  },
});

const verified = { ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } };
const arcSession = { status: 201, data: { result: 'SUCCESS', session: { id: 'SESSION-NEW' }, successIndicator: 'SECRET-NEW' } };

const checkout = async ({ rows = [], tables, user = CUSTOMER, body = {}, verdict = verified, fail } = {}) => {
  const table = fakeBookingsTable(rows, { tables, fail });
  const verifyFlightCharge = vi.fn().mockResolvedValue(verdict);
  vi.doMock('../../backend/services/flightCheckout.service.js', () => ({ verifyFlightCharge }));
  vi.doMock('../../backend/routes/payment/arcpay.config.js', async () => {
    const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
    return {
      ...actual,
      supabase: { from: table.from },
      ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
    };
  });
  const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
  const req = createRequest({
    method: 'POST',
    user,
    body: {
      amount: '402.00',
      orderId: 'FLTSECOND2',
      bookingType: 'flight',
      customerEmail: 'jane@example.com',
      returnUrl: `${SITE}/payment/callback?orderId=FLTSECOND2&bookingType=flight`,
      bookingData: bookingData(),
      ...body,
    },
  });
  const res = createResponse();
  await handleHostedCheckout(req, res);
  return { res, table, verifyFlightCharge };
};

const openedANewPage = () => axios.post.mock.calls.some(([, sent]) => sent?.apiOperation === 'INITIATE_CHECKOUT');

beforeEach(() => {
  vi.resetModules();
  axios.post.mockReset();
  axios.post.mockResolvedValue(arcSession);
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightCheckout.service.js');
  vi.doUnmock('../../backend/routes/payment/arcpay.config.js');
});

describe('a second checkout for a trip that already has a payment page open', () => {
  it('hands back that page under its own reference, without opening another', async () => {
    const { res } = await checkout({ rows: [openCheckout()] });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      reused: true,
      orderId: 'FLTFIRST1',
      sessionId: 'SESSION-FIRST',
      checkoutUrl: 'https://api.arcpay.travel/checkout/pay/SESSION-FIRST',
    });
    expect(openedANewPage()).toBe(false);
  });

  // A retry priced the fare again - up to 25 seconds - before finding the page
  // it had opened, and the review page gave up after 10.
  it('hands it back before pricing the fare again, when the page asks for the total it was made for', async () => {
    const { res, verifyFlightCharge } = await checkout({ rows: [openCheckout()] });

    expect(res.body.orderId).toBe('FLTFIRST1');
    expect(verifyFlightCharge).not.toHaveBeenCalled();
    expect(openedANewPage()).toBe(false);
  });

  it('prices the fare first when the page asks for a different total', async () => {
    const { res, verifyFlightCharge } = await checkout({
      rows: [openCheckout()],
      body: { amount: '452.00' },
      verdict: { ...verified, charge: { total: 452 } },
    });

    expect(verifyFlightCharge).toHaveBeenCalledTimes(1);
    expect(res.body.orderId).toBe('FLTSECOND2');
    expect(openedANewPage()).toBe(true);
  });

  it('never hands over the payment secret of the page it gives back', async () => {
    const { res } = await checkout({ rows: [openCheckout()] });

    expect(res.body).not.toHaveProperty('successIndicator');
    expect(JSON.stringify(res.body)).not.toContain('SECRET-FIRST');
  });

  it('gives a guest their own page back by the email they checked out with', async () => {
    const guestRow = openCheckout({ user_id: null });
    const { res } = await checkout({
      rows: [guestRow],
      tables: { feature_flags: [{ flag_name: 'guest_flight_booking', enabled: true }] },
      user: null,
      body: { customerEmail: 'JANE@example.com' },
    });

    expect(res.body.orderId).toBe('FLTFIRST1');
    expect(openedANewPage()).toBe(false);
  });
});

describe('a new payment page is opened, as before, when the open one is not this exact trip', () => {
  const opensItsOwn = async (options) => {
    const { res } = await checkout(options);
    expect(res.statusCode).toBe(200);
    expect(res.body.orderId).toBe('FLTSECOND2');
    expect(res.body.reused).toBeUndefined();
    expect(openedANewPage()).toBe(true);
  };

  // Handing back the first page would book the details just corrected.
  it('a traveller detail changed', async () => {
    const corrected = passengers.map((p, i) => (i === 0 ? { ...p, passportNumber: 'X9999999' } : p));
    await opensItsOwn({ rows: [openCheckout()], body: { bookingData: bookingData({ passengerData: corrected }) } });
  });

  // The page is refused PRICE_CHANGED and asks again with the new total, so
  // the request carries it too - and it is not the open page's.
  it('the fare, and so the total, moved', async () => {
    await opensItsOwn({ rows: [openCheckout()], body: { amount: '452.00' }, verdict: { ...verified, charge: { total: 452 } } });
  });

  it('the open page is older than the reuse window', async () => {
    await opensItsOwn({ rows: [openCheckout({ created_at: minutesAgo(6), booking_details: { checkout_created_at: minutesAgo(6) } })] });
  });

  it("it is another customer's page", async () => {
    await opensItsOwn({ rows: [openCheckout({ user_id: '9a9a9a9a-1b1b-4c4c-8d8d-7e7e7e7e7e7e' })] });
  });

  it("it is another guest's page", async () => {
    await opensItsOwn({
      rows: [openCheckout({ user_id: null, booking_details: { customer_email: 'someone@example.com' } })],
      tables: { feature_flags: [{ flag_name: 'guest_flight_booking', enabled: true }] },
      user: null,
    });
  });

  it('the open page was paid for, or has gone on to booking', async () => {
    await opensItsOwn({ rows: [openCheckout({ payment_status: 'paid' })] });
    vi.resetModules();
    axios.post.mockClear();
    await opensItsOwn({ rows: [openCheckout({ booking_details: { arc_captured_amount: 402 } })] });
    vi.resetModules();
    axios.post.mockClear();
    await opensItsOwn({ rows: [openCheckout({ booking_details: { gds_chain: { state: 'in_progress' } } })] });
  });

  it('the open page returns the payer to another site', async () => {
    await opensItsOwn({
      rows: [openCheckout({ booking_details: { pending_booking_data: { ...openCheckout().booking_details.pending_booking_data, returnUrl: 'http://localhost:5173/payment/callback?orderId=FLTFIRST1' } } })],
    });
  });

  it('the look-up itself fails', async () => {
    const lookupFails = ({ filters }) => filters.some(([, column]) => column === 'payment_status');
    await opensItsOwn({ rows: [openCheckout()], fail: lookupFails });
  });
});

/**
 * The address a signed-in customer's ticket goes to.
 *
 * The review page marks the lead traveller's email optional for a signed-in
 * customer. Left blank, the booking had no address: no confirmation email, no
 * e-ticket email, no email contact on the PNR - while the page promised both.
 */
describe('a signed-in customer who left the email blank', () => {
  it('is booked under their account email', async () => {
    const { res, table } = await checkout({ user: { ...CUSTOMER, email: 'account@example.com' }, body: { customerEmail: '' } });

    expect(res.statusCode).toBe(200);
    expect(table.row('FLTSECOND2').booking_details.customer_email).toBe('account@example.com');
    const session = axios.post.mock.calls.find(([, sent]) => sent?.apiOperation === 'INITIATE_CHECKOUT')?.[1];
    expect(session?.customer?.email).toBe('account@example.com');
  });

  it('keeps the address they typed when they typed one', async () => {
    const { table } = await checkout({ user: { ...CUSTOMER, email: 'account@example.com' }, body: { customerEmail: 'trip@example.com' } });

    expect(table.row('FLTSECOND2').booking_details.customer_email).toBe('trip@example.com');
  });
});
