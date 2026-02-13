import { describe, it, expect } from 'vitest';
import { getTodayDate, getNextDay, formatDateDisplay, getSafeDate, formatDateToISO } from '../../resources/js/utils/dateUtils.js';

describe('dateUtils', () => {
  describe('getTodayDate', () => {
    it('returns a string in YYYY-MM-DD format', () => {
      const result = getTodayDate();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('matches current local date', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(getTodayDate()).toBe(expected);
    });
  });

  describe('getNextDay', () => {
    it('returns next day for a given date', () => {
      expect(getNextDay('2026-01-15')).toBe('2026-01-16');
    });

    it('handles month rollover', () => {
      expect(getNextDay('2026-01-31')).toBe('2026-02-01');
    });

    it('handles year rollover', () => {
      expect(getNextDay('2025-12-31')).toBe('2026-01-01');
    });

    it('handles leap year Feb 28→29', () => {
      expect(getNextDay('2028-02-28')).toBe('2028-02-29');
    });

    it('handles non-leap year Feb 28→Mar 1', () => {
      expect(getNextDay('2026-02-28')).toBe('2026-03-01');
    });

    it('returns today if input is null/undefined', () => {
      const result = getNextDay(null);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('formatDateDisplay', () => {
    it('formats date to readable string', () => {
      const result = formatDateDisplay('2026-05-15');
      // Should contain month and day
      expect(result).toContain('15');
      expect(result).toContain('May');
    });

    it('returns empty string for null input', () => {
      expect(formatDateDisplay(null)).toBe('');
      expect(formatDateDisplay(undefined)).toBe('');
    });
  });

  describe('getSafeDate', () => {
    it('returns a Date object at noon local time', () => {
      const date = getSafeDate('2026-03-10');
      expect(date).toBeInstanceOf(Date);
      expect(date.getHours()).toBe(12);
      expect(date.getMonth()).toBe(2); // March = 2
      expect(date.getDate()).toBe(10);
    });

    it('returns current date for null input', () => {
      const date = getSafeDate(null);
      expect(date).toBeInstanceOf(Date);
    });
  });

  describe('formatDateToISO', () => {
    it('formats Date to YYYY-MM-DD string', () => {
      const date = new Date(2026, 5, 15); // June 15, 2026
      expect(formatDateToISO(date)).toBe('2026-06-15');
    });

    it('pads single-digit month and day', () => {
      const date = new Date(2026, 0, 5); // Jan 5, 2026
      expect(formatDateToISO(date)).toBe('2026-01-05');
    });

    it('returns empty string for null', () => {
      expect(formatDateToISO(null)).toBe('');
    });
  });
});
