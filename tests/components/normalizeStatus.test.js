import { describe, it, expect } from 'vitest';

/**
 * Test the normalizeStatus logic from mytrips.jsx
 * The function is defined inline: const normalizeStatus = (s) => (s || '').toUpperCase();
 */
const normalizeStatus = (s) => (s || '').toUpperCase();

describe('normalizeStatus (mytrips tab filtering)', () => {
  describe('basic normalization', () => {
    it('normalizes lowercase cancelled', () => {
      expect(normalizeStatus('cancelled')).toBe('CANCELLED');
    });

    it('normalizes uppercase CANCELLED', () => {
      expect(normalizeStatus('CANCELLED')).toBe('CANCELLED');
    });

    it('normalizes mixed case Cancelled', () => {
      expect(normalizeStatus('Cancelled')).toBe('CANCELLED');
    });

    it('normalizes confirmed', () => {
      expect(normalizeStatus('confirmed')).toBe('CONFIRMED');
    });

    it('normalizes failed', () => {
      expect(normalizeStatus('failed')).toBe('FAILED');
    });

    it('handles null', () => {
      expect(normalizeStatus(null)).toBe('');
    });

    it('handles undefined', () => {
      expect(normalizeStatus(undefined)).toBe('');
    });

    it('handles empty string', () => {
      expect(normalizeStatus('')).toBe('');
    });
  });

  describe('tab filtering logic', () => {
    const bookings = [
      { orderId: '001', status: 'confirmed' },
      { orderId: '002', status: 'CONFIRMED' },
      { orderId: '003', status: 'cancelled' },
      { orderId: '004', status: 'CANCELLED' },
      { orderId: '005', status: 'failed' },
      { orderId: '006', status: 'FAILED' },
      { orderId: '007', status: null },
    ];

    it('Cancelled tab shows both lowercase and uppercase cancelled', () => {
      const filtered = bookings.filter(b => normalizeStatus(b.status) === 'CANCELLED');
      expect(filtered.map(b => b.orderId)).toEqual(['003', '004']);
    });

    it('Failed tab shows both lowercase and uppercase failed', () => {
      const filtered = bookings.filter(b => normalizeStatus(b.status) === 'FAILED');
      expect(filtered.map(b => b.orderId)).toEqual(['005', '006']);
    });

    it('Upcoming tab excludes cancelled and failed', () => {
      const filtered = bookings.filter(b => {
        const status = normalizeStatus(b.status);
        return status !== 'CANCELLED' && status !== 'FAILED';
      });
      expect(filtered.map(b => b.orderId)).toEqual(['001', '002', '007']);
    });
  });
});
