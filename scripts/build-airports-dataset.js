#!/usr/bin/env node
/**
 * Build the bundled airport/city dataset.
 *
 * The Enterprise WSAP has no location-search operation, so city -> IATA
 * resolution and the autocomplete endpoint have to be served locally. Source is
 * OurAirports (public domain, https://ourairports.com/data/), filtered to
 * airports that have an IATA code and scheduled service - the only ones a
 * traveller can actually fly from.
 *
 * Output is committed so builds and tests are offline and deterministic.
 * Re-run when the dataset needs refreshing:
 *
 *   node scripts/build-airports-dataset.js [path/to/airports.csv]
 *
 * Without an argument it downloads the current file.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const OUTPUT = resolve('backend/data/airports/airports.min.json');

/** RFC 4180 CSV: fields may be quoted and contain commas or escaped quotes. */
const parseCsvLine = (line) => {
  const out = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
};

/**
 * Rank by how likely a traveller means this airport, so the existing
 * sort-by-score ordering in the UI stays meaningful.
 */
const scoreOf = (type, hasMunicipality) => {
  const base = { large_airport: 90, medium_airport: 60, small_airport: 25 }[type] ?? 10;
  return hasMunicipality ? base + 5 : base;
};

const TYPE_RANK = { large_airport: 3, medium_airport: 2, small_airport: 1 };

/**
 * IATA metropolitan codes.
 *
 * These are real codes that search every airport in a metro at once - sending
 * LON finds Heathrow, Gatwick, City and Stansted in one request. OurAirports
 * has no city codes, and deriving one from an airport would be a fabrication
 * (London is not LGW), so the multi-airport metros are curated here. Cities
 * with a single airport need no entry: their airport code already is the answer.
 */
const METRO_CODES = Object.freeze([
  { code: 'LON', name: 'London', countryCode: 'GB' },
  { code: 'NYC', name: 'New York', countryCode: 'US' },
  { code: 'PAR', name: 'Paris', countryCode: 'FR' },
  { code: 'TYO', name: 'Tokyo', countryCode: 'JP' },
  { code: 'MIL', name: 'Milan', countryCode: 'IT' },
  { code: 'ROM', name: 'Rome', countryCode: 'IT' },
  { code: 'MOW', name: 'Moscow', countryCode: 'RU' },
  { code: 'WAS', name: 'Washington', countryCode: 'US' },
  { code: 'CHI', name: 'Chicago', countryCode: 'US' },
  { code: 'YTO', name: 'Toronto', countryCode: 'CA' },
  { code: 'YMQ', name: 'Montreal', countryCode: 'CA' },
  { code: 'SAO', name: 'Sao Paulo', countryCode: 'BR' },
  { code: 'RIO', name: 'Rio de Janeiro', countryCode: 'BR' },
  { code: 'BUE', name: 'Buenos Aires', countryCode: 'AR' },
  { code: 'BER', name: 'Berlin', countryCode: 'DE' },
  { code: 'STO', name: 'Stockholm', countryCode: 'SE' },
  { code: 'OSA', name: 'Osaka', countryCode: 'JP' },
  { code: 'SEL', name: 'Seoul', countryCode: 'KR' },
  { code: 'BJS', name: 'Beijing', countryCode: 'CN' },
  { code: 'SHA', name: 'Shanghai', countryCode: 'CN' },
  { code: 'JKT', name: 'Jakarta', countryCode: 'ID' },
  { code: 'TEH', name: 'Tehran', countryCode: 'IR' },
  { code: 'IST', name: 'Istanbul', countryCode: 'TR' },
]);

/**
 * Alternate city names travellers actually type.
 *
 * OurAirports uses current official names, but a customer searching for flights
 * types the name they know - "Bangalore", not "Bengaluru". Without these the
 * autocomplete returns nothing for some of the busiest routes on the site.
 * Keyed by the dataset's name, lower-cased.
 */
const CITY_ALIASES = Object.freeze({
  bengaluru: ['Bangalore'],
  mumbai: ['Bombay'],
  kolkata: ['Calcutta'],
  chennai: ['Madras'],
  puducherry: ['Pondicherry'],
  thiruvananthapuram: ['Trivandrum'],
  vadodara: ['Baroda'],
  kochi: ['Cochin'],
  mangaluru: ['Mangalore'],
  mysuru: ['Mysore'],
  pune: ['Poona'],
  varanasi: ['Benares', 'Banaras'],
  prayagraj: ['Allahabad'],
  'ho chi minh city': ['Saigon'],
  guangzhou: ['Canton'],
  yangon: ['Rangoon'],
  'nur-sultan': ['Astana'],
  chisinau: ['Kishinev'],
});

const build = async (csvPath) => {
  const csv = csvPath
    ? await readFile(csvPath, 'utf8')
    : await fetch(SOURCE_URL).then((r) => {
      if (!r.ok) throw new Error(`Download failed: ${r.status}`);
      return r.text();
    });

  const [header, ...lines] = csv.split('\n');
  const cols = parseCsvLine(header).map((c) => c.replace(/^"|"$/g, ''));
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));

  const airports = [];
  const metroSeen = new Set();

  for (const line of lines) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line);

    const iata = (f[idx.iata_code] || '').trim().toUpperCase();
    const type = (f[idx.type] || '').trim();
    const scheduled = (f[idx.scheduled_service] || '').trim() === 'yes';

    // An airport with no IATA code cannot be searched or booked; one without
    // scheduled service is not somewhere a customer flies.
    if (!/^[A-Z]{3}$/.test(iata) || !scheduled) continue;
    if (!TYPE_RANK[type]) continue;

    const municipality = (f[idx.municipality] || '').trim();
    const country = (f[idx.iso_country] || '').trim();
    const cityKey = municipality.toLowerCase();
    // Municipality is often decorated - CDG sits in "Paris (Roissy-en-France,
    // Val-d'Oise)" - so a metro matches on the leading city name, not equality.
    const metro = METRO_CODES.find((m) => m.countryCode === country
      && (cityKey === m.name.toLowerCase() || cityKey.startsWith(`${m.name.toLowerCase()} (`)));

    airports.push({
      name: (f[idx.name] || '').trim(),
      code: iata,
      type: 'AIRPORT',
      cityName: municipality || (f[idx.name] || '').trim(),
      // The metro code when this airport belongs to one, so a caller can widen
      // the search to the whole city; otherwise the airport is its own city.
      cityCode: metro ? metro.code : iata,
      country,
      countryCode: country,
      aliases: CITY_ALIASES[cityKey] ?? CITY_ALIASES[cityKey.split(' (')[0]] ?? [],
      score: scoreOf(type, Boolean(municipality)),
      lat: Number.parseFloat(f[idx.latitude_deg]) || null,
      lon: Number.parseFloat(f[idx.longitude_deg]) || null,
    });

    if (metro) metroSeen.add(`${metro.name.toLowerCase()}|${country}`);
  }

  // Only emit a CITY record for a curated metro we actually saw an airport for.
  const cities = METRO_CODES
    .filter((m) => metroSeen.has(`${m.name.toLowerCase()}|${m.countryCode}`))
    .map((m) => ({
      name: m.name,
      code: m.code,
      type: 'CITY',
      cityName: m.name,
      cityCode: m.code,
      country: m.countryCode,
      countryCode: m.countryCode,
      aliases: CITY_ALIASES[m.name.toLowerCase()] ?? [],
      score: 99,
      lat: null,
      lon: null,
    }));

  const data = [...airports, ...cities].sort((a, b) => b.score - a.score);

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify({
    source: 'OurAirports (public domain)',
    generatedAt: new Date().toISOString().slice(0, 10),
    count: data.length,
    records: data,
  }), 'utf8');

  const bytes = Buffer.byteLength(JSON.stringify(data));
  console.log(`Wrote ${OUTPUT}: ${airports.length} airports + ${cities.length} cities = ${data.length} records (${Math.round(bytes / 1024)} KB)`);
};

build(process.argv[2]).catch((error) => {
  console.error('Failed to build the airport dataset:', error.message);
  process.exitCode = 1;
});
