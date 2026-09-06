import { describe, expect, it } from 'vitest';
import { formatIsoDuration } from '../../frontend/src/utils/dateUtils.js';

/**
 * Flight durations.
 *
 * Amadeus stores them as ISO 8601 and Manage Booking and My Trips rendered the
 * value verbatim, so a traveller read "PT11H10M" between their two airports.
 */

describe('formatIsoDuration', () => {
  it('converts what Amadeus stores', () => {
    expect(formatIsoDuration('PT11H10M')).toBe('11h 10m');
    expect(formatIsoDuration('PT2H35M')).toBe('2h 35m');
    expect(formatIsoDuration('PT45M')).toBe('45m');
    expect(formatIsoDuration('PT7H')).toBe('7h');
  });

  it('rolls a day into hours rather than printing a D', () => {
    // Long-haul with a connection can exceed 24h; "1d 3h" is not how a
    // traveller reads a flight duration.
    expect(formatIsoDuration('P1DT3H')).toBe('27h');
  });

  it('passes an already-formatted value through untouched', () => {
    // Several callers hold a formatted string; mangling it would be worse.
    expect(formatIsoDuration('11h 10m')).toBe('11h 10m');
    expect(formatIsoDuration('Duration N/A')).toBe('Duration N/A');
  });

  it('uses the caller fallback when there is nothing to show', () => {
    expect(formatIsoDuration('', 'Duration N/A')).toBe('Duration N/A');
    expect(formatIsoDuration(null, '--')).toBe('--');
    expect(formatIsoDuration(undefined, '--')).toBe('--');
    expect(formatIsoDuration(null)).toBe('');
  });
});
