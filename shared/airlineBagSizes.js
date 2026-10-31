/**
 * Each airline's published bag size limits: what fits, not what a fare
 * includes (the fare's own allowance comes from Amadeus). Amadeus sends
 * weights and piece counts and never dimensions - every raw reply checked on
 * 31 Oct 2026 - so these are read from each airline's own website, and each
 * entry names the pages. An airline missing here shows no sizes rather than a
 * guess.
 *
 * `kgTotal`: one weight for every cabin item together, the small bag included.
 * Checked bags carry their size only: the weight a fare allows is Amadeus's.
 * A size that changes with the route (Qatar, Emirates, Singapore Airlines) or
 * that the airline does not publish (Etihad) is left out.
 *
 * Dependency-free: the browser and the server both load this file.
 */

const CLASSES = { ECONOMY: 'economy', PREMIUM_ECONOMY: 'premiumEconomy', BUSINESS: 'business', FIRST: 'first' };

const LUFTHANSA_GROUP = {
  cabinBag: {
    economy: { cm: [55, 40, 23], kg: 8 },
    premiumEconomy: { cm: [55, 40, 23], kg: 8 },
    business: { cm: [55, 40, 23], kg: 8 },
    first: { cm: [55, 40, 23], kg: 8 },
  },
  personalItem: { cm: [40, 30, 15] },
  checkedBag: { linearCm: 158 },
};

const AIR_FRANCE_KLM = {
  cabinBag: {
    economy: { cm: [55, 35, 25], kg: 12, kgTotal: true },
    premiumEconomy: { cm: [55, 35, 25], kg: 12, kgTotal: true },
    business: { cm: [55, 35, 25], kg: 18, kgTotal: true },
  },
  personalItem: { cm: [40, 30, 15] },
  checkedBag: { linearCm: 158 },
};

export const AIRLINE_BAG_SIZES = Object.freeze({
  AI: {
    airline: 'Air India',
    sources: ['https://www.airindia.com/in/en/travel-information/baggage-guidelines/cabin-baggage.html', 'https://www.airindia.com/in/en/travel-information/baggage-guidelines/checked-baggage-allowance.html'],
    cabinBag: {
      economy: { cm: [55, 40, 20], kg: 7 },
      premiumEconomy: { cm: [55, 40, 20], kg: 7 },
      business: { cm: [55, 40, 20], kg: 10 },
      first: { cm: [55, 40, 20], kg: 10 },
    },
    personalItem: { cm: [40, 30, 20], kg: 3 },
    checkedBag: { linearCm: 158 },
  },
  '6E': {
    airline: 'IndiGo',
    sources: ['https://www.goindigo.in/baggage/cabin-baggage.html', 'https://www.goindigo.in/baggage/baggage-allowance.html'],
    cabinBag: { economy: { cm: [55, 35, 25], kg: 7 }, business: { cm: [55, 35, 25], kg: 12 } },
    personalItem: { kg: 3 },
    checkedBag: { linearCm: 158 },
  },
  SG: {
    airline: 'SpiceJet',
    sources: ['https://corporate.spicejet.com/Baggage.aspx'],
    cabinBag: { economy: { cm: [55, 35, 25], kg: 7 } },
    // Its Q400s take a smaller bag than its Boeings.
    smallAircraft: { test: /Q400|DHC|DASH ?8|DH8/i, cabinBag: { cm: [50, 35, 23], kg: 7 } },
    checkedBag: { linearCm: 158 },
  },
  QP: {
    airline: 'Akasa Air',
    sources: ['https://www.akasaair.com/quick-links/baggage', 'https://www.akasaair.com/quick-links/conditions-of-carriage'],
    cabinBag: { economy: { cm: [55, 35, 25], kg: 7 } },
    personalItem: { kg: 3 },
    checkedBag: { linearCm: 158 },
  },
  LH: {
    airline: 'Lufthansa',
    sources: ['https://www.lufthansa.com/us/en/carry-on-baggage', 'https://www.lufthansa.com/us/en/prepare-for-your-trip/baggage/free-baggage'],
    ...LUFTHANSA_GROUP,
  },
  LX: {
    airline: 'SWISS',
    sources: ['https://www.swiss.com/us/en/prepare/baggage/hand-baggage', 'https://www.swiss.com/us/en/prepare/baggage/checked-baggage'],
    ...LUFTHANSA_GROUP,
  },
  OS: {
    airline: 'Austrian',
    sources: ['https://www.austrian.com/us/en/handgepaeck', 'https://www.austrian.com/us/en/free-baggage'],
    ...LUFTHANSA_GROUP,
    cabinBag: { economy: LUFTHANSA_GROUP.cabinBag.economy, premiumEconomy: LUFTHANSA_GROUP.cabinBag.premiumEconomy, business: LUFTHANSA_GROUP.cabinBag.business },
  },
  KL: {
    airline: 'KLM',
    sources: ['https://www.klm.com/information/baggage/hand-baggage-allowance', 'https://www.klm.com/information/baggage/checked-baggage-allowance'],
    ...AIR_FRANCE_KLM,
  },
  AF: {
    airline: 'Air France',
    sources: ['https://wwws.airfrance.us/information/bagages/bagage-cabine-soute'],
    ...AIR_FRANCE_KLM,
    cabinBag: { ...AIR_FRANCE_KLM.cabinBag, first: { cm: [55, 35, 25], kg: 18, kgTotal: true } },
  },
  BA: {
    airline: 'British Airways',
    sources: ['https://www.britishairways.com/content/information/baggage-essentials'],
    // No cabin bag weight: BA asks only that you can lift it yourself.
    cabinBag: {
      economy: { cm: [56, 45, 25] },
      premiumEconomy: { cm: [56, 45, 25] },
      business: { cm: [56, 45, 25] },
      first: { cm: [56, 45, 25] },
    },
    personalItem: { cm: [40, 30, 15] },
    checkedBag: { cm: [90, 75, 43] },
  },
  VS: {
    airline: 'Virgin Atlantic',
    sources: [
      'https://www.virginatlantic.com/en-IN/help/articles/what-is-my-hand-baggage-allowance----a5a24d4c-a652-4fbd-925d-57d0ead2ed5e',
      'https://www.virginatlantic.com/en-IN/help/articles/what-is-my-checked-in-baggage-allowance----70858c8e-6bdf-433c-b421-ef796757727d',
    ],
    cabinBag: {
      economy: { cm: [56, 36, 23], kg: 10 },
      premiumEconomy: { cm: [56, 36, 23], kg: 10 },
      business: { cm: [56, 36, 23], kg: 12, kgNote: '16 kg for two' },
    },
    personalItem: { cm: [40, 30, 15] },
    checkedBag: { cm: [90, 75, 43] },
  },
  QR: {
    airline: 'Qatar Airways',
    sources: ['https://www.qatarairways.com/en-us/baggage/allowance.html'],
    cabinBag: {
      economy: { cm: [50, 37, 25], kg: 7 },
      business: { cm: [50, 37, 25], kg: 15, kgText: '15 kg for both bags together' },
      first: { cm: [50, 37, 25], kg: 15, kgText: '15 kg for both bags together' },
    },
  },
  EK: {
    airline: 'Emirates',
    sources: ['https://www.emirates.com/english/before-you-fly/baggage/cabin-baggage-rules/'],
    cabinBag: {
      economy: { cm: [55, 38, 22], kg: 7 },
      premiumEconomy: { cm: [55, 38, 22], kg: 10 },
      business: { cm: [55, 38, 22], kg: 7 },
      first: { cm: [55, 38, 22], kg: 7 },
    },
  },
  EY: {
    airline: 'Etihad',
    sources: ['https://www.etihad.com/en/help/faq/baggage'],
    cabinBag: {
      economy: { cm: [56, 36, 23], kg: 7 },
      business: { cm: [56, 36, 23], kg: 12, kgText: '12 kg for both bags together' },
      first: { cm: [56, 36, 23], kg: 12, kgText: '12 kg for both bags together' },
    },
  },
  SV: {
    airline: 'Saudia',
    sources: ['https://www.saudia.com/manage/baggage/carry-on-baggage', 'https://www.saudia.com/manage/baggage/additional-baggage'],
    cabinBag: {
      economy: { cm: [56, 45, 25], kg: 7 },
      business: { cm: [56, 45, 25], kg: 12 },
      first: { cm: [56, 45, 25], kg: 12 },
    },
    checkedBag: { linearCm: 158 },
  },
  TG: {
    airline: 'Thai Airways',
    sources: ['https://www.thaiairways.com/en-th/content/baggage/carry-on-baggage/', 'https://www.thaiairways.com/en-th/content/baggage/checked-baggage/'],
    cabinBag: {
      economy: { cm: [56, 45, 25], kg: 7 },
      premiumEconomy: { cm: [56, 45, 25], kg: 7 },
      business: { cm: [56, 45, 25], kg: 7 },
      first: { cm: [56, 45, 25], kg: 7 },
    },
    personalItem: { cm: [37.5, 25, 12.5], kg: 1.5 },
    checkedBag: { linearCm: 158 },
  },
  SQ: {
    airline: 'Singapore Airlines',
    sources: ['https://www.singaporeair.com/en_UK/us/travel-info/baggage/cabin-baggage/'],
    cabinBag: {
      economy: { linearCm: 115, kg: 7 },
      premiumEconomy: { linearCm: 115, kg: 7 },
      business: { linearCm: 115, kg: 7 },
      first: { linearCm: 115, kg: 7 },
    },
    personalItem: { cm: [40, 30, 10] },
  },
  AA: {
    airline: 'American Airlines',
    sources: ['https://www.aa.com/web/i18n/travel-info/baggage/carry-on-baggage.html', 'https://www.aa.com/web/i18n/travel-info/baggage/checked-baggage-policy.html'],
    cabinBag: { economy: { in: [22, 14, 9], cm: [56, 36, 23] } },
    personalItem: { in: [18, 14, 8], cm: [45, 35, 20] },
    checkedBag: { linearIn: 62, linearCm: 158 },
  },
  UA: {
    airline: 'United',
    sources: ['https://www.united.com/en/us/fly/baggage/carry-on-bags.html', 'https://www.united.com/en/us/fly/baggage/checked-bags.html'],
    cabinBag: { economy: { in: [22, 14, 9], cm: [56, 35, 23] } },
    personalItem: { in: [17, 10, 9], cm: [43, 25, 22] },
    checkedBag: { linearIn: 62 },
  },
  DL: {
    airline: 'Delta',
    sources: ['https://www.delta.com/us/en/baggage/carry-on-baggage', 'https://www.delta.com/us/en/baggage/overview'],
    cabinBag: { economy: { in: [22, 14, 9], cm: [56, 35, 23] } },
    checkedBag: { linearIn: 62, linearCm: 157 },
  },
  // alaskaair.com would not load (31 Oct 2026); the carry-on size is from
  // Alaska's own news post, and its checked size is left until read there.
  AS: {
    airline: 'Alaska Airlines',
    sources: ['https://news.alaskaair.com/alaska-airlines/summer-travel-tips/'],
    cabinBag: { economy: { in: [22, 14, 9] } },
  },
  B6: {
    airline: 'JetBlue',
    sources: ['https://www.jetblue.com/help/carry-on-bags', 'https://www.jetblue.com/bag-calculator'],
    cabinBag: { economy: { in: [22, 14, 9], cm: [56, 36, 23] } },
    personalItem: { in: [17, 13, 8], cm: [43, 33, 20] },
    checkedBag: { linearIn: 62, linearCm: 158 },
  },
  AC: {
    airline: 'Air Canada',
    sources: ['https://www.aircanada.com/ca/en/aco/home/plan/baggage/carry-on.html', 'https://www.aircanada.com/ca/en/aco/home/plan/baggage/checked.html'],
    cabinBag: { economy: { cm: [55, 40, 23] } },
    personalItem: { cm: [43, 33, 16] },
    checkedBag: { linearCm: 158 },
  },
});

export const BAG_SIZES_CHECKED_ON = '2026-10-31';

/**
 * The limits for one cabin. A class the airline publishes no figure for takes
 * the economy bag's size and no weight: business weights differ, sizes rarely.
 *
 * @returns {{ airline: string, sources: string[], cabinBag: object|null, personalItem: object|null, checkedBag: object|null } | null}
 */
export function bagSizesOf(carrier, cabin, { aircraft = '' } = {}) {
  const entry = AIRLINE_BAG_SIZES[String(carrier || '').trim().toUpperCase()];
  if (!entry) return null;
  const travelClass = CLASSES[String(cabin || 'ECONOMY').trim().toUpperCase()] || 'economy';
  const economyBag = entry.cabinBag?.economy;
  const small = entry.smallAircraft?.test.test(String(aircraft || '')) ? entry.smallAircraft.cabinBag : null;
  const cabinBag = small ?? entry.cabinBag?.[travelClass] ?? (economyBag ? { cm: economyBag.cm, in: economyBag.in } : null);
  return {
    airline: entry.airline,
    sources: entry.sources,
    cabinBag,
    personalItem: entry.personalItem ?? null,
    checkedBag: entry.checkedBag ?? null,
  };
}

const times = (values) => values.join(' × ');

export function dimensionsText(item) {
  if (!item) return '';
  if (Array.isArray(item.cm) && Array.isArray(item.in)) return `${times(item.in)} in (${times(item.cm)} cm)`;
  if (Array.isArray(item.cm)) return `${times(item.cm)} cm`;
  if (Array.isArray(item.in)) return `${times(item.in)} in`;
  if (item.linearCm && item.linearIn) return `${item.linearIn} in (${item.linearCm} cm) in total`;
  if (item.linearCm) return `${item.linearCm} cm in total`;
  if (item.linearIn) return `${item.linearIn} inches in total`;
  return '';
}

export function weightText(item) {
  if (!item?.kg) return '';
  if (item.kgText) return item.kgText;
  if (item.kgTotal) return `${item.kg} kg in total, with the personal item`;
  return [`${item.kg} kg`, item.kgNote].filter(Boolean).join(', ');
}
