/**
 * Flight Analytics Service
 * Frontend service for consuming Amadeus Flight Analytics APIs
 * 
 * @see https://developers.amadeus.com/self-service/category/flights
 */

import apiConfig from '../../src/config/api.js';

// In-memory cache
const cache = {
    data: new Map(),
    TTL: 10 * 60 * 1000 // 10 minutes
};

/**
 * Get API base URL
 */
const getApiUrl = () => {
    try {
        return apiConfig.baseUrl || '';
    } catch {
        if (typeof window !== 'undefined') {
            const isLocal = window.location.hostname === 'localhost';
            return isLocal ? 'http://localhost:5005/api' : 'https://www.jetsetterss.com/api';
        }
        return '';
    }
};

/**
 * Generic fetch with caching
 */
const fetchWithCache = async (endpoint, params, cacheKey) => {
    // Check cache
    if (cache.data.has(cacheKey)) {
        const cached = cache.data.get(cacheKey);
        if (Date.now() - cached.timestamp < cache.TTL) {
            console.log(`✅ Cache hit: ${cacheKey}`);
            return cached.data;
        }
    }

    try {
        const url = new URL(`${getApiUrl()}${endpoint}`);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, value);
            }
        });

        const response = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();

        if (result.success && result.data) {
            cache.data.set(cacheKey, {
                data: result.data,
                timestamp: Date.now()
            });
        }

        return result.data || [];
    } catch (error) {
        console.warn(`⚠️ FlightAnalytics API error:`, error.message);
        return [];
    }
};

/**
 * Get Most Booked Destinations from an origin city
 * @param {string} origin - IATA city code (e.g., "DEL", "NYC")
 * @param {string} period - Optional period (e.g., "2024-01")
 */
export const getMostBookedDestinations = async (origin, period) => {
    return fetchWithCache(
        '/flights/analytics',
        { endpoint: 'booked', origin, period },
        `booked_${origin}_${period}`
    );
};

/**
 * Get Most Traveled Destinations from an origin city
 */
export const getMostTraveledDestinations = async (origin, period) => {
    return fetchWithCache(
        '/flights/analytics',
        { endpoint: 'traveled', origin, period },
        `traveled_${origin}_${period}`
    );
};

/**
 * Get Busiest Travel Periods for a city
 * @param {string} origin - IATA city code
 * @param {string} year - Year (e.g., "2024")
 * @param {string} direction - "ARRIVING" or "DEPARTING"
 */
export const getBusiestTravelPeriod = async (origin, year, direction = 'DEPARTING') => {
    return fetchWithCache(
        '/flights/analytics',
        { endpoint: 'busiest', origin, year, direction },
        `busiest_${origin}_${year}_${direction}`
    );
};

/**
 * Get Cheapest Flight Dates between two cities
 * @param {string} origin - Origin IATA code
 * @param {string} destination - Destination IATA code
 * @param {Object} options - Additional options
 */
export const getCheapestFlightDates = async (origin, destination, options = {}) => {
    return fetchWithCache(
        '/flights/cheapest-dates',
        { origin, destination, ...options },
        `cheapest_${origin}_${destination}_${JSON.stringify(options)}`
    );
};

/**
 * Get On-Demand Flight Status
 * @param {string} carrier - Airline IATA code (e.g., "AI", "BA")
 * @param {string} flightNumber - Flight number
 * @param {string} date - Date (YYYY-MM-DD)
 */
export const getFlightStatus = async (carrier, flightNumber, date) => {
    return fetchWithCache(
        '/flights/status',
        { carrier, flightNumber, date },
        `status_${carrier}${flightNumber}_${date}`
    );
};

/**
 * Get Flight Availabilities (seat inventory)
 * @param {string} origin - Origin IATA code
 * @param {string} destination - Destination IATA code
 * @param {string} departureDate - Date (YYYY-MM-DD)
 */
export const getFlightAvailabilities = async (origin, destination, departureDate) => {
    return fetchWithCache(
        '/flights/availabilities',
        { origin, destination, departureDate },
        `avail_${origin}_${destination}_${departureDate}`
    );
};

/**
 * Clear analytics cache
 */
export const clearCache = () => {
    cache.data.clear();
};

// Default export
const FlightAnalyticsService = {
    getMostBookedDestinations,
    getMostTraveledDestinations,
    getBusiestTravelPeriod,
    getCheapestFlightDates,
    getFlightStatus,
    getFlightAvailabilities,
    clearCache
};

export default FlightAnalyticsService;
