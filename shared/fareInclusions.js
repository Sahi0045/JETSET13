/**
 * What a fare includes, as the same rows in the same order for every fare, so
 * fares can be compared line by line.
 *
 * Read from the airline's own fare-family services (Amadeus
 * Fare_GetFareFamilyDescription: included, at a charge, or not offered), never
 * invented: a row the airline does not state reads "not stated".
 *
 * Dependency-free: the browser and the server both load this file.
 */

export const STATES = Object.freeze({ INCLUDED: 'included', FEE: 'fee', NO: 'no', UNKNOWN: 'unknown' });

const RANK = { included: 3, charged: 2, notOffered: 1 };
const STATE_OF = { included: STATES.INCLUDED, charged: STATES.FEE, notOffered: STATES.NO };

const ROWS = [
  { key: 'personalItem', test: /PERSONAL ITEM/ },
  { key: 'cabinBag', test: /CABIN BAG|CARRY ?ON|HAND ?BAG/ },
  { key: 'checkedBag', test: /CHECKED BAG|1ST BAG|FIRST BAG|BAGGAGE ALLOWANCE/ },
  { key: 'cancel', test: /REFUND/, skip: /NO.?SHOW|AFTER DEPARTURE/ },
  { key: 'change', test: /CHANGE|REBOOK|REISSUE/, skip: /NO.?SHOW|AFTER DEPARTURE/ },
  { key: 'seat', test: /SEAT/, skip: /PREFERRED|LEGROOM|PREMIUM|EXTRA|EXIT|UPFRONT|FRONT ROW/ },
  { key: 'meal', test: /MEAL|CATERING|SNACK|FOOD|BEVERAGE/ },
];

const EXTRA_LABELS = [
  [/MILEAGE|MILES/, 'Earns miles'],
  [/ENTERTAINMENT/, 'In-flight entertainment'],
  [/LOUNGE/, 'Lounge access'],
  [/PRIORITY/, 'Priority boarding'],
  [/WI-?FI/, 'Wi-Fi'],
  [/CARBON/, 'Carbon offset'],
];

const sentence = (text) => {
  const lower = String(text || '').trim().toLowerCase().replace(/(\d)\s*kg\b/g, '$1 kg').replace(/(\d)\s*lb\b/g, '$1 lb');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const unitOf = (unit) => {
  const upper = String(unit || 'KG').toUpperCase();
  if (upper === 'K' || upper === 'KG') return 'kg';
  if (upper === 'L' || upper === 'LB' || upper === 'LBS') return 'lb';
  return upper.toLowerCase();
};

const servicesOf = (fare) => {
  if (Array.isArray(fare?.fareServices) && fare.fareServices.length) {
    return fare.fareServices
      .filter((service) => service?.text && RANK[service.status])
      .map((service) => ({ text: String(service.text).toUpperCase(), status: service.status }));
  }
  return (Array.isArray(fare?.amenities) ? fare.amenities : [])
    .filter((amenity) => amenity?.description && typeof amenity.isChargeable === 'boolean')
    .map((amenity) => ({ text: String(amenity.description).toUpperCase(), status: amenity.isChargeable ? 'charged' : 'included' }));
};

const best = (services) => services.reduce((top, service) => (!top || RANK[service.status] > RANK[top.status] ? service : top), null);

const bagLabel = (bag, kind) => {
  if (!bag || typeof bag !== 'object') return null;
  if (bag.weight) return `${bag.weight} ${unitOf(bag.weightUnit)} ${kind} bag`;
  if (bag.quantity) return `${bag.quantity} ${kind} bag${Number(bag.quantity) === 1 ? '' : 's'}`;
  return null;
};

const hasWeight = (text) => /\d\s*(KG|LB)/.test(text);

function checkedBagRow(fare, service) {
  const checked = fare?.baggageDetails?.checked ?? fare?.baggage?.checked;
  const allowance = bagLabel(checked, 'checked');
  if (allowance && !checked.weight && service?.status === 'included' && hasWeight(service.text)) {
    return { state: STATES.INCLUDED, label: sentence(service.text) };
  }
  if (allowance) return { state: STATES.INCLUDED, label: allowance };
  if (service?.status === 'included') return { state: STATES.INCLUDED, label: sentence(service.text) };
  if (service?.status === 'charged') return { state: STATES.FEE, label: 'Checked bag for a fee' };
  if (service?.status === 'notOffered') return { state: STATES.NO, label: 'No checked bag' };
  if (checked && typeof checked === 'object' && Number(checked.quantity) === 0 && !checked.weight) return { state: STATES.NO, label: 'No checked bag' };
  return { state: STATES.UNKNOWN, label: 'Checked bag: see fare rules' };
}

function cabinBagRow(fare, service) {
  if (service?.status === 'included') return { state: STATES.INCLUDED, label: sentence(service.text) };
  const cabin = bagLabel(fare?.baggageDetails?.cabin ?? fare?.baggage?.cabin, 'cabin');
  if (cabin) return { state: STATES.INCLUDED, label: cabin };
  if (service?.status === 'charged') return { state: STATES.FEE, label: 'Cabin bag for a fee' };
  if (service?.status === 'notOffered') return { state: STATES.NO, label: 'No cabin bag' };
  return null;
}

function cancelRow(fare, service) {
  if (service?.status === 'included') return { state: STATES.INCLUDED, label: 'Refundable if you cancel' };
  if (service?.status === 'charged') return { state: STATES.FEE, label: 'Cancellation for a fee' };
  if (service?.status === 'notOffered') return { state: STATES.NO, label: 'Non-refundable' };
  if (fare?.refundable === true) return { state: STATES.INCLUDED, label: 'Refundable if you cancel' };
  if (fare?.refundable === false) return { state: STATES.NO, label: 'Non-refundable' };
  return { state: STATES.UNKNOWN, label: 'Cancellation: see fare rules' };
}

const STATED = {
  personalItem: (service) => (service.status === 'included' ? { state: STATES.INCLUDED, label: sentence(service.text) }
    : service.status === 'charged' ? { state: STATES.FEE, label: 'Personal item for a fee' } : { state: STATES.NO, label: 'No personal item' }),
  change: (service) => (service.status === 'included' ? { state: STATES.INCLUDED, label: 'Date change included' }
    : service.status === 'charged' ? { state: STATES.FEE, label: 'Date change for a fee' } : { state: STATES.NO, label: 'No date changes' }),
  seat: (service) => (service.status === 'included' ? { state: STATES.INCLUDED, label: 'Free seat selection' }
    : service.status === 'charged' ? { state: STATES.FEE, label: 'Seat selection for a fee' } : { state: STATES.NO, label: 'No seat selection' }),
  meal: (service) => (service.status === 'included' ? { state: STATES.INCLUDED, label: /MEAL/.test(service.text) ? 'Meal included' : sentence(service.text) }
    : service.status === 'charged' ? { state: STATES.FEE, label: 'Meals for a fee' } : { state: STATES.NO, label: 'No meals' }),
};

const UNSTATED = {
  personalItem: 'Personal item: not stated',
  change: 'Date change: see fare rules',
  seat: 'Seat selection: not stated',
  meal: 'Meal: not stated',
};

/**
 * @returns {{ rows: Record<string, {state: string, label: string}|null>, extras: string[] }}
 *   `rows` by key (personalItem, cabinBag, checkedBag, cancel, change, seat,
 *   meal); null where the airline says nothing. `extras` are the other things
 *   the fare includes, in the airline's order.
 */
export function fareInclusions(fare) {
  const services = servicesOf(fare);
  const matched = new Set();
  const serviceFor = (row) => {
    const hits = services.filter((service) => row.test.test(service.text) && !(row.skip && row.skip.test(service.text)));
    services.forEach((service) => { if (row.test.test(service.text)) matched.add(service); });
    return best(hits);
  };

  const rows = {};
  for (const row of ROWS) {
    const service = serviceFor(row);
    if (row.key === 'checkedBag') rows.checkedBag = checkedBagRow(fare, service);
    else if (row.key === 'cabinBag') rows.cabinBag = cabinBagRow(fare, service);
    else if (row.key === 'cancel') rows.cancel = cancelRow(fare, service);
    else rows[row.key] = service ? STATED[row.key](service) : null;
  }

  const extras = [...new Set(services
    .filter((service) => service.status === 'included' && !matched.has(service) && !/UPGRADE/.test(service.text))
    .map((service) => (EXTRA_LABELS.find(([pattern]) => pattern.test(service.text)) || [null, sentence(service.text)])[1]))];

  return { rows, extras };
}

export const ROW_ORDER = Object.freeze(['personalItem', 'cabinBag', 'checkedBag', 'cancel', 'change', 'seat', 'meal']);

/**
 * The rows of several fares, aligned: a row any fare states is shown on every
 * fare ("not stated" where that one is silent), so the cards read across.
 *
 * @returns {Array<{ rows: Array<{key: string, state: string, label: string}>, extras: string[] }>}
 */
export function alignedFareInclusions(fares) {
  const each = fares.map(fareInclusions);
  const shown = ROW_ORDER.filter((key) => each.some(({ rows }) => rows[key] && rows[key].state !== STATES.UNKNOWN)
    || key === 'checkedBag' || key === 'cancel');
  return each.map(({ rows, extras }) => ({
    rows: shown.map((key) => ({ key, ...(rows[key] || { state: STATES.UNKNOWN, label: UNSTATED[key] || 'Not stated' }) })),
    extras,
  }));
}
