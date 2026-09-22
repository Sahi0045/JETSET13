import { describe, expect, it } from 'vitest';
import { buildFlightOrderBody, orderDataFromCheckoutRow } from '../../shared/flightOrderBody.js';

/**
 * The address the order body carries, rebuilt from the checkout row.
 *
 * orderDataFromCheckoutRow took the lead traveller's typed email as the order's
 * customerEmail, whatever it held, and buildFlightOrderBody took the first
 * contact email given. A customer who typed "jane@gmailcom" - checkout having
 * recorded the account's jane@gmail.com - was booked by the abandoned-checkout
 * job with "jane@gmailcom" as the order's contact, the address the route
 * books the PNR with and emails. Each now takes the first address that can be
 * delivered to (isUsableEmail), in the order route's order: the contact
 * email, the order's customerEmail, the lead traveller's, then the one
 * checkout recorded.
 */

const offer = { itineraries: [{ segments: [] }], price: { total: '291.00', currency: 'USD' } };

const checkoutRow = ({ contact = 'jane@gmailcom', requested = 'jane@gmailcom', lead = 'jane@gmailcom', recorded = 'jane@gmail.com' } = {}) => ({
  booking_reference: 'FLTROW1',
  total_amount: 291,
  booking_details: {
    order_id: 'FLTROW1',
    customer_email: recorded,
    pending_booking_data: {
      customerEmail: requested,
      bookingData: {
        originalOffer: offer,
        passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email: lead }],
        bookingDetails: { contact: { email: contact, phone: '5551234567' } },
      },
    },
  },
});

const postedEmail = (row) => buildFlightOrderBody(orderDataFromCheckoutRow(row)).body.contactInfo.email;

describe('the order rebuilt from a checkout whose typed address is not usable', () => {
  it('carries the address checkout recorded', () => {
    expect(orderDataFromCheckoutRow(checkoutRow()).customerEmail).toBe('jane@gmail.com');
    expect(postedEmail(checkoutRow())).toBe('jane@gmail.com');
  });

  it("carries the checkout's customerEmail first, then the lead traveller's", () => {
    expect(postedEmail(checkoutRow({ requested: 'jane.b@example.com' }))).toBe('jane.b@example.com');
    expect(postedEmail(checkoutRow({ lead: 'jane.t@example.com' }))).toBe('jane.t@example.com');
  });
});

describe('the addresses next to it', () => {
  it('a usable contact email is still posted first, as before', () => {
    expect(postedEmail(checkoutRow({ contact: 'jane.work@example.com' }))).toBe('jane.work@example.com');
  });

  it('one usable address everywhere: the same address, as before', () => {
    const same = { contact: 'ann@example.com', requested: 'ann@example.com', lead: 'ann@example.com', recorded: 'ann@example.com' };
    expect(orderDataFromCheckoutRow(checkoutRow(same)).customerEmail).toBe('ann@example.com');
    expect(postedEmail(checkoutRow(same))).toBe('ann@example.com');
  });

  it('with no usable address anywhere, none is invented', () => {
    const none = checkoutRow({ recorded: null });
    expect(orderDataFromCheckoutRow(none).customerEmail).toBe('');
    expect(postedEmail(none)).toBe('');
  });

  it("the order page's own data, with no contact on it: the lead traveller's usable address, as before", () => {
    const { body } = buildFlightOrderBody({
      orderId: 'FLTROW1',
      originalOffer: offer,
      passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email: 'jane@example.com' }],
      bookingDetails: {},
      customerEmail: '',
    });
    expect(body.contactInfo.email).toBe('jane@example.com');
  });
});
