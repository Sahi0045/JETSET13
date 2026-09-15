import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { daysUntilDate, formatCalendarDate, parseCalendarDate } from '../../frontend/src/utils/dateUtils.js';

/**
 * Booking dates as calendar days.
 *
 * Every booking surface parsed "2026-11-15" with `new Date`, which is UTC
 * midnight - the evening of the 14th in the US. Departures printed a day early,
 * trips moved to Past on the morning they left, countdowns were a day short and
 * Manage Booking hid Cancel a day too soon. These run in New York, where that
 * happened.
 */
describe('booking dates, in New York', () => {
  let originalTz;
  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('really is west of UTC, where new Date(dateOnly) moved the day', () => {
    expect(new Date(2026, 10, 15, 12).getTimezoneOffset()).toBeGreaterThan(0);
    expect(new Date('2026-11-15').getDate()).toBe(14);
  });

  it('reads a date-only string as the day written in it', () => {
    const date = parseCalendarDate('2026-11-15');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 10, 15, 0]);
    expect(formatCalendarDate('2026-11-15')).toBe('Sun, Nov 15, 2026');
  });

  it('reads an airport-local time with no zone as its own day', () => {
    expect(formatCalendarDate('2026-11-15T23:30:00', { month: 'short', day: 'numeric' })).toBe('Nov 15');
  });

  it('reads a timestamp with a zone as the local day of that moment', () => {
    // 02:00 UTC on the 16th is 21:00 on the 15th in New York.
    expect(formatCalendarDate('2026-11-16T02:00:00Z', { month: 'short', day: 'numeric' })).toBe('Nov 15');
  });

  it('counts today as 0 and tomorrow as 1, late in the evening too', () => {
    const lateEvening = new Date(2026, 10, 15, 22, 0);
    expect(daysUntilDate('2026-11-15', lateEvening)).toBe(0);
    expect(daysUntilDate('2026-11-16', lateEvening)).toBe(1);
    expect(daysUntilDate('2026-11-14', lateEvening)).toBe(-1);
  });

  it('is not thrown by a clock change', () => {
    // US clocks go back on 1 Nov 2026 and forward on 8 Mar 2026.
    expect(daysUntilDate('2026-11-02', new Date(2026, 9, 31, 12))).toBe(2);
    expect(daysUntilDate('2026-03-09', new Date(2026, 2, 7, 12))).toBe(2);
  });

  it('answers null, or the fallback, for nothing readable', () => {
    expect(parseCalendarDate('')).toBeNull();
    expect(parseCalendarDate(null)).toBeNull();
    expect(parseCalendarDate('not a date')).toBeNull();
    expect(parseCalendarDate('2026-02-31')).toBeNull();
    expect(daysUntilDate(undefined)).toBeNull();
    expect(formatCalendarDate('garbage', undefined, 'Date N/A')).toBe('Date N/A');
  });
});
