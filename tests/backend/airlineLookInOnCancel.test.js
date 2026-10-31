import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Air India waives its cancellation penalty within 48 hours of a booking made
 * more than 7 days before travel (its cat 16 rule). A customer who cancels on
 * the second day is past our free window, and the desk was told to keep the
 * airline's penalty.
 */

const REF = 'FLTLOOKIN1';
const BOOKED = Date.parse('2026-11-01T10:00:00.000Z');
const atHour = (hours) => BOOKED + hours * 60 * 60 * 1000;

const row = (departureDate) => ({
  id: 'bk-lookin1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 300,
  user_id: null,
  created_at: new Date(BOOKED).toISOString(),
  booking_details: {
    pnr: 'LKN123', order_id: REF, customer_email: 'jane@example.com',
    airline: 'AI', airline_name: 'AI', departure_date: departureDate,
    gds: { ticketed: true }, tickets: [{ number: '098-2412345678' }],
    verified_charge: { fare: 287.5, serviceFee: 12.5, discount: 0, total: 300 },
  },
});

let table = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

const cancelFlightOrder = vi.fn();
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: {
    cancelFlightOrder: (...args) => cancelFlightOrder(...args),
    getBookedFeeTable: async () => ({ currency: 'USD', change: { before: { allowed: true } }, refund: { before: { allowed: true, amount: 53 } } }),
  },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const cancelAt = async (hours) => {
  vi.setSystemTime(atHour(hours));
  cancelFlightOrder.mockResolvedValueOnce({ success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['098-2412345678'] });
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({
    method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'jane@example.com' },
  }), res);
  return table.row(REF).booking_details.cancellation;
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', 'America/New_York');
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS', transaction: { id: '2' } } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({ status: 200, data: { status: 'CAPTURED', amount: 300, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 300, currency: 'USD' } }] } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('an Air India cancel on the second day', () => {
  it('tells the desk the airline waives its penalty', async () => {
    table = fakeBookingsTable([row('2026-11-20')], { tables: { price_settings: [{ settings: { cancellation_fee: 50 } }], payments: [] } });
    const cancellation = await cancelAt(30);

    expect(cancellation).toMatchObject({ policy: 'refundable', paymentAction: 'REFUND_UNDER_REVIEW' });
    expect(cancellation.basis).toMatch(/Air India waives its penalty on a cancel within 48 hours/);
  });

  it('says nothing of it for travel within 7 days of booking', async () => {
    table = fakeBookingsTable([row('2026-11-06')], { tables: { price_settings: [{ settings: { cancellation_fee: 50 } }], payments: [] } });
    const cancellation = await cancelAt(30);

    expect(cancellation.policy).toBe('refundable');
    expect(cancellation.basis).not.toMatch(/waives/);
  });
});
