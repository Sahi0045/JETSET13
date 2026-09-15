import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKING_STORAGE_KEYS, clearStoredBookings } from '../../frontend/src/utils/bookingStorage';

describe('logging out', () => {
  it('clears the stored bookings along with the session', () => {
    const navbar = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/Navbar.jsx'), 'utf8');
    const start = navbar.indexOf('const handleLogout');
    const logout = navbar.slice(start, navbar.indexOf('\n  };', start));
    expect(logout).toMatch(/clearStoredBookings\(\);/);
    // The error branch clears all of localStorage, bookings included.
    expect(logout).toMatch(/localStorage\.clear\(\);/);
  });
});

/**
 * Travellers' passport numbers and dates of birth, left in localStorage.
 *
 * The review page's `pendingFlightBooking` was never removed, and the order page
 * wrote two more copies no page read, so they stayed after logout.
 */
describe('clearStoredBookings', () => {
  it('removes every booking draft and copy, and nothing else', () => {
    localStorage.setItem('pendingFlightBooking', JSON.stringify({ passengerData: [{ passportNumber: 'X1234567', dateOfBirth: '1990-01-01' }] }));
    localStorage.setItem('pendingPaymentSession', JSON.stringify({ orderId: 'FLT1' }));
    localStorage.setItem('completedFlightBookings', '[]');
    localStorage.setItem('completedFlightBooking', '{}');
    localStorage.setItem('preferredCurrency', 'EUR');

    clearStoredBookings();

    for (const key of BOOKING_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem('preferredCurrency')).toBe('EUR');
  });

  it('never throws when storage is blocked or missing', () => {
    expect(() => clearStoredBookings({ removeItem: () => { throw new Error('SecurityError'); } })).not.toThrow();
    expect(() => clearStoredBookings(null)).not.toThrow();
  });
});
