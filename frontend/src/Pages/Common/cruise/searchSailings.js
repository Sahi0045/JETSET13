import { CRUISE_REGIONS, regionByKey } from '../../../../../shared/cruiseRegions.js';
import { officeToday, priceLabel } from './catalog';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const NIGHT_RANGES = [
  { key: '1-5', label: '1 – 5 nights', min: 1, max: 5 },
  { key: '6-9', label: '6 – 9 nights', min: 6, max: 9 },
  { key: '10+', label: '10+ nights', min: 10, max: Infinity },
];

const CRITERIA = ['region', 'line', 'port', 'month', 'length'];

const LOGOS = [
  [/royal caribbean/i, '/images/logos/royal_caribbean.webp'],
  [/carnival/i, '/images/logos/carnival.webp'],
  [/norwegian/i, '/images/logos/norwegian.webp'],
  [/disney/i, '/images/logos/disney_cruise.webp'],
  [/\bmsc\b/i, '/images/logos/msc.png'],
  [/princess/i, '/images/logos/princess.png'],
];

export const regionName = (key) => regionByKey(key)?.name ?? key;

export const monthName = (month) => {
  const [year, number] = month.split('-').map(Number);
  return `${MONTHS[number - 1]} ${year}`;
};

export const departurePort = (sailing) => sailing.port_names?.[0] ?? null;

export const nightsLabel = (nights) => `${nights} ${nights === 1 ? 'night' : 'nights'}`;

export const lineLogo = (name) => LOGOS.find(([pattern]) => pattern.test(name ?? ''))?.[1] ?? null;

const sorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const sailingDates = (sailing) => sailing.dates ?? (sailing.next_date ? [sailing.next_date] : []);

export const searchOptions = (sailings) => ({
  regions: sorted(sailings.map((s) => s.region)).map((key) => ({ key, name: regionName(key) }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  lines: sorted(sailings.map((s) => s.line_name)),
  ports: sorted(sailings.map(departurePort)),
  months: sorted(sailings.flatMap((s) => sailingDates(s).map((date) => date.slice(0, 7)))),
});

export const matchesSearch = (sailing, { region, line, port, month, length } = {}) => {
  if (region && sailing.region !== region) return false;
  if (line && sailing.line_name !== line) return false;
  if (port && departurePort(sailing) !== port) return false;
  if (month && !sailingDates(sailing).some((date) => date.startsWith(month))) return false;
  if (length) {
    const range = NIGHT_RANGES.find((r) => r.key === length);
    if (range && !(sailing.nights >= range.min && sailing.nights <= range.max)) return false;
  }
  return true;
};

export const searchQuery = (criteria) => {
  const params = new URLSearchParams();
  for (const key of CRITERIA) if (criteria[key]) params.set(key, criteria[key]);
  return params.toString();
};

/** The search from the address bar, including `destination` and `cruiseLine` from links older pages made. */
export const criteriaFrom = (params) => {
  const destination = (params.get('destination') ?? '').trim().toLowerCase();
  const region = regionByKey(params.get('region'))?.key
    ?? CRUISE_REGIONS.find((r) => destination && r.name.toLowerCase() === destination)?.key
    ?? '';
  const length = params.get('length') ?? '';
  const month = params.get('month') ?? '';
  return {
    region,
    line: params.get('line') || params.get('cruiseLine') || '',
    port: params.get('port') ?? '',
    month: /^\d{4}-\d{2}$/.test(month) ? month : '',
    length: NIGHT_RANGES.some((r) => r.key === length) ? length : '',
  };
};

const lowestPrice = (sailings, today) => {
  const priced = sailings
    .filter((s) => priceLabel(s, today).kind === 'price')
    .sort((a, b) => a.from_price_usd - b.from_price_usd);
  return priceLabel(priced[0] ?? {}, today);
};

const groupCards = (sailings, keyOf, today) => {
  const groups = new Map();
  for (const sailing of sailings) {
    const key = keyOf(sailing);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sailing);
  }
  return [...groups].map(([key, group]) => ({
    key,
    count: group.length,
    photo: group.find((s) => s.photo?.url)?.photo ?? null,
    price: lowestPrice(group, today),
  }));
};

const biggestFirst = (a, b) => b.count - a.count || a.name.localeCompare(b.name);

export const regionCards = (sailings, today = officeToday()) =>
  groupCards(sailings, (s) => s.region, today)
    .map((card) => ({ ...card, name: regionName(card.key) }))
    .sort(biggestFirst);

export const lineCards = (sailings, today = officeToday()) =>
  groupCards(sailings, (s) => s.line_name, today)
    .map((card) => ({ ...card, name: card.key, logo: lineLogo(card.key) }))
    .sort(biggestFirst);
