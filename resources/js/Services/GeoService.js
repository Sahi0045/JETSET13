
/**
 * Geo Service
 * Handles fetching user location data from IP-based services.
 */

const GeoService = {
    /**
     * Fetch user location from ipapi.co
     * @returns {Promise<Object>} Location data
     */
    getUserLocation: async () => {
        try {
            const response = await fetch('/api/geo/location');
            if (!response.ok) {
                throw new Error('Failed to fetch location data');
            }
            const data = await response.json();
            return {
                country: data.country_name,
                countryCode: data.country_code, // e.g., "US", "IN"
                city: data.city,
                currency: data.currency,
                callingCode: data.country_calling_code, // e.g., "+1", "+91"
                region: data.region
            };
        } catch (error) {
            console.warn('GeoService: Using default location (India)', error);
            // Fallback to default (India)
            return {
                country: 'India',
                countryCode: 'IN',
                city: 'New Delhi',
                currency: 'INR',
                callingCode: '+91',
                region: 'Delhi'
            };
        }
    }
};

export default GeoService;
