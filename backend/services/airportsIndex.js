import { createRequire } from 'node:module';

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

const load = () => {
  if (dataset) return;

  const raw = require('../data/airports/airports.min.json');
  dataset = raw.records.map((r) => ({
    ...r,
    displayName: r.type === 'CITY'
      ? `${r.name} (${r.code}), ${r.countryCode}`
      : `${r.name} (${r.code}), ${r.cityName}, ${r.countryCode}`,
    geoCode: r.lat === null || r.lon === null ? null : { latitude: r.lat, longitude: r.lon },
    _name: normalize(r.name),
    _city: normalize(r.cityName),
    _country: normalize(r.country),
    // Historic city names travellers still type ("Bangalore" for Bengaluru).
    _aliases: (r.aliases ?? []).map(normalize),
  }));

  byCode = new Map();
  tokens = new Map();

  for (const record of dataset) {
    // A metro code and an airport code never collide, but a city record should
    // win the lookup for its own code.
    if (!byCode.has(record.code) || record.type === 'CITY') byCode.set(record.code, record);

    const searchable = [record._name, record._city, ...record._aliases].join(' ');
    for (const word of new Set(searchable.split(/[^a-z0-9]+/).filter(Boolean))) {
      if (!tokens.has(word)) tokens.set(word, []);
      tokens.get(word).push(record);
    }
  }
};

const present = ({ _name, _city, _country, _aliases, aliases, lat, lon, ...rest }) => rest;

/**
 * Search airports and cities.
 *
 * Ranked so the obvious answer comes first: an exact IATA code, then a city
 * whose name starts with the query, then an airport name, then anything
 * containing it. Within a tier the dataset's popularity score decides.
 */
export const searchLocations = (keyword, subType = 'CITY,AIRPORT', options = {}) => {
  load();
  const { limit = 10, countryCode } = options;
  const q = normalize(keyword);
  if (q.length === 0) return { success: true, data: [], meta: { count: 0 } };

  const wanted = new Set(String(subType || 'CITY,AIRPORT').split(',').map((s) => s.trim().toUpperCase()));
  const matches = new Map();

  const add = (record, tier) => {
    if (!wanted.has(record.type)) return;
    if (countryCode && record.countryCode !== String(countryCode).toUpperCase()) return;
    const existing = matches.get(record.code + record.type);
    if (!existing || tier < existing.tier) matches.set(record.code + record.type, { record, tier });
  };

  if (/^[a-z]{3}$/.test(q) && byCode.has(q.toUpperCase())) add(byCode.get(q.toUpperCase()), 0);

  const first = q.split(/[^a-z0-9]+/)[0];
  for (const [word, records] of tokens) {
    if (!word.startsWith(first)) continue;
    for (const record of records) {
      if (record._city.startsWith(q) || record._aliases.some((a) => a.startsWith(q))) add(record, 1);
      else if (record._name.startsWith(q)) add(record, 2);
      else add(record, 3);
    }
  }

  // Fall back to a substring scan only when the prefix index found nothing.
  if (matches.size === 0) {
    for (const record of dataset) {
      if (record._name.includes(q) || record._city.includes(q) || record._country.includes(q)
        || record._aliases.some((a) => a.includes(q))) add(record, 4);
    }
  }

  const data = [...matches.values()]
    .sort((a, b) => a.tier - b.tier || b.record.score - a.record.score)
    .slice(0, limit)
    .map(({ record }) => present(record));

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
  if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();

  const { data } = searchLocations(raw, 'CITY,AIRPORT', { limit: 1 });
  return data[0]?.code ?? null;
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
