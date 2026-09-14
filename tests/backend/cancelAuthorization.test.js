import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * Who may cancel a booking.
 *
 * The check compared the request's email with `booking.customer_email`, a
 * column the bookings table does not have - checkout writes the address into
 * booking_details - so every customer cancel was refused, signed in or not.
 * The other cancel tests' fixtures had the column, so nothing caught it.
 *
 * Harness mirrors cancelRefundGuard.test.js.
 */

const OWNER = '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const STRANGER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const guestBooking = (overrides = {}) => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  passenger_details: [{ firstName: 'Ann', email: 'ann.traveller@example.com' }],
  booking_details: {
    pnr: 'ABC123',
    order_id: 'FLT123',
    customer_email: 'Checkout@Example.com',
    contact: { email: 'contact@example.com' },
  },
  ...overrides,
});
const ownedBooking = (overrides = {}) => guestBooking({ user_id: OWNER, ...overrides });

const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      insert: vi.fn(() => c),
      eq: vi.fn(() => c),
      or: vi.fn(() => c),
      filter: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return c;
  };
  return { client: { from: vi.fn(() => chain()) }, updates };
};

const cancelFlightOrder = vi.fn();
let supabaseDouble = supabaseFor(guestBooking());
let callerFromToken = null;

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return supabaseDouble.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));
vi.mock('../../backend/routes/payment/agents.handlers.js', () => ({
  getCaller: vi.fn(async () => callerFromToken),
  requireAdmin: vi.fn(),
}));

const cancel = async (row, { email, user = null, body = {} } = {}) => {
  supabaseDouble = supabaseFor(row);
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({
    method: 'POST',
    user,
    body: { bookingReference: 'FLT123', reason: 'test', ...(email === undefined ? {} : { email }), ...body },
  });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

const expectWentAhead = (res) => {
  expect(res.statusCode).not.toBe(403);
  expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
};

const expectRefused = (res, code) => {
  expect(res.statusCode).toBe(403);
  expect(res.body.success).toBe(false);
  if (code) expect(res.body.code).toBe(code);
  // Nothing moved: no seat released, no money, no write.
  expect(cancelFlightOrder).not.toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
  expect(supabaseDouble.updates).toEqual([]);
};

beforeEach(() => {
  vi.resetModules();
  callerFromToken = null;
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
});

describe('a booking made as a guest', () => {
  it('is cancelled with the email checkout recorded, in any letter case', async () => {
    expectWentAhead(await cancel(guestBooking(), { email: '  checkout@example.COM ' }));
  });

  it("is cancelled with the contact's email", async () => {
    expectWentAhead(await cancel(guestBooking(), { email: 'contact@example.com' }));
  });

  // A traveller's address opens the booking in Manage Booking. It is whatever
  // the booker typed for them, and a cancel releases every seat and refunds
  // the booker's card, so it does not cancel.
  it("is refused with a traveller's email, and says which email it needs", async () => {
    const res = await cancel(guestBooking(), { email: 'ann.traveller@example.com' });
    expectRefused(res, 'NOT_AUTHORIZED');
    expect(res.body.error).toMatch(/email address it was booked with/i);
  });

  it('is refused with another email', async () => {
    expectRefused(await cancel(guestBooking(), { email: 'someone.else@example.com' }), 'NOT_AUTHORIZED');
  });

  it('is refused with no email', async () => {
    expectRefused(await cancel(guestBooking()));
  });
});

describe('a booking that belongs to an account', () => {
  it('is cancelled by its owner, signed in, without an email', async () => {
    expectWentAhead(await cancel(ownedBooking(), { user: { id: OWNER } }));
  });

  it('is cancelled by the owner recorded in original_user_id', async () => {
    const row = guestBooking({ booking_details: { ...guestBooking().booking_details, original_user_id: OWNER } });
    expectWentAhead(await cancel(row, { user: { id: OWNER } }));
  });

  // An email and a reference sit in the confirmation email and its links; they
  // open the booking, but cancelling someone's trip takes their account.
  it('asks a signed-out visitor to log in, even with the right email', async () => {
    const res = await cancel(ownedBooking(), { email: 'checkout@example.com' });
    expectRefused(res, 'LOGIN_REQUIRED');
    expect(res.body.error).toMatch(/log in/i);
  });

  it('is refused to another signed-in account, even with the right email', async () => {
    expectRefused(await cancel(ownedBooking(), { user: { id: STRANGER }, email: 'checkout@example.com' }), 'NOT_AUTHORIZED');
  });

  it('takes the owner from the session, never from the request body', async () => {
    expectRefused(await cancel(ownedBooking(), { body: { userId: OWNER, user_id: OWNER } }), 'LOGIN_REQUIRED');
  });
});

describe('staff', () => {
  it('an admin may cancel any booking', async () => {
    callerFromToken = { id: STRANGER, role: 'admin' };
    expectWentAhead(await cancel(ownedBooking()));
  });

  // The admin panel's route has already checked the role and forwards its session.
  it('an admin session forwarded by an in-process caller counts', async () => {
    expectWentAhead(await cancel(ownedBooking(), { user: { id: STRANGER, role: 'superadmin' } }));
  });

  it('an agent is not staff for cancelling', async () => {
    callerFromToken = { id: STRANGER, role: 'agent' };
    expectRefused(await cancel(ownedBooking()));
  });
});

it('tells a stranger nothing about the booking, not even that it is already cancelled', async () => {
  const res = await cancel(ownedBooking({ status: 'cancelled' }));
  expect(res.statusCode).toBe(403);
  expect(JSON.stringify(res.body)).not.toMatch(/already cancelled/i);
});

describe('bookingAccess', () => {
  it("opens a guest booking with any traveller's email but cancels only with the booker's", async () => {
    const { emailMatchesBooking, emailIsBookers } = await import('../../backend/utils/bookingAccess.js');
    const booking = guestBooking();

    expect(emailMatchesBooking('ann.traveller@example.com', booking)).toBe(true);
    expect(emailIsBookers('ann.traveller@example.com', booking)).toBe(false);

    expect(emailIsBookers('  CHECKOUT@example.com ', booking)).toBe(true);
    expect(emailIsBookers('contact@example.com', booking)).toBe(true);
    expect(emailIsBookers('', booking)).toBe(false);
    expect(emailIsBookers(undefined, guestBooking({ booking_details: {} }))).toBe(false);
  });
});
