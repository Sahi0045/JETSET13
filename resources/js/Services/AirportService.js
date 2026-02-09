/**
 * Airport Service
 * Dynamic airport fetching using Amadeus Reference Data API
 * with intelligent caching and location-based features
 * 
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/airport-and-city-search
 */

import apiConfig from '../../../src/config/api.js';
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
    try {
        return apiConfig.baseUrl || '';
    } catch {
        // Fallback for SSR or when config not available
        if (typeof window !== 'undefined') {
            const isLocal = window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1';
            return isLocal ? 'http://localhost:5005/api' : 'https://www.jetsetterss.com/api';
        }
        return '';
    }
};

/**
 * Search airports by keyword using Amadeus API
 * @param {string} keyword - Search term (city name, airport code, etc.)
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Matching airports
 */
export const searchAirports = async (keyword, options = {}) => {
    if (!keyword || keyword.trim().length < 2) {
        return [];
    }

    const cacheKey = `${keyword.toLowerCase()}_${options.countryCode || ''}`;

    // Check cache first
    if (cache.searches.has(cacheKey)) {
        const cached = cache.searches.get(cacheKey);
        if (Date.now() - cached.timestamp < cache.TTL) {
            console.log(`✅ Airport search cache hit: "${keyword}"`);
            return cached.data;
        }
    }

    try {
        const baseUrl = getApiUrl();
        const url = `${baseUrl}/airports/search`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                keyword: keyword.trim(),
                countryCode: options.countryCode || cache.userLocation?.countryCode,
                limit: options.limit || 15
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data?.length > 0) {
            // Cache the results
            cache.searches.set(cacheKey, {
                data: result.data,
                timestamp: Date.now()
            });

            console.log(`✅ Airport API: Found ${result.data.length} results for "${keyword}"`);
            return result.data;
        }

        // API returned empty, use local fallback
        return searchLocalAirports(keyword);

    } catch (error) {
        console.warn(`⚠️ Airport API failed, using local data:`, error.message);
        return searchLocalAirports(keyword);
    }
};

/**
 * Search in local hardcoded airports (fallback)
 * @param {string} keyword - Search term
 * @returns {Array} - Matching airports
 */
export const searchLocalAirports = (keyword) => {
    if (!keyword || keyword.length < 1) return [];

    const term = keyword.toLowerCase();

    return allAirports
        .filter(airport =>
            airport.name.toLowerCase().includes(term) ||
            airport.code.toLowerCase().includes(term) ||
            airport.country.toLowerCase().includes(term)
        )
        .slice(0, 15)
        .map(airport => ({
            ...airport,
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
    cache.nearbyAirports = null;
    cache.lastFetch = null;
};

// Default export with all methods
const AirportService = {
    searchAirports,
    searchLocalAirports,
    getNearbyAirports,
    getDefaultDepartureAirport,
    getAirportByCode,
    getCityNameByCode,
    buildCityCodeMap,
    buildCityDetailsMap,
    clearCache,
    // Direct access to local data for fallback
    allAirports
};

export default AirportService;
