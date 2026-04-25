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
