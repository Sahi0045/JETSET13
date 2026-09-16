/**
 * The travellers a customer has typed but not yet paid for.
 *
 * The review page held `passengerData` in React state and nowhere else. The
 * only thing that ever persisted it was `handleProceedToPayment`, writing
 * `pendingFlightBooking` the moment before leaving for ARC Pay - so everything
 * typed before that point was lost, in four entirely ordinary ways:
 *
 *   Back, then Forward   to re-check a flight time
 *   Refresh              or a phone discarding the tab in the background
 *   Session expiry       the page sends a signed-out visitor to log in, and
 *                        flightReviewResume keeps the FLIGHT but never the people
 *   "Save Details"       a prominent button whose own comment read
 *                        "In a real app, this would send the updated data to
 *                        the server"
 *
 * For four travellers on an international route that is around forty fields,
 * passport numbers and expiry dates among them, typed twice.
 *
 * ── Why sessionStorage, when the payment draft uses localStorage ─────────────
 *
 * This holds names, dates of birth and passport numbers, so where it rests is
 * the whole design.
 *
 * sessionStorage is the tighter of the two and still covers every case above,
 * because all four stay in the SAME TAB - a refresh, a history move, a
 * discarded-and-restored tab and a round trip through the login page are all
 * one tab's lifetime. It then dies with that tab, where the existing
 * `pendingFlightBooking` draft survives in localStorage until something clears
 * it (bookingStorage.js gives it six hours, precisely because a customer who
 * reached ARC and closed the tab left passports behind on a shared computer).
 * So this keeps the same data for LESS time than the page already did.
 *
 * It is also deliberately a different key from `pendingFlightBooking`, and the
 * order page never reads it. `pendingFlightBooking` is what actually gets
 * booked if the database lookup fails, and it carries no order id - so two tabs
 * sharing it can book one tab's travellers onto the other's flight. Per-tab
 * storage cannot do that: each tab restores only what was typed in it.
 *
 * A draft is tied to the fare it was typed against and expires, so neither a
 * different search nor a tab left open all day can put stale people on a
 * booking.
 */

const KEY = 'jt_flight_travellers';

/**
 * How long a draft is worth restoring.
 *
 * Long enough to survive a phone put down mid-form, a login round trip, or a
 * conversation about passport numbers with whoever is travelling; short enough
 * that a tab left open over lunch does not still hold them. The tab closing
 * ends it sooner either way.
 */
export const DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * What ties a draft to one particular fare.
 *
 * Not the offer id alone: Amadeus reuses small integers ("1", "2") for offers
 * within a single search reply, so an id matches across two unrelated searches
 * far too easily. Route, dates and the traveller mix together identify the
 * thing that was priced, and they are exactly what has to still be true for
 * these people to belong on this booking.
 */
export const fareFingerprint = (offer) => {
  if (!offer) return null;
  const legs = (offer.itineraries ?? [])
    .flatMap((itinerary) => itinerary?.segments ?? [])
    .map((segment) => [
      segment?.departure?.iataCode,
      segment?.arrival?.iataCode,
      String(segment?.departure?.at ?? '').slice(0, 10),
      segment?.carrierCode,
      segment?.number,
    ].join('-'));
  const types = (offer.travelerPricings ?? []).map((pricing) => pricing?.travelerType).sort();
  return legs.length ? `${legs.join('|')}::${types.join(',')}` : null;
};

/** Keep what was typed, against the fare it was typed for. Never throws. */
export const saveTravellerDraft = (travellers, offer, storage = globalThis.sessionStorage) => {
  const fare = fareFingerprint(offer);
  if (!fare || !Array.isArray(travellers) || travellers.length === 0) return false;
  try {
    storage?.setItem(KEY, JSON.stringify({ fare, savedAt: Date.now(), travellers }));
    return true;
  } catch {
    // Storage blocked or full. The page works exactly as it did before.
    return false;
  }
};

/**
 * The travellers typed for THIS fare, if they are still worth restoring.
 *
 * Returns null rather than throwing or guessing: a draft for another fare, one
 * past its age, or anything unreadable is simply not used, and the customer
 * gets the empty form they would have got anyway.
 */
export const readTravellerDraft = (offer, { storage = globalThis.sessionStorage, now = Date.now() } = {}) => {
  const fare = fareFingerprint(offer);
  if (!fare) return null;
  try {
    const kept = JSON.parse(storage?.getItem(KEY) || 'null');
    if (!kept || kept.fare !== fare) return null;
    if (!Array.isArray(kept.travellers) || kept.travellers.length === 0) return null;
    if (!Number.isFinite(Number(kept.savedAt)) || now - Number(kept.savedAt) > DRAFT_MAX_AGE_MS) return null;
    return kept.travellers;
  } catch {
    return null;
  }
};

/** Forget it: the booking is made, or the customer signed out. Never throws. */
export const clearTravellerDraft = (storage = globalThis.sessionStorage) => {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
};
