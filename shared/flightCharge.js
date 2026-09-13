/**
 * What a flight booking costs the customer.
 *
 * One implementation, imported by the review page that shows the total and by
 * the checkout handler that charges it. They used to compute it separately:
 * the page multiplied the airline's all-passenger fare by the passenger count a
 * second time, and the server charged whatever number the page sent. A booking
 * for two adults was charged four fares and nothing noticed. Now, if the page
 * and the server ever disagree, checkout refuses rather than charge either.
 *
 * `fareTotal` is always the offer's all-passenger total (Amadeus `price.total`).
 * Nothing here is per passenger except the fixed service fee, which is.
 *
 * Dependency-free on purpose: the browser, the Vercel function and the
 * Lightsail server all load this file.
 */

/** Round to cents, the way both sides must, or they disagree by a cent. */
export const roundMoney = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
};

/**
 * @param {object} p
 * @param {number} p.fareTotal   the airline's total for every passenger on the offer
 * @param {number} p.passengers  how many travellers the offer was priced for
 * @param {object} p.config      price settings: flight_taxes_fees, flight_taxes_fees_percentage
 * @param {number} [p.discount]  coupon discount, already computed on the pre-discount total
 */
export function computeFlightCharge({ fareTotal, passengers, config, discount = 0 } = {}) {
  const fare = roundMoney(fareTotal);
  const count = Math.max(1, Math.floor(Number(passengers) || 1));
  const fixedPerPassenger = Number(config?.flight_taxes_fees) || 0;
  const percentage = Number(config?.flight_taxes_fees_percentage) || 0;

  // The fixed part is per traveller. The percentage is of the whole fare, which
  // already covers every traveller - taking it per traveller counts it twice.
  const fixedFee = roundMoney(fixedPerPassenger * count);
  const percentageFee = roundMoney((fare * percentage) / 100);
  const serviceFee = roundMoney(fixedFee + percentageFee);
  const subtotal = roundMoney(fare + serviceFee);
  const appliedDiscount = roundMoney(Math.min(Math.max(Number(discount) || 0, 0), subtotal));

  return {
    fare,
    passengers: count,
    fixedFee,
    percentageFee,
    serviceFee,
    subtotal,
    discount: appliedDiscount,
    total: roundMoney(subtotal - appliedDiscount),
  };
}

/**
 * A coupon's discount on an order total: percentage or fixed, capped by the
 * coupon's `max_discount_amount`, never more than the total.
 */
export function computeCouponDiscount(coupon, orderTotal) {
  const total = Number(orderTotal);
  if (!coupon || !Number.isFinite(total) || total <= 0) return 0;

  let discount = coupon.discount_type === 'percentage'
    ? (total * (Number(coupon.discount_value) || 0)) / 100
    : Number(coupon.discount_value) || 0;

  const cap = coupon.max_discount_amount == null ? null : Number(coupon.max_discount_amount);
  if (cap != null && Number.isFinite(cap) && cap > 0) discount = Math.min(discount, cap);

  return roundMoney(Math.min(Math.max(discount, 0), total));
}

/**
 * Passenger types as the airline prices them. Ages are on the date of travel.
 * The names match the offer's `travelerPricings[].travelerType`.
 */
export const PASSENGER_TYPES = Object.freeze({
  ADULT: { label: 'Adult', minAge: 12, rule: 'aged 12 or over' },
  CHILD: { label: 'Child', minAge: 2, maxAge: 11, rule: 'aged 2 to 11' },
  HELD_INFANT: { label: 'Infant', maxAge: 1, rule: 'under 2' },
  SEATED_INFANT: { label: 'Infant (own seat)', maxAge: 1, rule: 'under 2' },
});

/** Whole years between a date of birth and a date, or null if either is unreadable. */
export function ageInYears(dateOfBirth, onDate) {
  const birth = new Date(`${String(dateOfBirth ?? '').slice(0, 10)}T00:00:00Z`);
  const on = new Date(`${String(onDate ?? '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(on.getTime())) return null;

  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = on.getUTCMonth() < birth.getUTCMonth()
    || (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Why a traveller's date of birth does not fit the fare they are booked on,
 * or null when it does. A child on an adult fare - or an adult on a child's -
 * is a ticket the airline can refuse at check-in.
 */
export function passengerAgeProblem(type, dateOfBirth, travelDate) {
  const band = PASSENGER_TYPES[type];
  if (!band) return null;

  const age = ageInYears(dateOfBirth, travelDate);
  if (age === null) return 'Enter a valid date of birth.';
  if (age < 0) return 'The date of birth is after the travel date.';

  const tooYoung = band.minAge != null && age < band.minAge;
  const tooOld = band.maxAge != null && age > band.maxAge;
  return tooYoung || tooOld
    ? `${band.label} fares are for travellers ${band.rule} on the day of travel.`
    : null;
}
