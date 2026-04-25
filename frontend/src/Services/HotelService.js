// Hotel Service - Amadeus API with JSON fallback
// Tries Amadeus API first, falls back to hotels.json when API fails

import hotelsData from '../data/hotels.json';
import axios from 'axios';

// Detect production based on domain (more reliable than import.meta.env.PROD)
const isProduction = typeof window !== 'undefined' &&
    (window.location.hostname.includes('jetsetterss.com') ||
        window.location.hostname.includes('vercel.app'));
const API_BASE_URL = isProduction ? 'https://www.jetsetterss.com/api' : '/api';

class HotelService {
    constructor() {
        this.fallbackData = hotelsData;
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

            // Use the same URL pattern for both production and local dev
            const url = `${API_BASE_URL}/hotels/locations?keyword=${encodeURIComponent(keyword)}`;

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

        // Try to map destination name to IATA city code
        const cityCode = this.getCityCode(destination);

        // First, try our own backend API which calls Amadeus server-side (no browser → Amadeus CORS issues)
        if (cityCode) {
            try {
                console.log(`🌐 Attempting backend /hotels/search for ${cityCode}...`);

                // Use the same URL pattern for both production and local dev
                const url = `${API_BASE_URL}/hotels/search`;

                const response = await axios.get(url, {
                    params: {
                        destination: cityCode,
                        checkInDate,
                        checkOutDate,
                        adults
                    },
                    timeout: 15000
                });

                console.log('📡 Backend /hotels/search response:', response.data);

                const hotels = response.data?.data?.hotels || [];

                if (Array.isArray(hotels) && hotels.length > 0) {
                    console.log(`✅ Backend API returned ${hotels.length} hotels`);
                    // Backend already formats hotels for the frontend, so just return them
                    return hotels;
                }

                console.log('⚠️ Backend API returned no hotels, falling back to JSON data');
            } catch (error) {
                console.error('❌ Error calling backend /hotels/search:', error.response?.data || error.message);
            }
        }

        // Final fallback: local JSON catalog
        console.log(`📁 Using hotels.json fallback data for ${destination}`);
        return this.searchFromJson(destination);
    }

    /**
     * Get hotel by ID from either API or JSON
     * @param {string} hotelId - Hotel ID
     * @returns {Promise<Object|null>} - Hotel object or null
     */
    async getHotelById(hotelId, checkInDate, checkOutDate, adults = 2) {
        console.log(`🏨 HotelService: Getting hotel by ID: ${hotelId}`);

        if (!hotelId) {
            return null;
        }

        // Check if it's a JSON hotel ID (format: destination-number, but not our Amadeus prefix)
        if (hotelId.includes('-') && !hotelId.startsWith('amadeus-')) {
            const hotel = this.getHotelFromJsonById(hotelId);
            if (hotel) {
                return hotel;
            }
        }

        // Check if it's an Amadeus hotel ID (prefixed by backend)
        if (hotelId.startsWith('amadeus-')) {
            // First, try to get cached hotel data from search results (stored in sessionStorage)
            const cachedHotel = this.getCachedHotelData(hotelId);

            const rawHotelId = hotelId.replace('amadeus-', '');
            console.log(`🔍 Detected Amadeus hotel ID, fetching details for ${rawHotelId}`);

            const amadeusHotel = await this.fetchAmadeusHotelDetails(
                rawHotelId,
                checkInDate,
                checkOutDate,
                adults
            );

            if (amadeusHotel) {
                // Merge cached data (name, location, etc.) with Amadeus offers
                if (cachedHotel) {
                    return {
                        ...cachedHotel,
                        ...amadeusHotel,
                        name: cachedHotel.name || amadeusHotel.name,
                        location: cachedHotel.location || amadeusHotel.location,
                        address: cachedHotel.address || amadeusHotel.address,
                        rooms: amadeusHotel.rooms || cachedHotel.rooms
                    };
                }
                return amadeusHotel;
            }

            // If Amadeus fetch failed, use cached hotel data from search results
            if (cachedHotel) {
                console.log('✅ Using cached hotel data from search results');
                return cachedHotel;
            }
        }

        // Fallback: try to find in all JSON destinations
        return this.getHotelFromJsonById(hotelId);
    }

    /**
     * Get cached hotel data from sessionStorage (stored during search)
     */
    getCachedHotelData(hotelId) {
        try {
            const cached = sessionStorage.getItem(`hotel-${hotelId}`);
            if (cached) {
                const hotel = JSON.parse(cached);
                console.log(`📦 Found cached hotel data for ${hotelId}`);

                // Ensure it has rooms for booking
                if (!hotel.rooms || hotel.rooms.length === 0) {
                    hotel.rooms = [
                        {
                            id: `${hotelId}-standard`,
                            type: 'Standard Room',
                            beds: '1 King or 2 Twin beds',
                            size: '25-30 sqm',
                            view: 'City view',
                            amenities: ['Free WiFi', 'TV', 'Mini bar'],
                            price: parseFloat(hotel.price) || 150,
                            currency: hotel.currency || 'USD'
                        },
                        {
                            id: `${hotelId}-deluxe`,
                            type: 'Deluxe Room',
                            beds: '1 King bed',
                            size: '35-40 sqm',
                            view: 'Premium view',
                            amenities: ['Free WiFi', 'TV', 'Mini bar', 'Coffee maker'],
                            price: (parseFloat(hotel.price) || 150) + 50,
                            currency: hotel.currency || 'USD'
                        }
                    ];
                }

                return hotel;
            }
        } catch (error) {
            console.error('Error reading cached hotel data:', error);
        }
        return null;
    }

    /**
     * Fetch a single Amadeus hotel with real-time offers via backend API
     */
    async fetchAmadeusHotelDetails(rawHotelId, checkInDate, checkOutDate, adults = 2) {
        try {
            console.log(`🏨 Fetching Amadeus hotel details for ${rawHotelId}...`);

            // Use the same URL pattern for both production and local dev
            const url = `${API_BASE_URL}/hotels/offers/${encodeURIComponent(rawHotelId)}?checkInDate=${checkInDate || ''}&checkOutDate=${checkOutDate || ''}&adults=${adults}`;

            const response = await axios.get(url, { timeout: 15000 });

            if (response.data?.success && response.data?.data) {
                console.log('✅ Received Amadeus hotel offers from backend');
                return this.transformAmadeusOfferToHotelObject(response.data.data, rawHotelId);
            }

            console.warn('⚠️ Backend returned no offers, creating basic hotel object with fallback rooms');
            return this.createFallbackHotelObject(rawHotelId, checkInDate, checkOutDate);
        } catch (error) {
            console.error('❌ Failed to fetch Amadeus hotel details:', error.response?.data || error.message);
            // Return fallback hotel object instead of null
            console.log('🔄 Creating fallback hotel object due to API error');
            return this.createFallbackHotelObject(rawHotelId, checkInDate, checkOutDate);
        }
    }

    /**
     * Create a basic hotel object when Amadeus offers aren't available
     */
    createFallbackHotelObject(rawHotelId, checkInDate, checkOutDate) {
        const nights = this.calculateNights(checkInDate, checkOutDate);

        return {
            id: `amadeus-${rawHotelId}`,
            hotelId: rawHotelId,
            name: `Hotel ${rawHotelId}`,
            location: 'Location details available on booking',
            destinationName: '',
            country: '',
            description: 'This hotel is available for booking. Contact us for the latest availability and pricing.',
            image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80',
            images: [
                'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80',
                'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1600&q=80'
            ],
            rating: 4.0,
            reviews: 0,
            stars: 4,
            discount: 0,
            amenities: ['Free WiFi', 'Air Conditioning', '24-hour Front Desk', 'Room Service'],
            rooms: [
                {
                    id: `${rawHotelId}-standard`,
                    type: 'Standard Room',
                    beds: '1 King or 2 Twin beds',
                    size: '25-30 sqm',
                    view: 'City view',
                    amenities: ['Free WiFi', 'TV', 'Mini bar'],
                    price: 150,
                    currency: 'USD'
                },
                {
                    id: `${rawHotelId}-deluxe`,
                    type: 'Deluxe Room',
                    beds: '1 King bed',
                    size: '35-40 sqm',
                    view: 'City/Garden view',
                    amenities: ['Free WiFi', 'TV', 'Mini bar', 'Coffee maker'],
                    price: 200,
                    currency: 'USD'
                }
            ]
        };
    }

    /**
     * Transform Amadeus hotel offers response into our internal hotel object shape
     */
    transformAmadeusOfferToHotelObject(offerData, rawHotelId) {
        // Amadeus v3 /shopping/hotel-offers structure
        const hotel = offerData.hotel || {};
        const offers = offerData.offers || [];

        const images = [
            'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1600&q=80'
        ];

        return {
            id: `amadeus-${(hotel.hotelId || rawHotelId)}`,
            hotelId: hotel.hotelId || rawHotelId,
            name: hotel.name || 'Hotel',
            location: hotel.cityCode || hotel.address?.cityName || '',
            destinationName: hotel.address?.cityName || '',
            country: hotel.address?.countryCode || '',
            image: images[0],
            images,
            rating: 4.5,
            reviews: 0,
            discount: 0,
            amenities: ['Free WiFi', 'Air Conditioning', '24-hour Front Desk'],
            rooms: offers.map((offer) => ({
                id: offer.id,
                type: offer.room?.typeEstimated?.category || 'Standard Room',
                beds: offer.room?.typeEstimated?.beds
                    ? `${offer.room.typeEstimated.beds} bed(s)`
                    : '1 bed',
                size: offer.room?.description?.text ? '' : 'Standard size',
                view: 'City view',
                amenities: ['Free WiFi', 'Breakfast available'],
                price: parseFloat(offer.price?.total || 0),
                currency: offer.price?.currency || 'USD'
            }))
        };
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

        // Try backend API for offers
        try {
            const response = await axios.get(`${API_BASE_URL}/hotels/offers/${hotelId}`, {
                params: {
                    checkInDate,
                    checkOutDate,
                    adults
                },
                timeout: 10000
            });

            if (response.data?.success && response.data?.data?.data) {
                return response.data.data.data;
            }
        } catch (error) {
            console.warn('⚠️ Failed to get backend API offers:', error.message);
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
     * Get featured hotels based on user location
     * @param {string} location - User's current city/location
     * @param {number} count - Number of hotels to return
     * @returns {Promise<Array>} - Featured hotels for location or fallback
     */
    async getFeaturedByLocation(location, count = 4) {
        console.log(`🌟 Getting featured hotels for location: ${location}`);

        // Default to global featured if no location
        if (!location) {
            return this.getFeaturedHotels(count);
        }

        // Calculate default dates (2 weeks from now, 3 nights stay)
        const today = new Date();
        const checkIn = new Date(today);
        checkIn.setDate(today.getDate() + 14);
        const checkOut = new Date(checkIn);
        checkOut.setDate(checkIn.getDate() + 3);

        const checkInStr = checkIn.toISOString().split('T')[0];
        const checkOutStr = checkOut.toISOString().split('T')[0];

        try {
            // Search for hotels in the user's location
            const hotels = await this.searchHotels(location, checkInStr, checkOutStr, 2);

            if (hotels && hotels.length > 0) {
                console.log(`✅ Found ${hotels.length} featured hotels for ${location}`);
                // Sort by rating/price/recommendation and take top N
                // For now, let's just take the first N as they usually come sorted by relevance
                return hotels.slice(0, count);
            }
        } catch (error) {
            console.error('❌ Error fetching featured hotels by location:', error);
        }

        console.log('⚠️ No hotels found for location, falling back to global featured');
        return this.getFeaturedHotels(count);
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
            'chandigarh': 'IXC',
            'amritsar': 'ATQ',
            'ludhiana': 'LUH',
            'punjab': 'IXC',

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
