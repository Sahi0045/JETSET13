import { createRequire } from 'node:module';
import { CITY_NAMES, METRO_AIRPORTS, METRO_CENTRES, METRO_CITIES, PASSENGERS, SHORT_NAMES } from '../data/airports/placeRanking.js';

/**
 * Airport and city lookup, served from a bundled dataset.
 *
 * The Enterprise WSAP has no location-search operation - the Self-Service REST
 * `reference-data/locations` endpoint is gone with its host - so this backs both
 * the autocomplete endpoint and the city -> IATA resolution that flight search
 * depends on. Output matches the normalized shape the previous service emitted,
 * so route and client code is unchanged.
 *
 * Loaded once and held in memory: a few megabytes against a network hop on
 * every keystroke of an autocomplete field.
 */

const require = createRequire(import.meta.url);

let dataset = null;
let byCode = null;
let tokens = null;

const normalize = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')   // strip accents: "Málaga" matches "malaga"
  .trim();

const metroOf = new Map(Object.entries(METRO_AIRPORTS).flatMap(([metro, codes]) => codes.map((code) => [code, metro])));

// An airport missing from PASSENGERS is a small one; OurAirports' type still
// puts a large one above a regional strip.
const assumedPassengers = (score) => (score >= 90 ? 1.5 : score >= 60 ? 0.4 : 0.05);

const missingMetroCities = (records) => Object.entries(METRO_CITIES)
  .filter(([code]) => !records.some((r) => r.type === 'CITY' && r.code === code))
  .filter(([code]) => records.some((r) => r.type === 'AIRPORT' && metroOf.get(r.code) === code))
  .map(([code, city]) => ({
    name: city.name, code, type: 'CITY', cityName: city.name, cityCode: code,
    country: city.countryCode, countryCode: city.countryCode, aliases: city.aliases ?? [], score: 99, lat: null, lon: null,
  }));

const load = () => {
  if (dataset) return;

  const raw = require('../data/airports/airports.min.json');
  dataset = [...raw.records, ...missingMetroCities(raw.records)]
    .map((r) => (r.type === 'AIRPORT' && CITY_NAMES[r.code]
      ? { ...r, cityName: CITY_NAMES[r.code], aliases: [...(r.aliases ?? []), r.cityName] }
      : r))
    .map((r) => ({
    ...r,
    cityCode: r.type === 'AIRPORT' && metroOf.has(r.code) ? metroOf.get(r.code) : r.cityCode,
    displayName: r.type === 'CITY'
      ? `${r.name} (${r.code}), ${r.countryCode}`
      : `${r.name} (${r.code}), ${r.cityName}, ${r.countryCode}`,
    geoCode: r.lat === null || r.lon === null ? null : { latitude: r.lat, longitude: r.lon },
    popularity: r.type === 'AIRPORT' ? PASSENGERS[r.code] ?? assumedPassengers(r.score) : 0,
    _name: normalize(r.name),
    _city: normalize(r.cityName),
    _country: normalize(r.country),
    // Historic city names travellers still type ("Bangalore" for Bengaluru).
    _aliases: (r.aliases ?? []).map(normalize),
    _short: (SHORT_NAMES[r.code] ?? []).map(normalize),
  }));

  for (const city of dataset.filter((r) => r.type === 'CITY')) {
    city.centre = METRO_CENTRES[city.code] ?? null;
    city.members = dataset
      .filter((r) => r.type === 'AIRPORT' && r.cityCode === city.code)
      .sort((a, b) => b.popularity - a.popularity);
    city.popularity = city.members.reduce((sum, airport) => sum + airport.popularity, 0);
  }

  byCode = new Map();
  tokens = new Map();

  for (const record of dataset) {
    // A metro code and an airport code never collide, but a city record should
    // win the lookup for its own code.
    if (!byCode.has(record.code) || record.type === 'CITY') byCode.set(record.code, record);

    const searchable = [record._name, record._city, ...record._aliases, ...record._short].join(' ');
    for (const word of new Set(searchable.split(/[^a-z0-9]+/).filter(Boolean))) {
      if (!tokens.has(word)) tokens.set(word, []);
      tokens.get(word).push(record);
    }
  }
};

const present = ({ _name, _city, _country, _aliases, _short, aliases, lat, lon, members, popularity, centre, ...rest }) => rest;

/** Straight-line kilometres from a city's centre to one of its airports, or null. */
const kmFromCentre = (centre, airport) => {
  if (!centre || airport.lat === null || airport.lon === null) return null;
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(airport.lat - centre[0]);
  const dLon = rad(airport.lon - centre[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(centre[0])) * Math.cos(rad(airport.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
};

const MATCH = Object.freeze({ code: 100, start: 60, word: 45, airportWord: 30, inside: 10 });

const atWordStart = (text, words) => ` ${text.replace(/[^a-z0-9]+/g, ' ')}`.includes(` ${words}`);

/** How well a place matches the typed text, before how busy it is is added; 0 is no match. */
const matchOf = (record, q, words) => {
  if (record.code.toLowerCase() === q || record._short.includes(q)) return MATCH.code;
  // "d" is not a start of "DC": a short name counts typed whole, a longer one from its start.
  if (record._city.startsWith(q) || record._aliases.some((name) => name.startsWith(q))
    || record._short.some((name) => name.length > 3 && name.startsWith(q))) return MATCH.start;
  if (record._name.startsWith(q) || [record._city, ...record._aliases].some((name) => atWordStart(name, words))) return MATCH.word;
  if (atWordStart(record._name, words)) return MATCH.airportWord;
  return 0;
};

/**
 * Search airports and cities.
 *
 * Ranked as booking.com ranks them: by how well the text matches - a code or a
 * short name ("LA", "NYC"), then the start of a city's name, then a word in it
 * or an airport's name - with how busy the place is added, so Hong Kong comes
 * before Honiara. A city with several airports is listed once with its airports
 * under it (`parent` names the city), whether or not each airport's own name
 * matches, and how far it is from the city centre (`distanceKm`).
 */
export const searchLocations = (keyword, subType = 'CITY,AIRPORT', options = {}) => {
  load();
  const { limit = 10, countryCode } = options;
  const q = normalize(keyword);
  if (q.length === 0) return { success: true, data: [], meta: { count: 0 } };
  const words = q.replace(/[^a-z0-9]+/g, ' ').trim();

  const wanted = new Set(String(subType || 'CITY,AIRPORT').split(',').map((s) => s.trim().toUpperCase()));
  const allowed = (record) => wanted.has(record.type)
    && (!countryCode || record.countryCode === String(countryCode).toUpperCase());
  const scored = new Map();
  const add = (record, match) => {
    if (match === 0 || !allowed(record)) return;
    const score = match + 10 * Math.log10(1 + record.popularity);
    const key = record.code + record.type;
    if (!scored.has(key) || scored.get(key).score < score) scored.set(key, { record, score });
  };

  const first = words.split(' ')[0];
  for (const [word, records] of tokens) {
    if (!word.startsWith(first)) continue;
    for (const record of records) add(record, matchOf(record, q, words));
  }
  if (byCode.has(q.toUpperCase())) {
    for (const record of dataset.filter((r) => r.code === q.toUpperCase())) add(record, MATCH.code);
  }

  // Fall back to a substring scan only when nothing matched a word's start.
  if (scored.size === 0) {
    for (const record of dataset) {
      if (record._name.includes(q) || record._city.includes(q) || record._aliases.some((a) => a.includes(q))) add(record, MATCH.inside);
    }
  }

  const grouping = wanted.has('AIRPORT');
  const entries = [...scored.values()].filter(({ record }) => !grouping || record.type !== 'CITY' || record.members.length > 1);
  const cities = grouping ? entries.filter(({ record }) => record.type === 'CITY') : [];
  const nested = new Set(cities.flatMap(({ record }) => record.members.map((airport) => airport.code)));

  const data = entries
    .filter(({ record }) => record.type === 'CITY' || !nested.has(record.code))
    .sort((a, b) => b.score - a.score || b.record.popularity - a.record.popularity || a.record.code.localeCompare(b.record.code))
    .flatMap(({ record }) => (grouping && record.type === 'CITY'
      ? [present(record), ...record.members.filter(allowed).map((airport) => {
        const distanceKm = kmFromCentre(record.centre, airport);
        return { ...present(airport), parent: record.code, ...(distanceKm === null ? {} : { distanceKm }) };
      })]
      : [present(record)]))
    .slice(0, limit);

  return { success: true, data, meta: { count: data.length } };
};

/**
 * Resolve free text to a bookable IATA code.
 * Returns null rather than guessing, so the caller can fail with a clear error
 * instead of sending nonsense to Amadeus.
 */
export const resolveToIata = (value) => {
  load();
  const raw = String(value ?? '').trim();
  // A code only when there is such a code: "XQZ" went to Amadeus as a place.
  if (/^[A-Za-z]{3}$/.test(raw) && byCode.has(raw.toUpperCase())) return raw.toUpperCase();

  // "New Delhi (DEL)" is what picking a suggestion puts in the field, and the
  // code in brackets is the answer. Searched as text, only its first word
  // counted, so "New Delhi (DEL)" became NYC, "Mumbai (BOM)" NMI and
  // "London (LHR)" the whole London metro - a search for another city.
  const labelled = raw.match(/\(([A-Za-z]{3})\)$/);
  if (labelled) return labelled[1].toUpperCase();

  return namedPlace(raw);
};

/**
 * The place a typed name is the whole name of, or null.
 *
 * Typed text used to take the first search suggestion, which matches on the
 * first word only: "San Francisco, CA" became OUA (Ouagadougou), "New Delhi
 * India" NYC. A name now has to be a city's or an airport's name exactly - after
 * dropping anything after a comma ("San Francisco, CA") or trailing words
 * ("New Delhi India") - or nothing is guessed, and the search asks the customer
 * to pick from the list.
 */
const namedPlace = (text) => {
  const beforeComma = normalize(String(text).split(',')[0]).replace(/\s+/g, ' ');
  const words = beforeComma.split(' ').filter(Boolean);
  // A city's own code (the metro) first, then its best-known airport.
  const best = (records) => records.sort((a, b) => (a.type === 'CITY' ? -1 : 0) - (b.type === 'CITY' ? -1 : 0) || b.score - a.score)[0].code;
  const wordsOf = (value) => value.split(/[^a-z0-9]+/).filter(Boolean);

  for (let length = words.length; length > 0; length -= 1) {
    const candidate = words.slice(0, length).join(' ');
    const exact = dataset.filter((record) => record._city === candidate
      || record._aliases.includes(candidate)
      || record._name === candidate);
    if (exact.length > 0) return best(exact);

    // Whole words of one city's name: "delhi" for New Delhi. Never a fragment
    // of a word ("Bang"), and only when those words name a single city.
    const whole = dataset.filter((record) => {
      const named = [record._city, ...record._aliases].map(wordsOf);
      return named.some((nameWords) => wordsOf(candidate).every((word) => nameWords.includes(word)));
    });
    const cities = new Set(whole.map((record) => record._city));
    if (whole.length > 0 && cities.size === 1) return best(whole);
  }
  return null;
};

/** The most airports a search may name on one side. Amadeus takes 50; a list longer than this is not a choice. */
export const MAX_PLACES = 6;

const CODE_LIST = /^[A-Za-z]{3}(\s*,\s*[A-Za-z]{3})+$/;

/**
 * The places one side of a search names: ["JFK", "EWR"] for "JFK,EWR", or the
 * one place any other text names. Only a list of codes is split: "San
 * Francisco, CA" is one place. Null when any of them is not a place.
 */
export const resolvePlaces = (value) => {
  const text = String(value ?? '').trim();
  if (!CODE_LIST.test(text)) {
    const code = resolveToIata(text);
    return code ? [code] : null;
  }
  const codes = [...new Set(text.split(',').map((part) => resolveToIata(part.trim())))];
  return codes.length <= MAX_PLACES && codes.every(Boolean) ? codes : null;
};

/** The ISO country code of an airport or city code, or null when it is unknown. */
export const countryOfAirport = (code) => {
  load();
  return byCode.get(String(code || '').toUpperCase())?.countryCode ?? null;
};

/** The city an airport or city code is in, or null when it is unknown. */
export const cityOfAirport = (code) => {
  load();
  return byCode.get(String(code || '').toUpperCase())?.cityName ?? null;
};

/** True when a code is a metropolitan code, which searches a whole city. */
export const isCityCode = (code) => {
  load();
  return byCode.get(String(code || '').toUpperCase())?.type === 'CITY';
};

export const datasetInfo = () => {
  const raw = require('../data/airports/airports.min.json');
  return { source: raw.source, generatedAt: raw.generatedAt, count: raw.count };
};
