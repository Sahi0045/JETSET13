import { OPERATIONS } from '../codes.js';
import { arr, at, atTxt, txt } from '../parseXml.js';
import { el, wrap } from '../xml.js';
import { fromDDMMYY, toIsoDuration } from '../mappers/datetime.js';

/**
 * Air_FlightInfo - the schedule for one flight on one date.
 *
 * Stateless and read-only: it looks up a published schedule and changes
 * nothing, so it needs no session.
 *
 * Root sequence (Air_FlightInfo_07_1_1A.xsd):
 *   generalFlightInfo{ flightDate?, boardPointDetails?, offPointDetails?,
 *                      companyDetails?, flightIdentification?,
 *                      flightTypeDetails?, marriageDetails[] }
 *
 * Note `offPointDetails` with a capital P. Air_SellFromRecommendation and
 * Fare_InformativePricingWithoutPNR both spell the same concept
 * `offpointDetails`, lowercase - the WSAP is not consistent between messages,
 * and each spelling is only valid in its own.
 */

/** 'YYYY-MM-DD' | 'DDMMYY' -> 'DDMMYY'. Returns '' for anything unusable. */
const toDDMMYY = (value) => {
  const raw = String(value ?? '').trim();
  if (/^\d{6}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}${pad(date.getUTCMonth() + 1)}${String(date.getUTCFullYear()).slice(-2)}`;
};

/**
 * @param {object} p
 * @param {string} p.carrier       marketing carrier, e.g. 'AI'
 * @param {string} p.flightNumber  digits only, e.g. '9484'
 * @param {string} p.date          'YYYY-MM-DD' or 'DDMMYY'
 */
export const buildFlightInfoBody = (p) => {
  const { carrier, flightNumber, date } = p;
  if (!carrier || !flightNumber) throw new Error('carrier and flightNumber are required');

  const departureDate = toDDMMYY(date);
  if (!departureDate) throw new Error(`Invalid date: ${date}`);

  const body = wrap('generalFlightInfo', [
    wrap('flightDate', el('departureDate', departureDate)),
    wrap('companyDetails', el('marketingCompany', String(carrier).toUpperCase())),
    // Strip any carrier prefix the client sent ('AI9484' -> '9484'); the schema
    // allows at most 4 characters here.
    wrap('flightIdentification', el('flightNumber', String(flightNumber).replace(/^[A-Za-z]+/, ''))),
  ]);

  const ns = OPERATIONS.Air_FlightInfo.namespace;
  return `    <Air_FlightInfo xmlns="${ns}">${body}</Air_FlightInfo>`;
};

/** 'HHMM' -> 'HH:MM', which is what the clients render. */
const toClock = (hhmm) => {
  const raw = String(hhmm ?? '').trim();
  return /^\d{3,4}$/.test(raw) ? `${raw.padStart(4, '0').slice(0, 2)}:${raw.padStart(4, '0').slice(2)}` : null;
};

/** 'HHMM' elapsed -> an ISO 8601 duration, matching the search offers. */
const durationFrom = (hhmm) => {
  const raw = String(hhmm ?? '').trim();
  if (!/^\d{3,4}$/.test(raw)) return null;
  const padded = raw.padStart(4, '0');
  return toIsoDuration(Number.parseInt(padded.slice(0, 2), 10) * 60 + Number.parseInt(padded.slice(2), 10));
};

/**
 * Map the reply to the shape the /status endpoint returns.
 *
 * What this WSAP actually returns for a scheduled flight is narrower than the
 * schema allows, verified against the live endpoint: the route, the date, the
 * carrier and number, the stop count, the days of operation, and the elapsed
 * time - which arrives as `facilitiesInformation/description` in HHMM ('0225'
 * for the 2h25m DEL-BOM), not in any of the duration fields. Scheduled times,
 * terminals and equipment are declared in the schema but are NOT sent, so they
 * are omitted rather than reported as null: a caller can tell the difference
 * between "no terminal" and "we never asked".
 *
 * The reply carries one entry per leg; a flight that touches down on the way
 * has several. Each is reported separately, because the caller asked about a
 * flight number rather than a journey.
 */
export const readFlightInfoReply = (reply) => arr(reply?.flightScheduleDetails).map((leg) => {
  const info = leg.generalFlightInfo ?? {};
  const product = leg.additionalProductDetails ?? {};

  const departureDate = fromDDMMYY(atTxt(info, 'flightDate.departureDate'));
  const arrivalDate = fromDDMMYY(atTxt(info, 'flightDate.arrivalDate')) ?? departureDate;

  // Free text carries notes like "COMMERCIAL DUPLICATE - OPERATED BY AIR INDIA
  // EXPRESS", which is how a codeshare's real operator is named here.
  const notes = arr(leg.interactiveFreeText)
    .map((entry) => arr(entry.freeText).map(txt).join(' ').trim())
    .filter(Boolean);

  // The terminals and the operating leg are present, but as free text rather
  // than in the structured fields the schema provides for them - "DEPARTS
  // TERMINAL 1", "OPERATIONAL LEG IX 1235". Reading them here fills the fields
  // the clients expect from data Amadeus actually sent, rather than leaving
  // them empty because they arrived in the wrong shape.
  const blob = notes.join(' | ');
  const departsTerminal = blob.match(/DEPARTS\s+TERMINAL\s+(\S+)/i)?.[1];
  const arrivesTerminal = blob.match(/ARRIVES\s+TERMINAL\s+(\S+)/i)?.[1];
  const operationalLeg = blob.match(/OPERATIONAL\s+LEG\s+([A-Z0-9]{2})\s*(\d{1,4})/i);

  const out = {
    flightNumber: `${atTxt(info, 'companyDetails.marketingCompany')}${atTxt(info, 'productIdDetails.flightNumber')}`,
    carrierCode: atTxt(info, 'companyDetails.marketingCompany'),
    departure: {
      airport: atTxt(info, 'boardPointDetails.trueLocationId'),
      scheduledDate: departureDate,
      scheduledTime: toClock(atTxt(info, 'flightDate.departureTime')) ?? undefined,
      terminal: atTxt(product, 'departureStationInfo.terminal') || departsTerminal || undefined,
    },
    arrival: {
      airport: atTxt(info, 'offPointDetails.trueLocationId'),
      scheduledDate: arrivalDate,
      scheduledTime: toClock(atTxt(info, 'flightDate.arrivalTime')) ?? undefined,
      terminal: atTxt(product, 'arrivalStationInfo.terminal') || arrivesTerminal || undefined,
    },
    numberOfStops: Number.parseInt(atTxt(product, 'legDetails.numberOfStops'), 10) || 0,
  };

  const operatingCarrier = atTxt(info, 'companyDetails.operatingCompany') || operationalLeg?.[1];
  if (operatingCarrier) out.operatingCarrier = operatingCarrier.toUpperCase();
  if (operationalLeg) out.operatingFlightNumber = `${operationalLeg[1].toUpperCase()}${operationalLeg[2]}`;

  const aircraft = atTxt(product, 'legDetails.equipment');
  if (aircraft) out.aircraft = aircraft;

  const duration = durationFrom(atTxt(product, 'facilitiesInformation.description'))
    ?? durationFrom(atTxt(product, 'legDetails.duration'));
  if (duration) out.duration = duration;

  // Digits 1-7 for Monday-Sunday.
  const daysOfOperation = atTxt(product, 'legDetails.daysOfOperation');
  if (daysOfOperation) out.daysOfOperation = daysOfOperation;

  if (notes.length) out.notes = notes;

  return out;
}).filter((leg) => leg.departure.airport && leg.arrival.airport);

/**
 * Amadeus reports "no such flight" in a responseError rather than as a fault.
 * That is an empty answer, not a failure - the caller asked about a flight that
 * is not scheduled that day.
 */
export const readFlightInfoError = (reply) => {
  const code = atTxt(reply, 'responseError.errorInfo.errorDetails.errorCode');
  if (!code) return null;
  const text = arr(at(reply, 'responseError.interactiveFreeText.freeText')).map(txt).join(' ');
  return { code, text };
};
