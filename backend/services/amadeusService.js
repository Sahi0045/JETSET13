import axios from 'axios';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

class AmadeusService {
  constructor() {
    // Use TEST API endpoints with test credentials
    this.baseUrls = {
      v1: 'https://test.api.amadeus.com/v1',
      v2: 'https://test.api.amadeus.com/v2',
      v3: 'https://test.api.amadeus.com/v3'
    };
    this.token = null;
    this.tokenExpiration = null;
  }

  async getAccessToken() {
    // Check if we have a valid token
    if (this.token && this.tokenExpiration && new Date() < this.tokenExpiration) {
      return this.token;
    }

    try {
      // Use updated API keys for Amadeus
      // Try three different sources to find valid credentials
      let apiKey = process.env.AMADEUS_API_KEY || process.env.REACT_APP_AMADEUS_API_KEY;
      let apiSecret = process.env.AMADEUS_API_SECRET || process.env.REACT_APP_AMADEUS_API_SECRET;

      // Log which keys we're going to use
      console.log('Amadeus API credentials being used:', {
        keySource: process.env.AMADEUS_API_KEY ? 'AMADEUS_API_KEY' :
          (process.env.REACT_APP_AMADEUS_API_KEY ? 'REACT_APP_AMADEUS_API_KEY' : 'none'),
        secretSource: process.env.AMADEUS_API_SECRET ? 'AMADEUS_API_SECRET' :
          (process.env.REACT_APP_AMADEUS_API_SECRET ? 'REACT_APP_AMADEUS_API_SECRET' : 'none'),
        keyFirstChars: apiKey ? apiKey.substring(0, 5) + '...' : 'undefined',
        secretLength: apiSecret ? apiSecret.length : 0
      });

      // Check if credentials are available
      if (!apiKey || !apiSecret) {
        console.error('ERROR: Missing Amadeus API credentials in environment variables');
        throw new Error('Missing Amadeus API credentials');
      }

      // Use URLSearchParams for proper encoding
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', apiKey);
      params.append('client_secret', apiSecret);

      console.log('Attempting Amadeus authentication with credentials...');

      const response = await axios.post(
        `${this.baseUrls.v1}/security/oauth2/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.token = response.data.access_token;
      // Set token expiration to 29 minutes from now (tokens typically expire in 30 minutes)
      this.tokenExpiration = new Date(Date.now() + 29 * 60 * 1000);

      console.log('✅ Successfully obtained Amadeus token');
      return this.token;
    } catch (error) {
      console.error('❌ Error getting Amadeus access token:', error.response?.data || error.message);
      if (error.response?.data) {
        console.error('Detailed error information:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  // ===== FLIGHT SEARCH METHODS =====

  async searchFlights(params) {
    try {
      const token = await this.getAccessToken();

      console.log('🔍 Searching flights with params:', params);

      // Prepare search parameters for Amadeus API
      const searchParams = {
        originLocationCode: params.from || params.originLocationCode,
        destinationLocationCode: params.to || params.destinationLocationCode,
        departureDate: params.departDate || params.departureDate,
        adults: parseInt(params.travelers || params.adults) || 1,
        max: parseInt(params.max) || 10,
        currencyCode: params.currency || 'USD'
      };

      // Add return date for round trip
      if (params.returnDate && params.returnDate.trim() !== '') {
        searchParams.returnDate = params.returnDate;
      }

      // Add cabin class if specified
      if (params.travelClass) {
        searchParams.travelClass = params.travelClass;
      }

      console.log('Amadeus flight search parameters:', searchParams);

      const response = await axios.get(`${this.baseUrls.v2}/shopping/flight-offers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.amadeus+json'
        },
        params: searchParams
      });

      console.log(`✅ Found ${response.data.data?.length || 0} flight offers`);

      return {
        success: true,
        data: response.data.data || [],
        meta: response.data.meta,
        dictionaries: response.data.dictionaries
      };

    } catch (error) {
      console.error('❌ Flight search error:', error.response?.data || error.message);
      throw {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        code: error.response?.status || 500
      };
    }
  }

  // ===== FLIGHT BOOKING METHODS =====

  async createFlightOrder(flightOrderData) {
    try {
      const token = await this.getAccessToken();

      console.log('📋 Creating REAL flight order with Amadeus API...');
      console.log('Flight Order Data:', JSON.stringify(flightOrderData, null, 2));

      const response = await axios.post(
        `${this.baseUrls.v1}/booking/flight-orders`,
        flightOrderData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/vnd.amadeus+json',
            'Accept': 'application/vnd.amadeus+json'
          },
          timeout: 30000
        }
      );

      console.log('✅ REAL flight order created successfully via Amadeus API');

      return {
        success: true,
        data: response.data.data,
        pnr: response.data.data?.associatedRecords?.[0]?.reference,
        orderData: response.data,
        mode: 'LIVE_AMADEUS_BOOKING',
        message: 'Real booking created with actual PNR'
      };

    } catch (error) {
      console.log('⚠️ Real Amadeus booking failed, generating mock PNR for testing...');

      // Check if this is a test environment limitation
      const errorCode = error.response?.data?.errors?.[0]?.code;
      if (errorCode === '38187' || errorCode === '38190' || error.response?.status === 401) {
        console.log('🧪 Using mock PNR generation for testing purposes');

        const mockPNR = this.generateMockPNR();
        const travelers = flightOrderData.data?.travelers?.length || 1;
        const mockOrderData = this.generateMockOrderData(mockPNR, travelers);

        // Store the mock order
        this.storeMockOrder(mockOrderData.id, mockOrderData, mockPNR);

        console.log(`✅ Mock booking created with PNR: ${mockPNR}`);

        return {
          success: true,
          data: mockOrderData,
          pnr: mockPNR,
          orderId: mockOrderData.id,
          orderData: { data: mockOrderData },
          mode: 'MOCK_TESTING_PNR',
          message: 'Mock booking created for testing - use production keys for real PNRs'
        };
      }

      console.error('❌ Flight order creation failed:', error.response?.data || error.message);
      throw {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        code: error.response?.status || 500
      };
    }
  }

  async getFlightOrderDetails(orderId) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(
        `${this.baseUrls.v1}/booking/flight-orders/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.amadeus+json'
          }
        }
      );

      return {
        success: true,
        data: response.data.data,
        pnr: response.data.data?.associatedRecords?.[0]?.reference
      };

    } catch (error) {
      console.log('⚠️ Real order retrieval failed, checking mock storage...');

      // Check if this is a mock order
      const mockOrder = this.getMockOrder(orderId);
      if (mockOrder) {
        console.log(`✅ Mock order found: ${orderId}`);
        return {
          success: true,
          data: mockOrder,
          pnr: mockOrder.pnr,
          mode: 'MOCK_STORAGE'
        };
      }

      console.error('❌ Error fetching flight order details:', error.response?.data || error.message);
      throw {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        code: error.response?.status || 500
      };
    }
  }

  // ===== FLIGHT PRICING AND CONFIRMATION =====

  async priceFlightOffer(flightOffer) {
    try {
      const token = await this.getAccessToken();

      console.log('💰 Pricing flight offer...');

      const response = await axios.post(
        `${this.baseUrls.v1}/shopping/flight-offers/pricing`,
        {
          data: {
            type: 'flight-offers-pricing',
            flightOffers: [flightOffer]
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/vnd.amadeus+json',
            'Accept': 'application/vnd.amadeus+json'
          }
        }
      );

      console.log('✅ Flight offer priced successfully');

      return {
        success: true,
        data: response.data.data
      };

    } catch (error) {
      console.error('❌ Flight pricing error:', error.response?.data || error.message);
      throw {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        code: error.response?.status || 500
      };
    }
  }

  /**
   * Search for cities/locations using Amadeus Airport & City Search API
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/airport-and-city-search
   * 
   * @param {string} keyword - Search keyword (city name, airport code, etc.)
   * @param {string} subType - Type of location: CITY, AIRPORT, or both
   * @param {Object} options - Additional options
   * @param {string} options.countryCode - ISO 3166-1 alpha-2 country code (e.g., US, IN)
   * @param {number} options.limit - Maximum results (default: 10)
   * @param {string} options.sort - Sort order: analytics.travelers.score (default)
   * @returns {Promise<Object>} - List of matching locations
   */
  async searchLocations(keyword, subType = 'CITY,AIRPORT', options = {}) {
    try {
      const token = await this.getAccessToken();

      console.log(`🔍 Searching locations for keyword: ${keyword}`, options);

      // Build query parameters per Amadeus API spec
      const params = {
        keyword: keyword,
        subType: subType,
        'page[limit]': options.limit || 10,
        view: 'LIGHT', // LIGHT for autocomplete, FULL for detailed
        sort: options.sort || 'analytics.travelers.score' // Sort by traveler popularity
      };

      // Add countryCode filter if provided
      if (options.countryCode) {
        params.countryCode = options.countryCode;
      }

      const response = await axios.get(`${this.baseUrls.v1}/reference-data/locations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: params
      });

      const locations = response.data.data || [];
      console.log(`✅ Found ${locations.length} locations for "${keyword}"`);

      // Format locations for frontend with full details
      const formattedLocations = locations.map(loc => ({
        // Core fields matching airports.js format
        name: loc.name || loc.address?.cityName || keyword,
        code: loc.iataCode,
        type: loc.subType,
        // Extended fields from Amadeus
        cityName: loc.address?.cityName || loc.name,
        cityCode: loc.address?.cityCode || loc.iataCode,
        country: loc.address?.countryName || loc.address?.countryCode || '',
        countryCode: loc.address?.countryCode || '',
        // Analytics score for ranking
        score: loc.analytics?.travelers?.score || 0,
        // Geographic data
        geoCode: loc.geoCode ? {
          latitude: loc.geoCode.latitude,
          longitude: loc.geoCode.longitude
        } : null,
        // For display
        displayName: `${loc.name || loc.address?.cityName}${loc.address?.countryName ? ', ' + loc.address.countryName : ''}`
      }));

      return {
        success: true,
        data: formattedLocations,
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Error searching locations:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        data: []
      };
    }
  }

  async getAirportsByCity(cityCode) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(`${this.baseUrls.v1}/reference-data/locations/airports`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          keyword: cityCode,
          'page[limit]': 10
        }
      });

      return {
        success: true,
        data: response.data.data || []
      };

    } catch (error) {
      console.error('❌ Error fetching airports:', error.response?.data || error.message);
      throw {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message
      };
    }
  }

  async getAirlineCodes() {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(`${this.baseUrls.v1}/reference-data/airlines`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          'page[limit]': 100
        }
      });

      return {
        success: true,
        data: response.data.data || []
      };

    } catch (error) {
      console.error('❌ Error fetching airline codes:', error.response?.data || error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== FLIGHT ANALYTICS APIs =====

  /**
   * Get Most Booked Destinations from a given origin
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-most-booked-destinations
   * @param {string} origin - IATA city code (e.g., "NYC", "DEL")
   * @param {string} period - Time period (e.g., "2024-01" for January 2024)
   * @returns {Promise<Object>} - List of most booked destinations
   */
  async getMostBookedDestinations(origin, period) {
    try {
      const token = await this.getAccessToken();

      console.log(`📊 Fetching most booked destinations from ${origin} for ${period}`);

      const response = await axios.get(`${this.baseUrls.v1}/travel/analytics/air-traffic/booked`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          originCityCode: origin,
          period: period || this.getDefaultPeriod(),
          max: 10,
          sort: 'analytics.flights.score'
        },
        timeout: 8000
      });

      const destinations = response.data.data || [];
      console.log(`✅ Found ${destinations.length} most booked destinations from ${origin}`);

      return {
        success: true,
        data: destinations.map(d => ({
          destination: d.destination,
          flightScore: d.analytics?.flights?.score || 0,
          travelerScore: d.analytics?.travelers?.score || 0
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Error fetching most booked destinations:', error.response?.data || error.message);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get Most Traveled Destinations from a given origin
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-most-traveled-destinations
   */
  async getMostTraveledDestinations(origin, period) {
    try {
      const token = await this.getAccessToken();

      console.log(`📊 Fetching most traveled destinations from ${origin}`);

      const response = await axios.get(`${this.baseUrls.v1}/travel/analytics/air-traffic/traveled`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          originCityCode: origin,
          period: period || this.getDefaultPeriod(),
          max: 10,
          sort: 'analytics.travelers.score'
        }
      });

      const destinations = response.data.data || [];
      console.log(`✅ Found ${destinations.length} most traveled destinations`);

      return {
        success: true,
        data: destinations.map(d => ({
          destination: d.destination,
          travelerScore: d.analytics?.travelers?.score || 0
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Error fetching most traveled destinations:', error.response?.data || error.message);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get Cheapest Flight Dates between two cities
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-cheapest-date-search
   */
  async getCheapestFlightDates(origin, destination, options = {}) {
    try {
      const token = await this.getAccessToken();

      console.log(`💰 Searching cheapest dates: ${origin} → ${destination}`);

      const response = await axios.get(`${this.baseUrls.v1}/shopping/flight-dates`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          origin: origin,
          destination: destination,
          departureDate: options.departureDate, // Optional: specific date range
          oneWay: options.oneWay || false,
          duration: options.duration, // Optional: trip duration in days
          nonStop: options.nonStop || false,
          viewBy: options.viewBy || 'DATE' // DATE, DURATION, or WEEK
        },
        timeout: 8000
      });

      const dates = response.data.data || [];
      console.log(`✅ Found ${dates.length} date options`);

      return {
        success: true,
        data: dates.map(d => ({
          departureDate: d.departureDate,
          returnDate: d.returnDate,
          price: {
            total: d.price?.total,
            currency: response.data.dictionaries?.currencies ?
              Object.keys(response.data.dictionaries.currencies)[0] : 'USD'
          },
          links: d.links
        })),
        dictionaries: response.data.dictionaries,
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Error fetching cheapest dates:', error.response?.data || error.message);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get On-Demand Flight Status
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/on-demand-flight-status
   */
  async getFlightStatus(carrierCode, flightNumber, scheduledDate) {
    try {
      const token = await this.getAccessToken();

      console.log(`✈️ Getting status for ${carrierCode}${flightNumber} on ${scheduledDate}`);

      const response = await axios.get(`${this.baseUrls.v2}/schedule/flights`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          carrierCode: carrierCode,
          flightNumber: flightNumber,
          scheduledDepartureDate: scheduledDate
        }
      });

      const flights = response.data.data || [];
      console.log(`✅ Found ${flights.length} flight status records`);

      return {
        success: true,
        data: flights.map(f => ({
          flightNumber: `${f.flightDesignator?.carrierCode}${f.flightDesignator?.flightNumber}`,
          departure: {
            airport: f.flightPoints?.[0]?.iataCode,
            scheduledTime: f.flightPoints?.[0]?.departure?.timings?.[0]?.value,
            terminal: f.flightPoints?.[0]?.departure?.terminal?.code
          },
          arrival: {
            airport: f.flightPoints?.[1]?.iataCode,
            scheduledTime: f.flightPoints?.[1]?.arrival?.timings?.[0]?.value,
            terminal: f.flightPoints?.[1]?.arrival?.terminal?.code
          },
          aircraft: f.legs?.[0]?.aircraftEquipment?.aircraftType,
          duration: f.segments?.[0]?.scheduledSegmentDuration
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Error fetching flight status:', error.response?.data || error.message);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get Flight Availabilities (seat inventory)
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-availabilities-search
   */
  async getFlightAvailabilities(params) {
    try {
      const token = await this.getAccessToken();

      console.log(`🎫 Searching flight availabilities: ${params.origin} → ${params.destination}`);

      const requestBody = {
        originDestinations: [{
          id: '1',
          originLocationCode: params.origin,
          destinationLocationCode: params.destination,
          departureDateTime: { date: params.departureDate }
        }],
        travelers: [{ id: '1', travelerType: 'ADULT' }],
        sources: ['GDS']
      };

      const response = await axios.post(
        `${this.baseUrls.v1}/shopping/availability/flight-availabilities`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const availabilities = response.data.data || [];
      console.log(`✅ Found ${availabilities.length} flight availabilities`);

      return {
        success: true,
        data: availabilities,
        dictionaries: response.data.dictionaries,
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Error fetching flight availabilities:', error.response?.data || error.message);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get Busiest Traveling Period for a city
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-busiest-traveling-period
   */
  async getBusiestTravelPeriod(origin, year, direction = 'ARRIVING') {
    try {
      const token = await this.getAccessToken();

      console.log(`📈 Fetching busiest travel period for ${origin} in ${year}`);

      const response = await axios.get(`${this.baseUrls.v1}/travel/analytics/air-traffic/busiest-period`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          cityCode: origin,
          period: year || new Date().getFullYear().toString(),
          direction: direction // ARRIVING or DEPARTING
        }
      });

      const periods = response.data.data || [];
      console.log(`✅ Found ${periods.length} busiest periods`);

      return {
        success: true,
        data: periods.map(p => ({
          period: p.period,
          travelerScore: p.analytics?.travelers?.score || 0
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Error fetching busiest travel period:', error.response?.data || error.message);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Get default period for analytics (previous month)
   */
  getDefaultPeriod() {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // Filter out test properties and prioritize real hotels
  prioritizeHotels(hotels, limit = 20) {
    if (!hotels || hotels.length === 0) return [];

    // Define priority scoring function
    const getPriority = (hotel) => {
      const name = hotel.name?.toUpperCase() || '';

      // Skip likely test properties
      if (name.includes('TEST PROPERTY') || name.includes('TEST HOTEL') || name.includes('SYNSIX')) {
        return -1;
      }

      let score = 0;

      // Prioritize actual hotels
      if (name.includes('HOTEL')) score += 3;
      if (name.includes('HILTON') || name.includes('MARRIOTT') || name.includes('HYATT')) score += 5;

      return score;
    };

    // Score, filter and sort hotels
    return hotels
      .map(hotel => ({ ...hotel, priority: getPriority(hotel) }))
      .filter(hotel => hotel.priority >= 0)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  async searchHotels(params) {
    try {
      const token = await this.getAccessToken();

      // First, get hotels in the city using v1 endpoint
      const hotelListResponse = await axios.get(`${this.baseUrls.v1}/reference-data/locations/hotels/by-city`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          cityCode: params.cityCode,
          radius: params.radius || 20,
          radiusUnit: 'KM',
          hotelSource: 'ALL'
        }
      });

      console.log(`Found ${hotelListResponse.data.data?.length || 0} hotels in ${params.cityCode}`);

      // If no hotels found, return empty results
      if (!hotelListResponse.data.data || hotelListResponse.data.data.length === 0) {
        return { data: [] };
      }

      // SKIP availability check for test environment to show all hotels
      // Most test hotel IDs don't support availability checks, so we just return the hotel list
      console.log(`Returning all ${hotelListResponse.data.data.length} hotels without availability check (test environment)`);
      return hotelListResponse.data;
    } catch (error) {
      console.error('❌ Hotel search error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getHotelDetails(hotelId) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(`${this.baseUrls.v2}/shopping/hotel-offers/by-hotel`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          hotelId: hotelId,
          checkInDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
          checkOutDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Day after tomorrow
          adults: 2,
          roomQuantity: 1,
          currency: 'USD'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting hotel details:', error.response?.data || error.message);
      throw error;
    }
  }

  async getHotelAvailability(hotelId, checkInDate, checkOutDate, adults) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(`${this.baseUrls.v3}/shopping/hotel-offers`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          hotelIds: hotelId,
          checkInDate: checkInDate,
          checkOutDate: checkOutDate,
          adults: adults || 2,
          roomQuantity: 1,
          currency: 'USD',
          bestRateOnly: true
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting hotel availability:', error.response?.data || error.message);
      throw error;
    }
  }

  async bookHotel(offerId, guests, payments) {
    try {
      const token = await this.getAccessToken();

      const bookingData = {
        data: {
          type: "hotel-booking",
          hotelOffer: {
            offerId: offerId
          },
          guests: guests,
          payments: payments
        }
      };

      const response = await axios.post(`${this.baseUrls.v1}/booking/hotel-bookings`, bookingData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/vnd.amadeus+json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error booking hotel:', error.response?.data || error.message);
      throw error;
    }
  }

  // ===== FLIGHT PRICE ANALYSIS API =====

  /**
   * Get Flight Price Analysis - Historical price metrics for a flight itinerary
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-price-analysis
   * Endpoint: GET /v1/analytics/itinerary-price-metrics
   * 
   * @param {string} originIataCode - IATA code of origin (e.g., "MAD")
   * @param {string} destinationIataCode - IATA code of destination (e.g., "CDG")
   * @param {string} departureDate - Departure date (YYYY-MM-DD)
   * @param {Object} options - Additional options
   * @param {string} options.currencyCode - ISO 4217 currency code (default: USD)
   * @param {boolean} options.oneWay - If true, only one-way prices (default: false)
   * @returns {Promise<Object>} - Price metrics with quartile distribution
   */
  async getFlightPriceAnalysis(originIataCode, destinationIataCode, departureDate, options = {}) {
    try {
      const token = await this.getAccessToken();

      console.log(`📊 Flight Price Analysis: ${originIataCode} → ${destinationIataCode} on ${departureDate}`);

      const params = {
        originIataCode,
        destinationIataCode,
        departureDate,
        currencyCode: options.currencyCode || 'USD',
        oneWay: options.oneWay || false
      };

      const response = await axios.get(`${this.baseUrls.v1}/analytics/itinerary-price-metrics`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params,
        timeout: 10000
      });

      const priceMetrics = response.data.data || [];
      console.log(`✅ Found ${priceMetrics.length} price metric results`);

      return {
        success: true,
        data: priceMetrics.map(metric => ({
          type: metric.type,
          origin: metric.origin?.iataCode,
          destination: metric.destination?.iataCode,
          departureDate: metric.departureDate,
          returnDate: metric.returnDate,
          currencyCode: metric.currencyCode,
          oneWay: metric.oneWay,
          priceMetrics: metric.priceMetrics ? metric.priceMetrics.map(pm => ({
            amount: pm.amount,
            quartileRanking: pm.quartileRanking // MINIMUM, FIRST, MEDIUM, THIRD, MAXIMUM
          })) : []
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Flight Price Analysis error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  // ===== FLIGHT INSPIRATION SEARCH API =====

  /**
   * Flight Inspiration Search - Find cheapest destinations from an origin
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-inspiration-search
   * Endpoint: GET /v1/shopping/flight-destinations
   *
   * @param {string} origin - IATA city/airport code (e.g., "MAD")
   * @param {Object} options - Additional options
   * @param {string} options.departureDate - Departure date (YYYY-MM-DD)
   * @param {boolean} options.oneWay - One-way flight (default: false)
   * @param {string} options.duration - Trip duration range (e.g., "1,15")
   * @param {boolean} options.nonStop - Direct flights only (default: false)
   * @param {number} options.maxPrice - Maximum price
   * @param {string} options.viewBy - Aggregation: DATE, DESTINATION, DURATION, WEEK
   * @returns {Promise<Object>} - List of cheapest flight destinations
   */
  async getFlightInspirationSearch(origin, options = {}) {
    try {
      const token = await this.getAccessToken();

      console.log(`💡 Flight Inspiration Search from: ${origin}`);

      const params = {
        origin,
        ...(options.departureDate && { departureDate: options.departureDate }),
        ...(options.oneWay !== undefined && { oneWay: options.oneWay }),
        ...(options.duration && { duration: options.duration }),
        ...(options.nonStop !== undefined && { nonStop: options.nonStop }),
        ...(options.maxPrice && { maxPrice: options.maxPrice }),
        viewBy: options.viewBy || 'DESTINATION'
      };

      const response = await axios.get(`${this.baseUrls.v1}/shopping/flight-destinations`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params,
        timeout: 10000
      });

      const destinations = response.data.data || [];
      console.log(`✅ Found ${destinations.length} inspiration destinations`);

      return {
        success: true,
        data: destinations.map(d => ({
          type: d.type,
          origin: d.origin,
          destination: d.destination,
          departureDate: d.departureDate,
          returnDate: d.returnDate,
          price: {
            total: d.price?.total,
            currency: response.data.dictionaries?.currencies
              ? Object.keys(response.data.dictionaries.currencies)[0] : 'USD'
          },
          links: d.links
        })),
        dictionaries: response.data.dictionaries,
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Flight Inspiration Search error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  // ===== HOTEL NAME AUTOCOMPLETE API =====

  /**
   * Hotel Name Autocomplete - Search hotels by name keyword
   * @see https://developers.amadeus.com/self-service/category/hotels/api-doc/hotel-name-autocomplete
   * Endpoint: GET /v1/reference-data/locations/hotel
   *
   * @param {string} keyword - Hotel name keyword (4-40 characters)
   * @param {Object} options - Additional options
   * @param {string} options.subType - HOTEL_LEISURE or HOTEL_GDS (default: HOTEL_LEISURE)
   * @param {number} options.max - Maximum results (default: 20, max: 20)
   * @param {string} options.lang - Language code (default: EN)
   * @param {string} options.countryCode - ISO 3166 country code filter
   * @returns {Promise<Object>} - List of matching hotels with IDs and details
   */
  async searchHotelsByName(keyword, options = {}) {
    try {
      const token = await this.getAccessToken();

      if (!keyword || keyword.length < 4) {
        return { success: false, error: 'Keyword must be at least 4 characters', data: [] };
      }

      console.log(`🔍 Hotel Name Autocomplete: "${keyword}"`);

      const params = {
        keyword: keyword,
        subType: options.subType || 'HOTEL_LEISURE',
        max: Math.min(options.max || 20, 20),
        lang: options.lang || 'EN'
      };

      if (options.countryCode) {
        params.countryCode = options.countryCode;
      }

      const response = await axios.get(`${this.baseUrls.v1}/reference-data/locations/hotel`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params,
        timeout: 10000
      });

      const hotels = response.data.data || [];
      console.log(`✅ Found ${hotels.length} hotel name matches for "${keyword}"`);

      return {
        success: true,
        data: hotels.map(hotel => ({
          id: hotel.id,
          name: hotel.name,
          hotelIds: hotel.hotelIds || [],
          iataCode: hotel.iataCode,
          subType: hotel.subType,
          relevance: hotel.relevance,
          type: hotel.type,
          address: {
            cityName: hotel.address?.cityName,
            countryCode: hotel.address?.countryCode
          },
          geoCode: hotel.geoCode ? {
            latitude: hotel.geoCode.latitude,
            longitude: hotel.geoCode.longitude
          } : null,
          // For display
          displayName: `${hotel.name}${hotel.address?.cityName ? ', ' + hotel.address.cityName : ''}`
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Hotel Name Autocomplete error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  // ===== HOTEL RATINGS (E-REPUTATION) API =====

  /**
   * Hotel Ratings - Sentiment analysis for hotels based on reviews
   * @see https://developers.amadeus.com/self-service/category/hotels/api-doc/hotel-ratings
   * Endpoint: GET /v2/e-reputation/hotel-sentiments
   *
   * @param {string|string[]} hotelIds - Amadeus hotel ID(s), comma-separated string or array
   * @returns {Promise<Object>} - Hotel sentiment scores across multiple categories
   */
  async getHotelRatings(hotelIds) {
    try {
      const token = await this.getAccessToken();

      // Accept array or comma-separated string
      const ids = Array.isArray(hotelIds) ? hotelIds.join(',') : hotelIds;

      if (!ids || ids.length === 0) {
        return { success: false, error: 'At least one hotel ID is required', data: [] };
      }

      console.log(`⭐ Hotel Ratings for: ${ids}`);

      const response = await axios.get(`${this.baseUrls.v2}/e-reputation/hotel-sentiments`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: { hotelIds: ids },
        timeout: 10000
      });

      const sentiments = response.data.data || [];
      console.log(`✅ Found ratings for ${sentiments.length} hotels`);

      return {
        success: true,
        data: sentiments.map(s => ({
          hotelId: s.hotelId,
          type: s.type,
          overallRating: s.overallRating,
          numberOfReviews: s.numberOfReviews,
          numberOfRatings: s.numberOfRatings,
          sentiments: {
            sleepQuality: s.sentiments?.sleepQuality,
            service: s.sentiments?.service,
            facilities: s.sentiments?.facilities,
            roomComforts: s.sentiments?.roomComforts,
            valueForMoney: s.sentiments?.valueForMoney,
            catering: s.sentiments?.catering,
            location: s.sentiments?.location,
            pointsOfInterest: s.sentiments?.pointsOfInterest,
            staff: s.sentiments?.staff,
            swimmingPool: s.sentiments?.swimmingPool,
            internet: s.sentiments?.internet
          }
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Hotel Ratings error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  // ===== HOTEL SEARCH API (Enhanced) =====

  /**
   * Hotel Search - Search hotel offers with full parameter support
   * @see https://developers.amadeus.com/self-service/category/hotels/api-doc/hotel-search
   * Endpoint: GET /v3/shopping/hotel-offers
   *
   * @param {Object} params - Search parameters
   * @param {string} params.hotelIds - Comma-separated Amadeus hotel IDs (required)
   * @param {number} params.adults - Number of adults (1-9, default: 1)
   * @param {string} params.checkInDate - Check-in date (YYYY-MM-DD)
   * @param {string} params.checkOutDate - Check-out date (YYYY-MM-DD)
   * @param {string} params.countryOfResidence - ISO 3166 country code
   * @param {number} params.roomQuantity - Number of rooms (1-9, default: 1)
   * @param {string} params.priceRange - Price range (e.g., "100-300")
   * @param {string} params.currency - ISO 4217 currency code
   * @param {string} params.paymentPolicy - NONE, GUARANTEE, DEPOSIT
   * @param {string} params.boardType - ROOM_ONLY, BREAKFAST, HALF_BOARD, FULL_BOARD, ALL_INCLUSIVE
   * @param {boolean} params.bestRateOnly - Return only the best rate (default: true)
   * @param {string} params.lang - Language (ISO 639-1, default: EN)
   * @returns {Promise<Object>} - Hotel offers with rooms & prices
   */
  async searchHotelOffers(params) {
    try {
      const token = await this.getAccessToken();

      if (!params.hotelIds) {
        return { success: false, error: 'hotelIds parameter is required', data: [] };
      }

      console.log(`🏨 Hotel Search (offers): ${params.hotelIds}`);

      const queryParams = {
        hotelIds: params.hotelIds,
        adults: params.adults || 1,
        roomQuantity: params.roomQuantity || 1,
        bestRateOnly: params.bestRateOnly !== undefined ? params.bestRateOnly : true,
        currency: params.currency || 'USD'
      };

      // Add optional date params
      if (params.checkInDate) queryParams.checkInDate = params.checkInDate;
      if (params.checkOutDate) queryParams.checkOutDate = params.checkOutDate;
      if (params.countryOfResidence) queryParams.countryOfResidence = params.countryOfResidence;
      if (params.priceRange) queryParams.priceRange = params.priceRange;
      if (params.paymentPolicy) queryParams.paymentPolicy = params.paymentPolicy;
      if (params.boardType) queryParams.boardType = params.boardType;
      if (params.lang) queryParams.lang = params.lang;

      const response = await axios.get(`${this.baseUrls.v3}/shopping/hotel-offers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.amadeus+json'
        },
        params: queryParams,
        timeout: 15000
      });

      const offers = response.data.data || [];
      console.log(`✅ Found offers for ${offers.length} hotels`);

      return {
        success: true,
        data: offers.map(hotel => ({
          type: hotel.type,
          hotelId: hotel.hotel?.hotelId,
          name: hotel.hotel?.name,
          cityCode: hotel.hotel?.cityCode,
          chainCode: hotel.hotel?.chainCode,
          latitude: hotel.hotel?.latitude,
          longitude: hotel.hotel?.longitude,
          offers: (hotel.offers || []).map(offer => ({
            id: offer.id,
            checkInDate: offer.checkInDate,
            checkOutDate: offer.checkOutDate,
            rateCode: offer.rateCode,
            rateFamilyEstimated: offer.rateFamilyEstimated,
            room: {
              type: offer.room?.type,
              typeEstimated: offer.room?.typeEstimated,
              description: offer.room?.description
            },
            guests: offer.guests,
            price: {
              currency: offer.price?.currency,
              base: offer.price?.base,
              total: offer.price?.total,
              taxes: offer.price?.taxes,
              variations: offer.price?.variations
            },
            policies: {
              paymentType: offer.policies?.paymentType,
              cancellation: offer.policies?.cancellation
            },
            self: offer.self
          }))
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Hotel Search (offers) error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  // ===== HOTEL BOOKING API (v2) =====

  /**
   * Hotel Booking - Create a hotel order (v2)
   * @see https://developers.amadeus.com/self-service/category/hotels/api-doc/hotel-booking
   * Endpoint: POST /v2/booking/hotel-orders
   *
   * @param {Object} bookingData - Booking data
   * @param {string} bookingData.offerId - The hotel offer ID from search results
   * @param {Array} bookingData.guests - Guest information
   * @param {Object} bookingData.payments - Payment information
   * @param {string} bookingData.remarks - Special requests/remarks
   * @returns {Promise<Object>} - Booking confirmation with order ID
   */
  async bookHotelOrder(bookingData) {
    try {
      const token = await this.getAccessToken();

      console.log(`📝 Hotel Booking: Creating order for offer ${bookingData.offerId}`);

      const requestBody = {
        data: {
          type: 'hotel-order',
          guests: (bookingData.guests || []).map((guest, idx) => ({
            tid: idx + 1,
            name: {
              title: guest.title || 'MR',
              firstName: guest.firstName,
              lastName: guest.lastName
            },
            contact: {
              phone: guest.phone || '1234567890',
              email: guest.email || 'guest@example.com'
            }
          })),
          travelAgent: bookingData.travelAgent || {
            contact: {
              email: 'bookings@jetsetters.com'
            }
          },
          roomAssociations: [{
            guestReferences: (bookingData.guests || [{ tid: 1 }]).map((_, idx) => ({
              guestReference: `${idx + 1}`
            })),
            hotelOfferId: bookingData.offerId
          }],
          payment: {
            id: 1,
            method: bookingData.payments?.method || 'CREDIT_CARD',
            paymentCard: bookingData.payments?.card ? {
              paymentCardInfo: {
                vendorCode: bookingData.payments.card.vendorCode || 'VI',
                cardNumber: bookingData.payments.card.cardNumber,
                expiryDate: bookingData.payments.card.expiryDate,
                holderName: bookingData.payments.card.holderName
              }
            } : undefined
          },
          remarks: bookingData.remarks ? {
            general: [{
              subType: 'GENERAL_MISCELLANEOUS',
              text: bookingData.remarks
            }]
          } : undefined
        }
      };

      const response = await axios.post(`${this.baseUrls.v2}/booking/hotel-orders`, requestBody, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/vnd.amadeus+json',
          'Accept': 'application/vnd.amadeus+json'
        },
        timeout: 30000
      });

      console.log('✅ Hotel order created successfully');

      return {
        success: true,
        data: response.data.data,
        orderId: response.data.data?.id,
        bookingStatus: response.data.data?.hotelBookings?.[0]?.bookingStatus,
        associatedRecords: response.data.data?.associatedRecords
      };

    } catch (error) {
      console.error('❌ Hotel Booking error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        data: null,
        errorCode: error.response?.data?.errors?.[0]?.code
      };
    }
  }

  // ===== LOCATION SCORE API =====

  /**
   * Location Score - Get safety and category scores for a location
   * @see https://developers.amadeus.com/self-service/category/destination-experiences/api-doc/location-score
   * Endpoint: GET /v1/location/analytics/category-rated-areas
   *
   * @param {number} latitude - Latitude of the location
   * @param {number} longitude - Longitude of the location
   * @param {Object} options - Additional options
   * @param {number} options.radius - Search radius in KM (default: 1, max: 20)
   * @returns {Promise<Object>} - Location scores for various categories
   */
  async getLocationScore(latitude, longitude, options = {}) {
    try {
      const token = await this.getAccessToken();

      if (!latitude || !longitude) {
        return { success: false, error: 'Latitude and longitude are required', data: [] };
      }

      console.log(`📍 Location Score: lat=${latitude}, lng=${longitude}`);

      const params = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: Math.min(options.radius || 1, 20)
      };

      const response = await axios.get(`${this.baseUrls.v1}/location/analytics/category-rated-areas`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params,
        timeout: 10000
      });

      const areas = response.data.data || [];
      console.log(`✅ Found ${areas.length} location score areas`);

      return {
        success: true,
        data: areas.map(area => ({
          type: area.type,
          geoCode: area.geoCode,
          radius: area.radius,
          categoryScores: {
            sight: area.categoryScores?.sight,
            restaurant: area.categoryScores?.restaurant,
            shopping: area.categoryScores?.shopping,
            nightLife: area.categoryScores?.nightLife,
            beach: area.categoryScores?.beach
          }
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Location Score error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  // ===== POINTS OF INTEREST API =====

  /**
   * Points of Interest - Get ranked POIs near a location
   * @see https://developers.amadeus.com/self-service/category/destination-experiences/api-doc/points-of-interest
   * Endpoint: GET /v1/reference-data/locations/pois
   *
   * @param {number} latitude - Latitude of the location
   * @param {number} longitude - Longitude of the location
   * @param {Object} options - Additional options
   * @param {number} options.radius - Search radius in KM (default: 1, max: 20)
   * @param {number} options.page_limit - Results per page (default: 10)
   * @param {number} options.page_offset - Page offset for pagination
   * @param {string[]} options.categories - Filter categories: SIGHTS, NIGHTLIFE, RESTAURANT, SHOPPING, BEACH_PARK
   * @returns {Promise<Object>} - Ranked list of POIs with scores
   */
  async getPointsOfInterest(latitude, longitude, options = {}) {
    try {
      const token = await this.getAccessToken();

      if (!latitude || !longitude) {
        return { success: false, error: 'Latitude and longitude are required', data: [] };
      }

      console.log(`📌 Points of Interest: lat=${latitude}, lng=${longitude}`);

      const params = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: Math.min(options.radius || 1, 20)
      };

      if (options.page_limit) params['page[limit]'] = options.page_limit;
      if (options.page_offset) params['page[offset]'] = options.page_offset;
      if (options.categories && options.categories.length > 0) {
        params.categories = Array.isArray(options.categories) ? options.categories.join(',') : options.categories;
      }

      const response = await axios.get(`${this.baseUrls.v1}/reference-data/locations/pois`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params,
        timeout: 10000
      });

      const pois = response.data.data || [];
      console.log(`✅ Found ${pois.length} Points of Interest`);

      return {
        success: true,
        data: pois.map(poi => ({
          id: poi.id,
          type: poi.type,
          subType: poi.subType,
          name: poi.name,
          rank: poi.rank,
          geoCode: poi.geoCode ? {
            latitude: poi.geoCode.latitude,
            longitude: poi.geoCode.longitude
          } : null,
          category: poi.category,
          tags: poi.tags || [],
          self: poi.self
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Points of Interest error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  /**
   * Points of Interest by Square - Get POIs within a geographic square area
   * Endpoint: GET /v1/reference-data/locations/pois/by-square
   *
   * @param {number} north - Northern latitude boundary
   * @param {number} west - Western longitude boundary
   * @param {number} south - Southern latitude boundary
   * @param {number} east - Eastern longitude boundary
   * @param {Object} options - Additional options
   * @param {number} options.page_limit - Results per page
   * @param {string[]} options.categories - Filter categories
   * @returns {Promise<Object>} - POIs within the square area
   */
  async getPointsOfInterestBySquare(north, west, south, east, options = {}) {
    try {
      const token = await this.getAccessToken();

      console.log(`📌 POIs by Square: N=${north} W=${west} S=${south} E=${east}`);

      const params = {
        north: parseFloat(north),
        west: parseFloat(west),
        south: parseFloat(south),
        east: parseFloat(east)
      };

      if (options.page_limit) params['page[limit]'] = options.page_limit;
      if (options.categories && options.categories.length > 0) {
        params.categories = Array.isArray(options.categories) ? options.categories.join(',') : options.categories;
      }

      const response = await axios.get(`${this.baseUrls.v1}/reference-data/locations/pois/by-square`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params,
        timeout: 10000
      });

      const pois = response.data.data || [];
      console.log(`✅ Found ${pois.length} POIs in square area`);

      return {
        success: true,
        data: pois.map(poi => ({
          id: poi.id,
          type: poi.type,
          subType: poi.subType,
          name: poi.name,
          rank: poi.rank,
          geoCode: poi.geoCode ? {
            latitude: poi.geoCode.latitude,
            longitude: poi.geoCode.longitude
          } : null,
          category: poi.category,
          tags: poi.tags || []
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ POIs by Square error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  // ===== TOURS AND ACTIVITIES API =====

  /**
   * Tours and Activities - Search for activities near a location
   * @see https://developers.amadeus.com/self-service/category/destination-experiences/api-doc/tours-and-activities
   * Endpoint: GET /v1/shopping/activities
   *
   * @param {number} latitude - Latitude of the location
   * @param {number} longitude - Longitude of the location
   * @param {Object} options - Additional options
   * @param {number} options.radius - Search radius in KM (default: 1, max: 20)
   * @returns {Promise<Object>} - Available tours, activities, and tickets
   */
  async getToursAndActivities(latitude, longitude, options = {}) {
    try {
      const token = await this.getAccessToken();

      if (!latitude || !longitude) {
        return { success: false, error: 'Latitude and longitude are required', data: [] };
      }

      console.log(`🎭 Tours & Activities: lat=${latitude}, lng=${longitude}`);

      const params = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: Math.min(options.radius || 1, 20)
      };

      const response = await axios.get(`${this.baseUrls.v1}/shopping/activities`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params,
        timeout: 10000
      });

      const activities = response.data.data || [];
      console.log(`✅ Found ${activities.length} tours & activities`);

      return {
        success: true,
        data: activities.map(activity => ({
          id: activity.id,
          type: activity.type,
          name: activity.name,
          shortDescription: activity.shortDescription,
          description: activity.description,
          geoCode: activity.geoCode ? {
            latitude: activity.geoCode.latitude,
            longitude: activity.geoCode.longitude
          } : null,
          rating: activity.rating,
          price: activity.price ? {
            amount: activity.price.amount,
            currencyCode: activity.price.currencyCode
          } : null,
          pictures: activity.pictures || [],
          bookingLink: activity.bookingLink,
          minimumDuration: activity.minimumDuration,
          categories: activity.categories || [],
          self: activity.self
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Tours & Activities error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  /**
   * Tours and Activities by Square - Get activities within a geographic square
   * Endpoint: GET /v1/shopping/activities/by-square
   *
   * @param {number} north - Northern latitude boundary
   * @param {number} west - Western longitude boundary
   * @param {number} south - Southern latitude boundary
   * @param {number} east - Eastern longitude boundary
   * @returns {Promise<Object>} - Activities within the square area
   */
  async getToursAndActivitiesBySquare(north, west, south, east) {
    try {
      const token = await this.getAccessToken();

      console.log(`🎭 Activities by Square: N=${north} W=${west} S=${south} E=${east}`);

      const response = await axios.get(`${this.baseUrls.v1}/shopping/activities/by-square`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          north: parseFloat(north),
          west: parseFloat(west),
          south: parseFloat(south),
          east: parseFloat(east)
        },
        timeout: 10000
      });

      const activities = response.data.data || [];
      console.log(`✅ Found ${activities.length} activities in square area`);

      return {
        success: true,
        data: activities.map(activity => ({
          id: activity.id,
          type: activity.type,
          name: activity.name,
          shortDescription: activity.shortDescription,
          description: activity.description,
          geoCode: activity.geoCode,
          rating: activity.rating,
          price: activity.price ? {
            amount: activity.price.amount,
            currencyCode: activity.price.currencyCode
          } : null,
          pictures: activity.pictures || [],
          bookingLink: activity.bookingLink,
          categories: activity.categories || []
        })),
        meta: response.data.meta
      };

    } catch (error) {
      console.error('❌ Activities by Square error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
    }
  }

  // ===== MOCK PNR GENERATION (FOR TESTING ONLY) =====

  // Mock order storage for testing
  static mockOrders = new Map();

  storeMockOrder(orderId, orderData, pnr) {
    AmadeusService.mockOrders.set(orderId, {
      ...orderData,
      pnr,
      createdAt: new Date().toISOString(),
      status: 'CONFIRMED'
    });
  }

  getMockOrder(orderId) {
    return AmadeusService.mockOrders.get(orderId);
  }

  generateMockPNR() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    let pnr = '';

    // Generate 6-character PNR (typical airline format: ABC123)
    for (let i = 0; i < 3; i++) {
      pnr += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    for (let i = 0; i < 3; i++) {
      pnr += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }

    return pnr;
  }

  generateMockOrderData(pnr, travelers = 1) {
    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return {
      id: orderId,
      type: 'flight-order',
      queuingOfficeId: 'TEST123',
      associatedRecords: [
        {
          reference: pnr,
          creationDate: new Date().toISOString().split('T')[0],
          originSystemCode: 'TEST',
          flightOfferId: 'TEST-OFFER-123'
        }
      ],
      flightOffers: [
        {
          type: 'flight-offer',
          id: 'TEST-OFFER-123',
          source: 'GDS',
          instantTicketingRequired: false,
          nonHomogeneous: false,
          oneWay: false,
          lastTicketingDate: '2024-12-31',
          numberOfBookableSeats: travelers,
          itineraries: [
            {
              duration: 'PT5H30M',
              segments: [
                {
                  departure: {
                    iataCode: 'NYC',
                    terminal: '4',
                    at: '2024-08-15T08:00:00'
                  },
                  arrival: {
                    iataCode: 'LAX',
                    terminal: '1',
                    at: '2024-08-15T11:30:00'
                  },
                  carrierCode: 'AA',
                  number: '123',
                  aircraft: {
                    code: '321'
                  },
                  operating: {
                    carrierCode: 'AA'
                  },
                  duration: 'PT5H30M',
                  id: '1',
                  numberOfStops: 0,
                  blacklistedInEU: false
                }
              ]
            }
          ],
          price: {
            currency: 'USD',
            total: '299.00',
            base: '249.00',
            fees: [
              {
                amount: '50.00',
                type: 'SUPPLIER'
              }
            ]
          },
          pricingOptions: {
            fareType: [
              'PUBLISHED'
            ],
            includedCheckedBagsOnly: true
          },
          validatingAirlineCodes: [
            'AA'
          ],
          travelerPricings: Array.from({ length: travelers }, (_, i) => ({
            travelerId: (i + 1).toString(),
            fareOption: 'STANDARD',
            travelerType: 'ADULT',
            price: {
              currency: 'USD',
              total: '299.00',
              base: '249.00'
            },
            fareDetailsBySegment: [
              {
                segmentId: '1',
                cabin: 'ECONOMY',
                fareBasis: 'UG1YXII',
                class: 'U',
                includedCheckedBags: {
                  weight: 23,
                  weightUnit: 'KG'
                }
              }
            ]
          }))
        }
      ],
      travelers: Array.from({ length: travelers }, (_, i) => ({
        id: (i + 1).toString(),
        dateOfBirth: '1990-01-01',
        name: {
          firstName: 'JOHN',
          lastName: 'DOE'
        },
        gender: 'MALE',
        contact: {
          emailAddress: 'john.doe@test.com',
          phones: [
            {
              deviceType: 'MOBILE',
              countryCallingCode: '1',
              number: '5551234567'
            }
          ]
        },
        documents: [
          {
            documentType: 'PASSPORT',
            birthPlace: 'New York',
            issuanceLocation: 'New York',
            issuanceDate: '2015-04-14',
            number: 'P123456789',
            expiryDate: '2030-12-31',
            issuanceCountry: 'US',
            validityCountry: 'US',
            nationality: 'US',
            holder: true
          }
        ]
      })),
      ticketingAgreement: {
        option: 'DELAY_TO_CANCEL',
        delay: '6D'
      },
      automatedProcess: [
        {
          code: 'IMMEDIATE',
          queue: {
            number: '0',
            category: '0'
          },
          officeId: 'TEST123'
        }
      ],
      contacts: [
        {
          addresseeName: {
            firstName: 'JOHN',
            lastName: 'DOE'
          },
          companyName: 'TEST COMPANY',
          purpose: 'STANDARD',
          phones: [
            {
              deviceType: 'MOBILE',
              countryCallingCode: '1',
              number: '5551234567'
            }
          ],
          emailAddress: 'john.doe@test.com',
          address: {
            lines: [
              '123 Test Street'
            ],
            postalCode: '12345',
            cityName: 'Test City',
            countryCode: 'US'
          }
        }
      ]
    };
  }
}

// Export a singleton instance
const amadeusService = new AmadeusService();
export default amadeusService; 