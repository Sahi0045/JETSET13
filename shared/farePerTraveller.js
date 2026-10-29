/**
 * One traveller's fare, from the offer's own per-traveller prices.
 *
 * `price.total` covers every traveller the search priced, so a results page
 * showing it read twice the ticket price for two adults. Each traveller's
 * price is the airline's own figure for that traveller (Amadeus
 * paxFareDetail), never the total divided: a child or an infant pays less.
 *
 * Dependency-free: the browser and the server both load this file.
 */

const UNIT_BY_TYPE = { ADULT: 'adult', CHILD: 'child', SEATED_INFANT: 'infant', HELD_INFANT: 'infant' };

const typeOf = (pricing) => String(pricing?.travelerType || 'ADULT').toUpperCase();

const amountOf = (pricing) => {
  const amount = Number(pricing?.price?.total);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/**
 * @returns {{ each: number|null, unit: 'person'|'adult'|'child'|'infant'|null, travellers: number }}
 *   `each` is an adult's fare when there is one; `unit` is "person" when every
 *   traveller is of one type, so their fares are the same.
 */
export function farePerTraveller(offer) {
  const pricings = Array.isArray(offer?.travelerPricings) ? offer.travelerPricings : [];
  const priced = pricings.find((pricing) => typeOf(pricing) === 'ADULT' && amountOf(pricing) !== null)
    || pricings.find((pricing) => amountOf(pricing) !== null);
  // The SOAP mapper falls back to the offer total when Amadeus leaves out a
  // traveller's own amount; with two or more travellers that is no one's fare.
  const offerTotal = Number(offer?.price?.total);
  const isWhole = pricings.length > 1 && Number.isFinite(offerTotal) && amountOf(priced) >= offerTotal;
  if (!priced || isWhole) return { each: null, unit: null, travellers: pricings.length };

  const sameType = pricings.every((pricing) => typeOf(pricing) === typeOf(priced));
  return {
    each: amountOf(priced),
    unit: sameType ? 'person' : (UNIT_BY_TYPE[typeOf(priced)] || 'adult'),
    travellers: pricings.length,
  };
}
