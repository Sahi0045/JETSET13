
/**
 * Geo Service
 * Handles fetching user location data from IP-based services.
 */

const GeoService = {
    /**
     * Fetch user location - tries backend proxy first, then direct ipapi.co
     * @returns {Promise<Object>} Location data
     */
    getUserLocation: async () => {
        // Try 1: Backend proxy endpoint
        try {
            const response = await fetch('/api/geo/location');
            if (response.ok) {
                const data = await response.json();
                return {
                    country: data.country_name,
                    countryCode: data.country_code,
                    city: data.city,
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
                return {
                    country: data.country_name,
                    countryCode: data.country_code,
                    city: data.city,
                    currency: data.currency,
                    callingCode: data.country_calling_code,
                    region: data.region
                };
            }
        } catch (directError) {
            console.warn('GeoService: Direct ipapi.co also failed', directError.message);
        }

        // Try 3: ip-api.com as last external fallback
        try {
            const response = await fetch('http://ip-api.com/json/');
            if (response.ok) {
                const data = await response.json();
                return {
                    country: data.country,
                    countryCode: data.countryCode,
                    city: data.city,
                    currency: 'USD',
                    callingCode: '',
                    region: data.regionName
                };
            }
        } catch (fallbackError) {
            console.warn('GeoService: All external services failed', fallbackError.message);
        }

        // Final fallback: hardcoded defaults
        console.warn('GeoService: Using default location (India)');
        return {
            country: 'India',
            countryCode: 'IN',
            city: 'New Delhi',
            currency: 'INR',
            callingCode: '+91',
            region: 'Delhi'
        };
    }
};

export default GeoService;
