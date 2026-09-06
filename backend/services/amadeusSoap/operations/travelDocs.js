/**
 * SSR DOCS — the passenger's travel document, as APIS data.
 *
 * Without it an international ticket cannot be issued. The chain wrote names
 * and contacts but no document element, so `DocIssuance_IssueTicket` answered
 * `27791 TICKETING INHIBITED-SSR DOCS MISSING FOR P1` on a JFK-LHR booking:
 * the PNR committed, the customer had paid, and no ticket could ever be
 * produced for it.
 *
 * Domestic itineraries generally do not need it, which is why the gap survived
 * — DEL-BOM never asked.
 */

/** ISO 3166 alpha-2 -> alpha-3. DOCS is a 3-letter field; the UI collects 2. */
const ALPHA3 = Object.freeze({
  IN: 'IND', US: 'USA', GB: 'GBR', CA: 'CAN', AU: 'AUS', DE: 'DEU', FR: 'FRA',
  JP: 'JPN', AE: 'ARE', SG: 'SGP', MY: 'MYS', TH: 'THA', VN: 'VNM', ID: 'IDN',
  CN: 'CHN', KR: 'KOR', IT: 'ITA', ES: 'ESP', BR: 'BRA', MX: 'MEX', RU: 'RUS',
  ZA: 'ZAF', NZ: 'NZL', PH: 'PHL', PK: 'PAK', BD: 'BGD', LK: 'LKA', NP: 'NPL',
  SA: 'SAU', QA: 'QAT', KW: 'KWT', BH: 'BHR', OM: 'OMN', EG: 'EGY', KE: 'KEN',
  NG: 'NGA', TR: 'TUR', PT: 'PRT', NL: 'NLD', SE: 'SWE', CH: 'CHE', AT: 'AUT',
  BE: 'BEL', IE: 'IRL', FI: 'FIN', NO: 'NOR', DK: 'DNK', PL: 'POL', HK: 'HKG',
  TW: 'TWN',
});

/**
 * @returns {string|null} a 3-letter country code, or null if we cannot be sure.
 *   Guessing here is worse than omitting: a wrong nationality on an APIS record
 *   is a border problem, not a formatting one.
 */
export const toAlpha3 = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  return ALPHA3[raw] ?? null;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** '1990-01-01' -> '01JAN90', the only date format DOCS accepts. */
export const toDDMMMYY = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${m[3]}${month}${m[1].slice(2)}`;
};

/** DOCS wants M/F, and MI/FI when the passenger is an infant. */
const genderCode = (gender, ptc) => {
  const base = String(gender ?? '').trim().toUpperCase().startsWith('F') ? 'F' : 'M';
  return ptc === 'INF' || ptc === 'HELD_INFANT' ? `${base}I` : base;
};

/** Amadeus document-type letters. Anything unrecognised is treated as a passport. */
const DOC_TYPE = Object.freeze({ PASSPORT: 'P', IDENTITY_CARD: 'I', ID_CARD: 'I', VISA: 'V' });

/**
 * Build the DOCS free text for one traveller, or null when the data is not
 * complete enough to be worth sending.
 *
 * Format, per IATA:
 *   <type>/<issuing country>/<number>/<nationality>/<DOB>/<gender>/<expiry>/<surname>/<given name>/H
 *
 * A partial DOCS is not better than none. Amadeus rejects a malformed element
 * at commit, which would fail the whole booking rather than only the ticket —
 * so an incomplete document is skipped and the booking still succeeds.
 */
export const buildDocsFreetext = (traveler = {}) => {
  const doc = Array.isArray(traveler.documents) ? traveler.documents[0] : traveler.documents;
  if (!doc?.number) return null;

  const type = DOC_TYPE[String(doc.documentType ?? '').toUpperCase()] ?? 'P';
  const nationality = toAlpha3(doc.nationality ?? doc.issuanceCountry);
  const issuing = toAlpha3(doc.issuanceCountry ?? doc.nationality);
  const birth = toDDMMMYY(traveler.dateOfBirth);
  const expiry = toDDMMMYY(doc.expiryDate);
  const surname = String(traveler.lastName ?? '').trim().toUpperCase();
  const given = String(traveler.firstName ?? '').trim().toUpperCase();

  if (!nationality || !issuing || !birth || !expiry || !surname || !given) return null;

  const number = String(doc.number).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const gender = genderCode(traveler.gender, traveler.ptc);
  const holder = doc.holder === false ? '' : '/H';

  return `${type}/${issuing}/${number}/${nationality}/${birth}/${gender}/${expiry}/${surname}/${given}${holder}`;
};
