/**
 * Amadeus date/time formats.
 *
 * The schemas type these as Date_DDMMYY and Time24_HHMM - fixed-width strings,
 * not ISO. They must stay strings end to end: 010926 and 0614 lose their
 * meaning the moment anything parses them as numbers.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Date -> 'DDMMYY' (Date_DDMMYY). Accepts a Date or anything Date can parse. */
export const toDDMMYY = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return `${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${String(d.getUTCFullYear()).slice(-2)}`;
};

/** 'DDMMYY' -> 'YYYY-MM-DD'. Two-digit years are 2000-2099; Amadeus has no earlier. */
export const fromDDMMYY = (ddmmyy) => {
  const s = String(ddmmyy ?? '').trim();
  if (!/^\d{6}$/.test(s)) return null;
  return `20${s.slice(4, 6)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
};

/** 'HHMM' -> 'HH:MM'. */
export const fromHHMM = (hhmm) => {
  const s = String(hhmm ?? '').trim().padStart(4, '0');
  if (!/^\d{4}$/.test(s)) return null;
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
};

/**
 * Combine an Amadeus date and time into a local ISO timestamp.
 * No timezone suffix: these are local airport times, and stamping them with Z
 * would shift every departure by the traveller's offset.
 */
export const toIsoLocal = (ddmmyy, hhmm) => {
  const date = fromDDMMYY(ddmmyy);
  if (!date) return null;
  return `${date}T${fromHHMM(hhmm) ?? '00:00'}:00`;
};

/**
 * Arrival date, applying `dateVariation`.
 *
 * An overnight flight reports the arrival date only through this offset; if it
 * is ignored the arrival lands before the departure and the computed duration
 * goes negative, which the UI renders as "-1h 15m".
 */
export const applyDateVariation = (ddmmyy, variation) => {
  const iso = fromDDMMYY(ddmmyy);
  if (!iso) return null;
  const days = Number.parseInt(variation, 10);
  if (!Number.isFinite(days) || days === 0) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Whole minutes between two local ISO timestamps. */
export const minutesBetween = (fromIso, toIso) => {
  if (!fromIso || !toIso) return null;
  const a = Date.parse(`${fromIso}Z`);
  const b = Date.parse(`${toIso}Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000);
};

/** Minutes -> ISO 8601 duration, the form the REST offer shape uses. */
export const toIsoDuration = (minutes) => {
  if (minutes === null || minutes === undefined || minutes < 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h > 0 ? `${h}H` : ''}${m > 0 || h === 0 ? `${m}M` : ''}`;
};
