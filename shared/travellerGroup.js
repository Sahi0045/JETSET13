/**
 * Who can travel together on one booking, by Amadeus's rules.
 *
 *  - At most 9 passengers holding a seat - adults and children. Ten or more is
 *    a group booking, a different flow the airline refuses on this one.
 *  - An infant (under 2) travels on an adult's lap and holds no seat: one per
 *    adult, never more infants than adults.
 *  - At least one adult.
 *
 * Shared by the flight search (backend) and the review page, like
 * shared/flightCharge.js, so neither lets through a group the other refuses.
 */

export const MAX_SEATED = 9;

const whole = (value) => {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
};

/** { adults, children, infants } as whole numbers; NaN marks an unusable count. */
export const normalizeGroup = ({ adults = 1, children = 0, infants = 0 } = {}) => ({
  adults: whole(adults),
  children: whole(children),
  infants: whole(infants),
});

/** What is wrong with a group, in words a customer can act on, or null. */
export function travellerGroupProblem(group) {
  const { adults, children, infants } = normalizeGroup(group);
  if ([adults, children, infants].some(Number.isNaN)) {
    return 'Enter the number of adults, children and infants as whole numbers.';
  }
  if (adults < 1) return 'At least one adult must travel on every booking.';
  if (adults + children > MAX_SEATED) {
    return `A booking can have at most ${MAX_SEATED} passengers with seats (adults and children). For larger groups, please contact us.`;
  }
  if (infants > adults) {
    return "Each infant travels on an adult's lap, so a booking cannot have more infants than adults.";
  }
  return null;
}

/** The group an offer was priced for, from its traveller pricings. */
export function groupFromOffer(offer) {
  const group = { adults: 0, children: 0, infants: 0 };
  for (const pricing of offer?.travelerPricings ?? []) {
    if (pricing?.travelerType === 'CHILD') group.children += 1;
    else if (pricing?.travelerType === 'HELD_INFANT') group.infants += 1;
    else group.adults += 1;
  }
  return group;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "2 adults, 1 child, 1 infant" */
export const describeGroup = ({ adults = 0, children = 0, infants = 0 } = {}) => [
  plural(adults, 'adult', 'adults'),
  children ? plural(children, 'child', 'children') : '',
  infants ? plural(infants, 'infant', 'infants') : '',
].filter(Boolean).join(', ');
