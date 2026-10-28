/**
 * Airport Service
 * Dynamic airport fetching using Amadeus Reference Data API
 * with intelligent caching and location-based features
 * 
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/airport-and-city-search
 */

import apiConfig from '@/config/api';
import { allAirports } from '../Pages/Common/flights/airports.js';
import GeoService from './GeoService.js';

// In-memory cache for API results
const cache = {
    searches: new Map(), // keyword -> results
    nearbyAirports: null,
    userLocation: null,
    lastFetch: null,
    TTL: 5 * 60 * 1000 // 5 minutes cache
};

/**
 * Get API base URL dynamically
 */
const getApiUrl = () => {
    return apiConfig.baseUrl || '';
};

const COUNTRY_NAMES = (() => {
    try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();
const SHORTER_COUNTRY_NAMES = { HK: 'Hong Kong', MO: 'Macau' };

export const countryName = (code) => {
    const iso = String(code || '').toUpperCase();
    if (SHORTER_COUNTRY_NAMES[iso]) return SHORTER_COUNTRY_NAMES[iso];
    try { return (/^[A-Z]{2}$/.test(iso) && COUNTRY_NAMES?.of(iso)) || code || ''; } catch { return code || ''; }
};

// OurAirports decorates a city: "Paris (Roissy-en-France, Val-d'Oise)", "Honolulu, Oahu".
const plainCity = (name) => String(name || '').split('(')[0].split(',')[0].trim();
const shortAirportName = (name) => String(name || '').replace(/\s+(International\s+)?Airport$/i, '').trim() || name;

/**
 * One row of the search list, from one row of the API's answer, laid out as
 * booking.com lays it: the code, the place, and under it the country - or,
 * for an airport listed under its city (`parentName`), how far it is from the
 * centre. `name` is what picking it puts in the box: the city, or the airport
 * for one listed under its city.
 */
export const toPlace = (row, parentName) => {
    const country = countryName(row.countryCode || row.country);
    const base = { code: row.code, type: row.type, country, countryCode: row.countryCode };
    if (row.type === 'CITY') {
        return { ...base, name: row.name, title: row.name, subtitle: country };
    }
    const city = plainCity(row.cityName) || row.name;
    if (row.parent) {
        const subtitle = Number.isFinite(row.distanceKm) ? `${row.distanceKm} km from downtown` : `${parentName || city}, ${country}`;
        return { ...base, parent: row.parent, name: shortAirportName(row.name), title: row.name, subtitle };
    }
    return { ...base, name: city, title: row.name, subtitle: `${city}, ${country}` };
};

const toPlaces = (rows) => rows.map((row) => toPlace(
    row,
    row.parent ? rows.find((other) => other.type === 'CITY' && other.code === row.parent)?.name : undefined,
));

const cacheKeyOf = (keyword) => keyword.trim().toLowerCase();

/** The list already fetched for this text, or null. */
export const cachedAirports = (keyword) => {
    const cached = cache.searches.get(cacheKeyOf(keyword || ''));
    return cached && Date.now() - cached.timestamp < cache.TTL ? cached.data : null;
};

/**
 * Airports and cities for what was typed, ranked by the API: a city with
 * several airports first, its airports under it. Only when the API cannot be
 * reached does the short built-in list stand in.
 * @param {string} keyword - Search term (city name, airport code, etc.)
 * @returns {Promise<Array>} - Rows for the search list
 */
export const searchAirports = async (keyword) => {
    if (!keyword || !keyword.trim()) return [];
    const cached = cachedAirports(keyword);
    if (cached) return cached;

    try {
        const response = await fetch(`${getApiUrl()}/airports/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ keyword: keyword.trim(), limit: 12 }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Airport search failed');

        const places = toPlaces(result.data || []);
        cache.searches.set(cacheKeyOf(keyword), { data: places, timestamp: Date.now() });
        return places;
    } catch (error) {
        console.warn('⚠️ Airport API failed, using local data:', error.message);
        return searchLocalAirports(keyword);
    }
};

const plain = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * How well a place matches what was typed: the airport code, then the start of
 * its name or city, then the start of a word in them. 0 is no match. A letter
 * of the country is not a match - "d" listed every airport in India.
 */
export const placeScore = (place, keyword) => {
    const term = plain(keyword).trim();
    if (!term) return 0;
    const code = plain(place?.code);
    const name = plain(place?.name);
    const city = plain(place?.cityName);
    if (code === term) return 100;
    if (name.startsWith(term) || city.startsWith(term)) return 80;
    if (term.length <= 3 && code.startsWith(term)) return 70;
    if (`${name} ${city}`.split(/[\s\-(),/.]+/).some((word) => word.startsWith(term))) return 60;
    if (term.length >= 3 && (name.includes(term) || city.includes(term))) return 40;
    if (term.length >= 3 && plain(place?.country).startsWith(term)) return 20;
    return 0;
};

const ranked = (places, keyword) => places
    .map((place, order) => ({ place, order, score: placeScore(place, keyword) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.place);

/**
 * Search in local hardcoded airports (fallback). The list is in order of how
 * often our customers fly there, which breaks ties.
 * @param {string} keyword - Search term
 * @returns {Array} - Matching airports
 */
export const searchLocalAirports = (keyword) => {
    if (!keyword || keyword.length < 1) return [];

    return ranked(allAirports, keyword)
        .slice(0, 12)
        .map(airport => ({
            ...airport,
            title: airport.name,
            subtitle: airport.country,
            fullName: `${airport.name} (${airport.code}), ${airport.country}`
        }));
};

/**
 * Get nearby airports based on user's location
 * @returns {Promise<Array>} - Nearby airports
 */
export const getNearbyAirports = async () => {
    // Return cached if fresh
    if (cache.nearbyAirports && cache.lastFetch &&
        Date.now() - cache.lastFetch < cache.TTL) {
        return cache.nearbyAirports;
    }

    try {
        // Get user location
        const location = await GeoService.getUserLocation();
        cache.userLocation = location;

        console.log(`📍 User location: ${location.city}, ${location.country}`);

        // Search for airports near user's city
        const airports = await searchAirports(location.city, {
            countryCode: location.countryCode,
            limit: 10
        });

        if (airports.length > 0) {
            cache.nearbyAirports = airports;
            cache.lastFetch = Date.now();
            return airports;
        }

        // Fallback: find matching airports from local data
        const localMatches = allAirports.filter(
            a => a.country.toLowerCase().includes(location.country?.toLowerCase() || '') ||
                a.name.toLowerCase().includes(location.city?.toLowerCase() || '')
        ).slice(0, 10);

        cache.nearbyAirports = localMatches;
        cache.lastFetch = Date.now();
        return localMatches;

    } catch (error) {
        console.warn('⚠️ Could not get nearby airports:', error.message);
        // Return top Indian airports as default
        return allAirports.filter(a => a.country === 'India').slice(0, 10);
    }
};

/**
 * Get default departure airport based on user location
 * @returns {Promise<Object|null>} - Nearest airport or null
 */
export const getDefaultDepartureAirport = async () => {
    try {
        const location = cache.userLocation || await GeoService.getUserLocation();
        cache.userLocation = location;

        // First try exact city match
        let airport = allAirports.find(
            a => a.name.toLowerCase() === location.city?.toLowerCase()
        );

        if (!airport) {
            // Try partial match
            airport = allAirports.find(
                a => a.name.toLowerCase().includes(location.city?.toLowerCase() || '') ||
                    location.city?.toLowerCase().includes(a.name.toLowerCase())
            );
        }

        if (!airport) {
            // Last resort: first airport in user's country
            airport = allAirports.find(
                a => a.country.toLowerCase() === location.country?.toLowerCase()
            );
        }

        return airport || null;
    } catch {
        return null;
    }
};

/**
 * Get airport details by IATA code
 * @param {string} code - IATA code (e.g., "DEL")
 * @returns {Object|null} - Airport details
 */
export const getAirportByCode = (code) => {
    if (!code) return null;
    return allAirports.find(a => a.code.toUpperCase() === code.toUpperCase()) || null;
};

/**
 * Get city name by IATA code
 * @param {string} code - IATA code
 * @returns {string} - City name or code if not found
 */
export const getCityNameByCode = (code) => {
    const airport = getAirportByCode(code);
    return airport?.name || code;
};

const cityNameCache = new Map();

/**
 * City names, from the airport API, for IATA codes the built-in list lacks.
 * Codes it cannot place are left out, so callers keep showing the code.
 * @param {string[]} codes - IATA codes
 * @returns {Promise<Object>} - Map of code to city name
 */
export const resolveCityNames = async (codes = []) => {
    const wanted = [...new Set(codes.map((code) => String(code || '').trim().toUpperCase()))]
        .filter((code) => /^[A-Z]{3}$/.test(code) && !getAirportByCode(code));

    await Promise.all(wanted.filter((code) => !cityNameCache.has(code)).map(async (code) => {
        try {
            // No countryCode: the API filters by it, and the airport may be abroad.
            const response = await fetch(`${getApiUrl()}/airports/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ keyword: code, limit: 5 })
            });
            const result = response.ok ? await response.json() : null;
            const places = Array.isArray(result?.data) ? result.data : [];
            const place = places.find((p) => String(p.code).toUpperCase() === code)
                || places.find((p) => String(p.cityCode).toUpperCase() === code);
            if (place?.cityName || place?.name) cityNameCache.set(code, place.cityName || place.name);
        } catch {
            // The code stays on screen.
        }
    }));

    return Object.fromEntries(wanted.filter((code) => cityNameCache.has(code)).map((code) => [code, cityNameCache.get(code)]));
};

/**
 * Build city code map from airports
 * @returns {Object} - Map of city names to codes
 */
export const buildCityCodeMap = () => {
    return allAirports.reduce((acc, airport) => {
        acc[airport.name] = airport.code;
        return acc;
    }, {});
};

/**
 * Build city details map from airports
 * @returns {Object} - Map of codes to city details
 */
export const buildCityDetailsMap = () => {
    return allAirports.reduce((acc, airport) => {
        acc[airport.code] = {
            name: airport.name,
            country: airport.country,
            type: airport.type
        };
        return acc;
    }, {});
};

/**
 * Clear cache (useful for testing or force refresh)
 */
export const clearCache = () => {
    cache.searches.clear();
    cityNameCache.clear();
    cache.nearbyAirports = null;
    cache.lastFetch = null;
};

// Default export with all methods
const AirportService = {
    searchAirports,
    searchLocalAirports,
    cachedAirports,
    toPlace,
    getNearbyAirports,
    getDefaultDepartureAirport,
    getAirportByCode,
    getCityNameByCode,
    resolveCityNames,
    buildCityCodeMap,
    buildCityDetailsMap,
    clearCache,
    // Direct access to local data for fallback
    allAirports
};

export default AirportService;
