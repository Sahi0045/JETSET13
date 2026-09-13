/**
 * The flight a signed-out visitor was about to book, kept while they log in.
 *
 * Flights are booked from an account (guest checkout is switched off). The
 * review page's flight exists only in router state, and the trip through the
 * login page does not carry router state - Google and Apple sign-in leave the
 * site entirely - so a visitor sent to log in would come back to "No flight
 * data available" and have to search again.
 *
 * Session storage: this tab only, gone when it closes. Only the search result
 * and the search are kept - an airline offer, never a traveller's name, date of
 * birth or passport - which is what makes it safe to keep at all.
 */

const KEY = 'jt_flight_review';

/** @param {{ flightData?: object, searchData?: object }} state the review page's router state */
export const saveFlightReview = (state) => {
  if (!state?.flightData) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      flightData: state.flightData,
      searchData: state.searchData ?? null,
    }));
  } catch {
    // Storage blocked or full: the visitor searches again after logging in.
  }
};

/** @returns {{ flightData: object, searchData: object|null }|null} */
export const readFlightReview = () => {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return kept?.flightData ? kept : null;
  } catch {
    return null;
  }
};

export const clearFlightReview = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
};
