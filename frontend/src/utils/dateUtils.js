/**
 * Utility functions for date handling to ensure consistent local date usage
 * and avoid UTC offsets issues with default Date behavior.
 */

// Get today's date in YYYY-MM-DD format based on local time
export const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Get the next day of a given date (YYYY-MM-DD) in YYYY-MM-DD
export const getNextDay = (dateString) => {
    if (!dateString) return getTodayDate();

    // Create date using individual components to avoid UTC conversion
    const [y, m, d] = dateString.split('-').map(Number);
    const date = new Date(y, m - 1, d);

    // Add one day
    date.setDate(date.getDate() + 1);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Format a date string (YYYY-MM-DD) to a display format (e.g., Sat, May 5)
// This avoids timezone shifts
export const formatDateDisplay = (dateString, options = { weekday: 'short', month: 'short', day: 'numeric' }) => {
    if (!dateString) return '';
    const [y, m, d] = dateString.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', options);
};

// Get a date object that is safe (local time noon to avoid edge cases)
export const getSafeDate = (dateString) => {
    if (!dateString) return new Date();
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0); // Noon local time
};

// Format a Date object to YYYY-MM-DD using local time
export const formatDateToISO = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * A booking's date as the calendar day it names, in the viewer's own time zone.
 *
 * `new Date('2026-11-15')` is UTC midnight, which in New York is the evening of
 * the 14th. The booking pages parsed departure dates that way, so a US customer
 * saw their flight a day early, the trip moved to Past on the morning it left,
 * the countdown was one day short, and Cancel disappeared a day too soon.
 *
 * A date-only string - or an airport-local time with no zone, which is how
 * Amadeus sends departures - is the day written in it. A timestamp that carries
 * a zone (`created_at`) is the local day of that moment.
 *
 * @param {string|Date|null|undefined} value
 * @returns {Date|null} local midnight of that day, or null when unreadable
 */
export const parseCalendarDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? null
            : new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const text = String(value).trim();
    const written = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(text);
    if (written) {
        const [year, month, day] = [Number(written[1]), Number(written[2]), Number(written[3])];
        const date = new Date(year, month - 1, day);
        // 2026-02-31 would roll into March; it is not a date.
        return date.getMonth() === month - 1 ? date : null;
    }
    const moment = new Date(text);
    return Number.isNaN(moment.getTime())
        ? null
        : new Date(moment.getFullYear(), moment.getMonth(), moment.getDate());
};

/**
 * A booking date for display, e.g. "Sun, Nov 15, 2026", read as a calendar day
 * (see parseCalendarDate).
 *
 * @param {string|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @param {string} [fallback=''] shown when there is no readable date
 */
export const formatCalendarDate = (
    value,
    options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' },
    fallback = ''
) => {
    const date = parseCalendarDate(value);
    return date ? date.toLocaleDateString('en-US', options) : fallback;
};

/**
 * Whole days from today to a booking date: 0 today, 1 tomorrow, -1 yesterday.
 * Null when there is no readable date. Rounded, because the day a clock change
 * falls on is 23 or 25 hours long.
 *
 * @param {string|Date|null|undefined} value
 * @param {Date} [now]
 */
export const daysUntilDate = (value, now = new Date()) => {
    const date = parseCalendarDate(value);
    if (!date) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((date.getTime() - today.getTime()) / 86400000);
};

/**
 * "PT11H10M" -> "11h 10m".
 *
 * Amadeus stores flight durations as ISO 8601 and they were rendered verbatim,
 * so Manage Booking and My Trips showed travellers "PT11H10M" between their two
 * airports. Anything not an ISO duration is passed through, because several
 * callers already hold a formatted string.
 *
 * @param {string} value
 * @param {string} [fallback=''] shown when there is no duration at all
 */
export const formatIsoDuration = (value, fallback = '') => {
    if (!value) return fallback;
    const match = String(value).match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/i);
    if (!match || (!match[1] && !match[2] && !match[3])) return String(value);

    const [, days, hours, minutes] = match;
    const totalHours = (Number(days || 0) * 24) + Number(hours || 0);
    return [
        totalHours ? `${totalHours}h` : null,
        minutes ? `${Number(minutes)}m` : null,
    ].filter(Boolean).join(' ') || fallback;
};
