// Hotel Service - Amadeus API with JSON fallback
// Tries Amadeus API first, falls back to hotels.json when API fails

import DirectAmadeusService from './DirectAmadeusService';
import hotelsData from '../data/hotels.json';
import axios from 'axios';

// Detect production based on domain (more reliable than import.meta.env.PROD)
const isProduction = typeof window !== 'undefined' && 
    (window.location.hostname.includes('jetsetterss.com') || 
     window.location.hostname.includes('vercel.app'));
const API_BASE_URL = isProduction ? 'https://www.jetsetterss.com/api' : '/api';

class HotelService {
    constructor() {
        this.amadeus = DirectAmadeusService;
        this.fallbackData = hotelsData;
        this.useApiFirst = true;
    }

    /**
     * Search locations/cities for autocomplete using Amadeus API
     * @param {string} keyword - Search keyword
     * @returns {Promise<Array>} - Array of location objects
     */
    async searchLocations(keyword) {
        if (!keyword || keyword.length < 2) {
            return [];
        }

        try {
            console.log(`🔍 HotelService: Searching locations for: ${keyword}`);
            
            // Use different URL patterns for production (Vercel) vs local dev (Express)
            const url = isProduction 
                ? `${API_BASE_URL}/hotels?endpoint=locations&keyword=${encodeURIComponent(keyword)}`
                : `${API_BASE_URL}/hotels/locations?keyword=${encodeURIComponent(keyword)}`;
            
            const response = await axios.get(url, { timeout: 10000 });

            console.log(`📡 Location API response:`, response.data);

            if (response.data.success && response.data.data) {
                console.log(`✅ Found ${response.data.data.length} locations from API`);
                return response.data.data;
            }
            
            console.log('⚠️ API returned success but no data');
            return [];
        } catch (error) {
            console.error('❌ Error searching locations:', error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Search hotels by destination/city
     * @param {string} destination - City name or code
     * @param {string} checkInDate - Check-in date (YYYY-MM-DD)
     * @param {string} checkOutDate - Check-out date (YYYY-MM-DD)
     * @param {number} adults - Number of adults
     * @returns {Promise<Array>} - Array of hotel objects
     */
    async searchHotels(destination, checkInDate, checkOutDate, adults = 2) {
        console.log(`🏨 HotelService: Searching hotels for ${destination}`);

        // Try to map destination name to city code
        const cityCode = this.getCityCode(destination);

        if (this.useApiFirst && cityCode) {
            try {
                console.log(`🌐 Attempting Amadeus API search for ${cityCode}...`);
                const apiResults = await this.amadeus.searchHotels(cityCode, checkInDate, checkOutDate, adults);

                if (apiResults && apiResults.length > 0) {
                    console.log(`✅ API returned ${apiResults.length} hotels`);
                    return apiResults.map(hotel => this.normalizeApiHotel(hotel));
                }
            } catch (error) {
                console.warn('⚠️ Amadeus API search failed:', error.message);
            }
        }

        // Fallback to JSON data
        console.log(`📁 Using hotels.json fallback data for ${destination}`);
        return this.searchFromJson(destination);
    }

    /**
     * Get hotel by ID from either API or JSON
     * @param {string} hotelId - Hotel ID
     * @returns {Promise<Object|null>} - Hotel object or null
     */
    async getHotelById(hotelId) {
        console.log(`🏨 HotelService: Getting hotel by ID: ${hotelId}`);

        // Check if it's a JSON hotel ID (format: destination-number)
        if (hotelId && hotelId.includes('-')) {
            const hotel = this.getHotelFromJsonById(hotelId);
            if (hotel) {
                return hotel;
            }
        }

        // Check if it's an Amadeus hotel ID
        if (hotelId && hotelId.startsWith('amadeus-')) {
            // For Amadeus hotels, we'd need to make an API call
            // For now, return null and let the component handle it
            console.log('⚠️ Amadeus hotel lookup not implemented, use search results');
            return null;
        }

        // Try to find in all JSON destinations
        return this.getHotelFromJsonById(hotelId);
    }

    /**
     * Get hotel offers/room prices
     * @param {string} hotelId - Hotel ID
     * @param {string} checkInDate - Check-in date
     * @param {string} checkOutDate - Check-out date
     * @param {number} adults - Number of adults
     * @returns {Promise<Array>} - Array of room offers
     */
    async getHotelOffers(hotelId, checkInDate, checkOutDate, adults = 2) {
        console.log(`🏨 HotelService: Getting offers for hotel: ${hotelId}`);

        // For JSON hotels, return room data from the hotel object
        const hotel = await this.getHotelById(hotelId);
        if (hotel && hotel.rooms) {
            // Calculate total price based on stay duration
            const nights = this.calculateNights(checkInDate, checkOutDate);
            return hotel.rooms.map(room => ({
                ...room,
                totalPrice: room.price * nights,
                nights: nights,
                currency: hotel.currency || 'USD'
            }));
        }

        // Try Amadeus API
        try {
            const apiOffers = await this.amadeus.getHotelOffers(hotelId, checkInDate, checkOutDate, adults);
            if (apiOffers && apiOffers.length > 0) {
                return apiOffers;
            }
        } catch (error) {
            console.warn('⚠️ Failed to get API offers:', error.message);
        }

        return [];
    }

    /**
     * Get all hotels from JSON fallback data
     * @returns {Array} - All hotels from JSON
     */
    getAllHotels() {
        const allHotels = [];
        const destinations = this.fallbackData.destinations || {};

        Object.keys(destinations).forEach(destKey => {
            const destination = destinations[destKey];
            if (destination.hotels) {
                destination.hotels.forEach(hotel => {
                    allHotels.push({
                        ...hotel,
                        destinationName: destination.name,
                        destinationCode: destination.code,
                        country: destination.country
                    });
                });
            }
        });

        return allHotels;
    }

    /**
     * Get featured hotels for landing page
     * @param {number} count - Number of hotels to return
     * @returns {Array} - Featured hotels
     */
    getFeaturedHotels(count = 4) {
        const allHotels = this.getAllHotels();
        // Sort by rating and return top N
        return allHotels
            .sort((a, b) => b.rating - a.rating)
            .slice(0, count);
    }

    /**
     * Get available destinations
     * @returns {Array} - Array of destination objects
     */
    getDestinations() {
        const destinations = this.fallbackData.destinations || {};
        return Object.keys(destinations).map(key => ({
            id: key,
            ...destinations[key],
            hotelCount: destinations[key].hotels?.length || 0
        }));
    }

    // ========== Private Helper Methods ==========

    /**
     * Map destination name to IATA city code
     */
    getCityCode(destination) {
        if (!destination) return null;

        const cityCodeMap = {
            // Middle East & Asia
            'dubai': 'DXB',
            'tokyo': 'TYO',
            'singapore': 'SIN',
            'hong kong': 'HKG',
            'bangkok': 'BKK',
            'bali': 'DPS',
            'mumbai': 'BOM',
            'delhi': 'DEL',
            'new delhi': 'DEL',
            'bangalore': 'BLR',
            'bengaluru': 'BLR',
            'chennai': 'MAA',
            'kolkata': 'CCU',
            'hyderabad': 'HYD',
            'goa': 'GOI',
            'jaipur': 'JAI',
            'ahmedabad': 'AMD',
            'pune': 'PNQ',
            
            // Europe
            'london': 'LON',
            'paris': 'PAR',
            'rome': 'ROM',
            'barcelona': 'BCN',
            'amsterdam': 'AMS',
            'berlin': 'BER',
            'istanbul': 'IST',
            'switzerland': 'ZRH',
            'swiss alps': 'ZRH',
            'zurich': 'ZRH',
            'vienna': 'VIE',
            'prague': 'PRG',
            'madrid': 'MAD',
            'milan': 'MXP',
            
            // Americas
            'new york': 'NYC',
            'newyork': 'NYC',
            'los angeles': 'LAX',
            'las vegas': 'LAS',
            'miami': 'MIA',
            'san francisco': 'SFO',
            'chicago': 'ORD',
            'toronto': 'YYZ',
            'vancouver': 'YVR',
            'cancun': 'CUN',
            
            // Oceania & Others
            'sydney': 'SYD',
            'melbourne': 'MEL',
            'maldives': 'MLE',
            'mauritius': 'MRU',
            'cape town': 'CPT',
            
            // Common IATA codes (pass through)
            'dxb': 'DXB',
            'lon': 'LON',
            'par': 'PAR',
            'nyc': 'NYC',
            'sin': 'SIN',
            'del': 'DEL',
            'bom': 'BOM',
            'blr': 'BLR',
            'maa': 'MAA',
            'ccu': 'CCU',
            'hyd': 'HYD',
            'goi': 'GOI',
            'jai': 'JAI',
            'tyo': 'TYO',
            'hkg': 'HKG',
            'bkk': 'BKK',
            'lax': 'LAX',
            'sfo': 'SFO',
            'mia': 'MIA',
            'ord': 'ORD',
            'syd': 'SYD',
            'mel': 'MEL'
        };

        const normalized = destination.toLowerCase().trim();
        return cityCodeMap[normalized] || destination.toUpperCase();
    }

    /**
     * Search hotels from JSON data
     */
    searchFromJson(searchTerm) {
        if (!searchTerm) {
            return this.getAllHotels();
        }

        const normalized = searchTerm.toLowerCase().trim();
        const destinations = this.fallbackData.destinations || {};

        // First, check if searchTerm matches a destination key
        if (destinations[normalized]) {
            return (destinations[normalized].hotels || []).map(hotel => ({
                ...hotel,
                destinationName: destinations[normalized].name,
                country: destinations[normalized].country
            }));
        }

        // Search across all destinations
        const results = [];
        Object.keys(destinations).forEach(destKey => {
            const dest = destinations[destKey];
            const matchesDest =
                dest.name?.toLowerCase().includes(normalized) ||
                dest.country?.toLowerCase().includes(normalized) ||
                dest.code?.toLowerCase() === normalized;

            if (matchesDest) {
                (dest.hotels || []).forEach(hotel => {
                    results.push({
                        ...hotel,
                        destinationName: dest.name,
                        country: dest.country
                    });
                });
            } else {
                // Search within hotels
                (dest.hotels || []).forEach(hotel => {
                    const matchesHotel =
                        hotel.name?.toLowerCase().includes(normalized) ||
                        hotel.location?.toLowerCase().includes(normalized);

                    if (matchesHotel) {
                        results.push({
                            ...hotel,
                            destinationName: dest.name,
                            country: dest.country
                        });
                    }
                });
            }
        });

        return results;
    }

    /**
     * Get hotel from JSON by ID
     */
    getHotelFromJsonById(hotelId) {
        const destinations = this.fallbackData.destinations || {};

        for (const destKey of Object.keys(destinations)) {
            const dest = destinations[destKey];
            const hotel = (dest.hotels || []).find(h => h.id === hotelId);
            if (hotel) {
                return {
                    ...hotel,
                    destinationName: dest.name,
                    country: dest.country,
                    destinationCode: dest.code
                };
            }
        }

        return null;
    }

    /**
     * Normalize Amadeus API hotel to match our format
     */
    normalizeApiHotel(apiHotel) {
        return {
            id: apiHotel.id || apiHotel.hotelId,
            name: apiHotel.name || 'Unknown Hotel',
            location: apiHotel.location || apiHotel.address?.cityName || '',
            description: apiHotel.description || '',
            image: apiHotel.image || apiHotel.images?.[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80',
            images: apiHotel.images || [apiHotel.image],
            rating: parseFloat(apiHotel.rating) || 4.0,
            reviews: apiHotel.reviews || 0,
            price: parseFloat(apiHotel.price) || 0,
            currency: apiHotel.currency || 'USD',
            stars: apiHotel.stars || 4,
            amenities: apiHotel.amenities || [],
            tags: apiHotel.tags || [],
            coordinates: apiHotel.geoCode || null,
            isFromApi: true
        };
    }

    /**
     * Calculate number of nights between two dates
     */
    calculateNights(checkIn, checkOut) {
        if (!checkIn || !checkOut) return 1;

        const startDate = new Date(checkIn);
        const endDate = new Date(checkOut);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays || 1;
    }
}

// Export singleton instance
const hotelService = new HotelService();
export default hotelService;
