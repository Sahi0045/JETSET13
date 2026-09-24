/**
 * The fare check the results page makes when BOOK is pressed, handed to the
 * review page so it does not price the same offer again seconds later.
 *
 * Both ask /flights/price with withFareRules, which the server answers from one
 * Amadeus session: informative pricing, then Fare_CheckRules on it. The results
 * page asked a stateless pricing of its own and the review page a stateful one
 * straight after - the pair Amadeus's certification review (test case 7) called
 * redundant. The review page takes the handed answer only for the very offer it
 * was made for, and only while it is fresh; anything else it checks itself.
 */

/** How long a handed check stands in for the review page's own, in ms. */
export const FARE_CHECK_FRESH_MS = 60_000;

/**
 * What identifies an offer across the navigation. Amadeus offer ids are small
 * per-search counters ("1", "1-1"), so an id alone would match the first offer
 * of a different search.
 */
export const offerFingerprint = (offer) => JSON.stringify([
  offer?.id ?? null,
  offer?.price?.grandTotal ?? offer?.price?.total ?? null,
  (offer?.travelerPricings ?? []).map((pricing) => pricing?.travelerType ?? null),
  (offer?.itineraries ?? []).flatMap((itinerary) => itinerary?.segments ?? [])
    .map((segment) => `${segment?.carrierCode ?? ''}${segment?.number ?? ''}@${segment?.departure?.at ?? ''}`),
]);

/** The check to hand on, for an answer the server gave to `offer`. */
export const fareCheckFor = (offer, body, now = Date.now()) => ({
  fingerprint: offerFingerprint(offer),
  checkedAt: now,
  body,
});

/**
 * The handed answer, when it was made for this offer and is still fresh;
 * otherwise null, and the page checks the fare itself.
 */
export const handedFareCheck = (state, offer, now = Date.now()) => {
  const check = state?.fareCheck;
  if (!check?.body || !offer || check.fingerprint !== offerFingerprint(offer)) return null;
  const age = now - Number(check.checkedAt);
  return Number.isFinite(age) && age >= 0 && age <= FARE_CHECK_FRESH_MS ? check.body : null;
};
