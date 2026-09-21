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

import { toAlpha3 as countryAlpha3 } from '../../../../shared/countries.js';
import { toPnrName } from '../../../../shared/passengerName.js';

/**
 * ISO 3166 alpha-2 -> alpha-3. DOCS is a 3-letter field; the UI collects 2.
 *
 * The table here knew 50 countries, the same 50 the review page offered. The
 * page now offers every country (shared/countries.js), so the chain reads the
 * same list: a traveller from a country outside the old 50 would otherwise have
 * no passport element and no ticket.
 *
 * @returns {string|null} a 3-letter country code, or null if we cannot be sure.
 *   Guessing here is worse than omitting: a wrong nationality on an APIS record
 *   is a border problem, not a formatting one.
 */
export const toAlpha3 = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  return countryAlpha3(raw);
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
 * The most a DOCS can carry: its freetext repeats at most twice at 70
 * characters (PNR_AddMultiElements XSD, see ssrElement in pnr.js). Past that the
 * element used to be cut off - given names and the /H holder mark with it - and
 * a record that does not match the passport is worse than none (toAlpha3).
 */
export const DOCS_MAX_LENGTH = 140;

/** The names of the values a DOCS needs that are missing or unusable. Never the values. */
const unusable = (values) => Object.keys(values).filter((field) => !values[field]);

/** The text, if the element can hold all of it. */
const fitting = (text, onUnusable) => {
  if (text.length <= DOCS_MAX_LENGTH) return text;
  onUnusable(['length']);
  return null;
};

/**
 * DOCS with no document: surname, given name, date of birth and gender only.
 *
 * A flight to, from or within the United States needs these (Secure Flight)
 * even when nobody gave a passport. American Airlines JFK-LAX refused the ticket
 * with 27791 TICKETING INHIBITED-SSR DOCS MISSING FOR P1, and issued once
 * `////15JAN90/M//DOMESTIC/PROOF` was on the PNR (PDT, 15 Sep 2026).
 */
const secureFlightDocs = (traveler, onUnusable) => {
  const birth = toDDMMMYY(traveler.dateOfBirth);
  const surname = toPnrName(traveler.lastName);
  const given = toPnrName(traveler.firstName);
  const missing = unusable({ dateOfBirth: birth, lastName: surname, firstName: given });
  if (missing.length) {
    onUnusable(missing);
    return null;
  }
  return fitting(`////${birth}/${genderCode(traveler.gender, traveler.ptc)}//${surname}/${given}`, onUnusable);
};

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
 *
 * On a Secure Flight itinerary (`withoutDocument`) an unusable passport falls
 * back to the name, date of birth and gender DOCS, exactly as no passport does.
 * It used to return nothing - one bad field lost the fallback that American
 * Airlines issued against, and the ticket was refused 27791 after the charge.
 *
 * `onUnusable` is told which fields could not be written (never their values),
 * so the caller can say whose document was left off.
 */
export const buildDocsFreetext = (traveler = {}, { withoutDocument = false, onUnusable = () => {} } = {}) => {
  const doc = Array.isArray(traveler.documents) ? traveler.documents[0] : traveler.documents;
  const fallback = () => (withoutDocument ? secureFlightDocs(traveler, onUnusable) : null);
  if (!doc?.number) return fallback();

  const type = DOC_TYPE[String(doc.documentType ?? '').toUpperCase()] ?? 'P';
  // `||`, not `??`: the order route writes an absent country as '' (never
  // undefined), and '' ?? 'GB' is '' - the fallback between the two never fired
  // and a passport with one country known got no DOCS at all.
  const nationality = toAlpha3(doc.nationality || doc.issuanceCountry);
  const issuing = toAlpha3(doc.issuanceCountry || doc.nationality);
  const birth = toDDMMMYY(traveler.dateOfBirth);
  const expiry = toDDMMMYY(doc.expiryDate);
  // The names as the name element writes them (pnr.js). Raw, "D'Souza" and
  // "José" went into the DOCS free text as D'SOUZA and JOSÉ while the passenger
  // was DSOUZA / JOSE: an element the host can refuse at commit, after payment,
  // or a document that does not match the ticket.
  const surname = toPnrName(traveler.lastName);
  const given = toPnrName(traveler.firstName);

  const missing = unusable({
    nationality, issuanceCountry: issuing, dateOfBirth: birth, expiryDate: expiry, lastName: surname, firstName: given,
  });
  if (missing.length) {
    onUnusable(missing);
    return fallback();
  }

  const number = String(doc.number).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const gender = genderCode(traveler.gender, traveler.ptc);
  const holder = doc.holder === false ? '' : '/H';

  return fitting(`${type}/${issuing}/${number}/${nationality}/${birth}/${gender}/${expiry}/${surname}/${given}${holder}`, onUnusable)
    ?? fallback();
};

/**
 * SSR CTCE free text: the passenger's email in IATA's encoding, upper case, with
 * @ written // , _ written .. and - written ./ . Accepted on PDT (15 Sep 2026):
 * proof_test-x@example.com as PROOF..TEST./X//EXAMPLE.COM.
 */
export const buildContactEmailFreetext = (email) => {
  const value = String(email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value.toUpperCase().replace(/_/g, '..').replace(/-/g, './').replace('@', '//');
};

/** SSR CTCM free text: the mobile number as digits with its country code, e.g. 12125550100. */
export const buildContactPhoneFreetext = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
};

/**
 * SSR FOID free text: the passport as the form of identification, PP and the
 * number (PPX3300055). Only a passport is sent; other documents have no tested
 * FOID form.
 */
export const buildFoidFreetext = (traveler = {}) => {
  const doc = Array.isArray(traveler.documents) ? traveler.documents[0] : traveler.documents;
  const number = String(doc?.number ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!number) return null;
  return (DOC_TYPE[String(doc?.documentType ?? '').toUpperCase()] ?? 'P') === 'P' ? `PP${number}` : null;
};
