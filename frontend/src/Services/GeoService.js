
/**
 * Geo Service
 * Handles fetching user location data from IP-based services.
 */

// Map cities/regions to their nearest major airport IATA code
// This ensures suburban cities (e.g. Noida, Gurgaon) map to the right airport hub
const cityToAirportCode = {
    // Delhi NCR region
    'new delhi': 'DEL', 'delhi': 'DEL', 'noida': 'DEL', 'greater noida': 'DEL',
    'gurgaon': 'DEL', 'gurugram': 'DEL', 'faridabad': 'DEL', 'ghaziabad': 'DEL',
    // Mumbai region
    'mumbai': 'BOM', 'navi mumbai': 'BOM', 'thane': 'BOM',
    // Bangalore
    'bangalore': 'BLR', 'bengaluru': 'BLR',
    // Chennai
    'chennai': 'MAA',
    // Hyderabad
    'hyderabad': 'HYD',
    // Kolkata
    'kolkata': 'CCU',
    // Pune
    'pune': 'PNQ',
    // Ahmedabad
    'ahmedabad': 'AMD',
    // Goa
    'goa': 'GOI', 'panaji': 'GOI', 'vasco da gama': 'GOI',
    // Jaipur
    'jaipur': 'JAI',
    // Lucknow
    'lucknow': 'LKO',
    // Kochi
    'kochi': 'COK', 'cochin': 'COK',
    // International
    'new york': 'JFK', 'los angeles': 'LAX', 'london': 'LHR',
    'dubai': 'DXB', 'singapore': 'SIN', 'bangkok': 'BKK',
    'tokyo': 'NRT', 'paris': 'CDG', 'sydney': 'SYD',
    'hong kong': 'HKG', 'san francisco': 'SFO', 'chicago': 'ORD',
};

// Map airport codes to display-friendly major city names
const airportCodeToCity = {
    'DEL': 'New Delhi', 'BOM': 'Mumbai', 'BLR': 'Bangalore', 'MAA': 'Chennai',
    'HYD': 'Hyderabad', 'CCU': 'Kolkata', 'PNQ': 'Pune', 'AMD': 'Ahmedabad',
    'GOI': 'Goa', 'JAI': 'Jaipur', 'LKO': 'Lucknow', 'COK': 'Kochi',
    'JFK': 'New York', 'LAX': 'Los Angeles', 'LHR': 'London',
    'DXB': 'Dubai', 'SIN': 'Singapore', 'BKK': 'Bangkok',
    'NRT': 'Tokyo', 'CDG': 'Paris', 'SYD': 'Sydney',
    'HKG': 'Hong Kong', 'SFO': 'San Francisco', 'ORD': 'Chicago',
};

/**
 * Resolve a city name to its nearest airport code and major city name
 */
const resolveAirport = (city) => {
    // No code for a city this list does not know. Every unknown city - Houston,
    // Denver, anywhere not listed - came back as New Delhi, so a visitor in the
    // US clicking "London" searched DEL-LHR and the cheapest fares were priced
    // from Delhi. An unknown origin makes the page ask for one instead.
    if (!city) return { cityCode: '', airportCity: '' };
    const key = city.toLowerCase().trim();
    const code = cityToAirportCode[key] || '';
    const airportCity = code ? (airportCodeToCity[code] || city) : city;
    return { cityCode: code, airportCity };
};

const GeoService = {
    /**
     * Fetch user location - tries backend proxy first, then direct ipapi.co
     * @returns {Promise<Object>} Location data with cityCode for nearest airport
     */
    getUserLocation: async () => {
        // Try 1: Backend proxy endpoint
        try {
            const response = await fetch('/api/geo/location');
            if (response.ok) {
                const data = await response.json();
                const { cityCode, airportCity } = resolveAirport(data.city);
                return {
                    country: data.country_name,
                    countryCode: data.country_code,
                    city: airportCity,
                    cityCode: cityCode,
                    rawCity: data.city,
                    currency: data.currency,
                    callingCode: data.country_calling_code,
                    region: data.region
                };
            }
        } catch (proxyError) {
            console.warn('GeoService: Backend proxy failed, trying direct API...', proxyError.message);
        }

        // Try 2: Direct ipapi.co call (fallback)
        try {
            const response = await fetch('https://ipapi.co/json/', {
                headers: { 'User-Agent': 'JetSetGo/1.0' }
            });
            if (response.ok) {
                const data = await response.json();
                const { cityCode, airportCity } = resolveAirport(data.city);
                return {
                    country: data.country_name,
                    countryCode: data.country_code,
                    city: airportCity,
                    cityCode: cityCode,
                    rawCity: data.city,
                    currency: data.currency,
                    callingCode: data.country_calling_code,
                    region: data.region
                };
            }
        } catch (directError) {
            console.warn('GeoService: Direct ipapi.co also failed', directError.message);
        }

        // Try 3: ipwho.is as last external fallback (free, supports HTTPS)
        try {
            const response = await fetch('https://ipwho.is/');
            if (response.ok) {
                const data = await response.json();
                if (data.success !== false) {
                    const { cityCode, airportCity } = resolveAirport(data.city);
                    return {
                        country: data.country,
                        countryCode: data.country_code,
                        city: airportCity,
                        cityCode: cityCode,
                        rawCity: data.city,
                        currency: data.currency?.code || 'USD',
                        callingCode: data.calling_code || '',
                        region: data.region
                    };
                }
            }
        } catch (fallbackError) {
            console.warn('GeoService: All external services failed', fallbackError.message);
        }

        // Final fallback: hardcoded defaults
        // Nowhere, rather than New Delhi: every visitor whose lookups failed was
        // placed in India, and flight searches started from DEL.
        console.warn('GeoService: location unknown');
        return {
            country: '',
            countryCode: '',
            city: '',
            cityCode: '',
            rawCity: '',
            // Prices in dollars, the currency every fare is charged in, and no
            // phone code: when every lookup failed the visitor was shown rupees
            // and handed India's +91, wherever they were.
            currency: 'USD',
            callingCode: '',
            region: ''
        };
    }
};

export default GeoService;
