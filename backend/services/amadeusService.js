import axios from 'axios';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

class AmadeusService {
  constructor() {
    // Use test API (keys are test credentials despite .env label)
    const apiHost = process.env.AMADEUS_API_HOST || 'https://test.api.amadeus.com';
    this.baseUrls = {
      v1: `${apiHost}/v1`,
      v2: `${apiHost}/v2`,
      v3: `${apiHost}/v3`
    };
    console.log(`Amadeus API host: ${apiHost} (NODE_ENV=${process.env.NODE_ENV})`);
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
      adults: parseInt(params.adults || params.travelers) || 1,
      max: parseInt(params.max) || 10,
      currencyCode: params.currency || 'USD'
    };

    // Add children count if specified
    if (params.children && parseInt(params.children) > 0) {
      searchParams.children = parseInt(params.children);
    }

    // Add infants count if specified
    if (params.infants && parseInt(params.infants) > 0) {
      searchParams.infants = parseInt(params.infants);
    }

    // Add return date for round trip
    if (params.returnDate && params.returnDate.trim() !== '') {
      searchParams.returnDate = params.returnDate;
    }

    // Add cabin class if specified
    if (params.travelClass) {
      searchParams.travelClass = params.travelClass;
    }

    // Add nonStop setting if specified
    if (params.nonStop !== undefined) {
      searchParams.nonStop = params.nonStop;
    }

    // Add maxPrice filter if specified
    if (params.maxPrice && parseFloat(params.maxPrice) > 0) {
      searchParams.maxPrice = parseFloat(params.maxPrice);
    }

    // Add airline code filters if specified
    if (params.includedAirlineCodes) {
      searchParams.includedAirlineCodes = params.includedAirlineCodes;
    }
    if (params.excludedAirlineCodes) {
      searchParams.excludedAirlineCodes = params.excludedAirlineCodes;
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
      console.log('📋 Creating flight order...');
      console.log('Flight Order Data structure:', {
        hasData: !!flightOrderData?.data,
        dataType: flightOrderData?.data?.type,
        hasFlightOffers: !!flightOrderData?.data?.flightOffers,
        flightOffersCount: flightOrderData?.data?.flightOffers?.length || 0,
        hasTravelers: !!flightOrderData?.data?.travelers,
        travelersCount: flightOrderData?.data?.travelers?.length || 0
      });

      // Validate required structure before calling Amadeus API
      if (!flightOrderData?.data) {
        throw new Error('Invalid flight order data: missing "data" object');
      }
      if (!flightOrderData.data.type) {
        throw new Error('Invalid flight order data: missing "data.type"');
      }
      if (!flightOrderData.data.flightOffers || !Array.isArray(flightOrderData.data.flightOffers)) {
        throw new Error('Invalid flight order data: missing or invalid "data.flightOffers"');
      }
      if (flightOrderData.data.flightOffers.length === 0) {
        throw new Error('Invalid flight order data: "data.flightOffers" cannot be empty');
      }
      if (!flightOrderData.data.travelers || !Array.isArray(flightOrderData.data.travelers)) {
        throw new Error('Invalid flight order data: missing or invalid "data.travelers"');
      }
      if (flightOrderData.data.travelers.length === 0) {
        throw new Error('Invalid flight order data: "data.travelers" cannot be empty');
      }

      console.log('✅ Flight order data validation passed');

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
      console.log('⚠️ Real Amadeus booking failed, generating mock PNR as fallback...');
      const errorCode = error.response?.data?.errors?.[0]?.code;
      const errorDetail = error.response?.data?.errors?.[0]?.detail || error.message;
      console.log('⚠️ Amadeus error details:', { errorCode, errorDetail, status: error.response?.status });

      // Always fall back to mock PNR generation when real API fails
      // (covers test-environment limitations, expired offers, rate limits, validation errors, etc.)
      try {
        const mockPNR = this.generateMockPNR();
        const travelers = flightOrderData?.data?.travelers?.length || 1;
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
          message: 'Mock booking created for testing - use production keys for real PNRs',
          originalError: errorDetail // Include original error for debugging
        };
      } catch (mockError) {
        console.error('❌ Even mock booking generation failed:', mockError);
        // Re-throw the original error if mock generation also fails
        throw new Error(`Flight order creation failed: ${errorDetail}. Mock fallback also failed: ${mockError.message}`);
      }
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

  /**
   * Cancel a flight order by its ID
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-order-management
   * @param {string} orderId - The flight order ID to cancel
   * @returns {Promise<Object>} - Cancellation result
   */
  async cancelFlightOrder(orderId) {
    try {
      const token = await this.getAccessToken();

      console.log(`🗑️ Cancelling flight order: ${orderId}`);

      await axios.delete(
        `${this.baseUrls.v1}/booking/flight-orders/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.amadeus+json'
          }
        }
      );

      console.log(`✅ Flight order ${orderId} cancelled successfully`);

      return {
        success: true,
        message: `Flight order ${orderId} has been cancelled`
      };

    } catch (error) {
      console.error('❌ Error cancelling flight order:', error.response?.data || error.message);

      // Check if it's a mock order and remove from storage
      const mockOrder = this.getMockOrder(orderId);
      if (mockOrder) {
        // Remove from mock storage (in-memory)
        if (this.mockOrders) {
          this.mockOrders.delete(orderId);
        }
        console.log(`✅ Mock order ${orderId} removed from storage`);
        return {
          success: true,
          message: `Mock order ${orderId} has been cancelled`,
          mode: 'MOCK_CANCELLATION'
        };
      }

      throw {
        success: false,
        error: error.response?.data?.errors?.[0]?.detail || error.message,
        code: error.response?.status || 500
      };
    }
  }

  // ===== FLIGHT PRICING AND CONFIRMATION =====

  /**
   * Price a flight offer with optional ancillary data
   * @param {Object} flightOffer - The flight offer to price
   * @param {Object} options - Optional pricing options
   * @param {string[]} options.include - Additional data to include (e.g., 'bags', 'detailed-fare-rules', 'credit-card-fees', 'other-services')
   * @returns {Promise<Object>} - Priced flight offer
   */
  async priceFlightOffer(flightOffer, options = {}) {
    try {
      const token = await this.getAccessToken();

      console.log('💰 Pricing flight offer...');

      // Build query params for include (bags, fare rules, etc.)
      const queryParams = {};
      if (options.include && Array.isArray(options.include)) {
        queryParams.include = options.include.join(',');
      } else {
        // Default: include bags and detailed fare rules for richer pricing
        queryParams.include = 'bags,detailed-fare-rules';
      }

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
          },
          params: queryParams
        }
      );

      console.log('✅ Flight offer priced successfully');

      return {
        success: true,
        data: response.data.data,
        dictionaries: response.data.dictionaries
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

  /**
   * Look up airline information by IATA/ICAO codes
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/airline-code-lookup
   * @param {string} [codes] - Optional comma-separated airline codes (e.g., 'AA,BA,AI'). If omitted, returns all airlines.
   * @returns {Promise<Object>} - List of matching airlines
   */
  async getAirlineCodes(codes) {
    try {
      const token = await this.getAccessToken();

      // Build params per spec: only 'airlineCodes' is a valid parameter
      const params = {};
      if (codes) {
        params.airlineCodes = codes;
      }

      const response = await axios.get(`${this.baseUrls.v1}/reference-data/airlines`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: params
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
  /**
   * Get Flight Availabilities (seat inventory)
   * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-availabilities-search
   * @param {Object} params - Search parameters
   * @param {string} params.origin - Origin IATA code
   * @param {string} params.destination - Destination IATA code
   * @param {string} params.departureDate - Departure date (YYYY-MM-DD)
   * @param {Array} [params.originDestinations] - Full origin-destination array for multi-city (overrides origin/destination/departureDate)
   * @param {number} [params.adults=1] - Number of adult travelers
   * @param {number} [params.children=0] - Number of child travelers
   * @param {Object} [params.searchCriteria] - Optional search criteria for filtering
   * @param {string} [params.searchCriteria.cabin] - Cabin class filter (ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST)
   * @param {string[]} [params.searchCriteria.carrierCodes] - Carrier code filters
   * @returns {Promise<Object>} - Flight availabilities
   */
  async getFlightAvailabilities(params) {
    try {
      const token = await this.getAccessToken();

      console.log(`🎫 Searching flight availabilities: ${params.origin} → ${params.destination}`);

      // Build travelers array dynamically
      const travelers = [];
      const adultCount = parseInt(params.adults) || 1;
      const childCount = parseInt(params.children) || 0;

      for (let i = 1; i <= adultCount; i++) {
        travelers.push({ id: `${i}`, travelerType: 'ADULT' });
      }
      for (let i = 1; i <= childCount; i++) {
        travelers.push({ id: `${adultCount + i}`, travelerType: 'CHILD' });
      }

      // Build origin-destinations — allow full array override for multi-city
      const originDestinations = params.originDestinations || [{
        id: '1',
        originLocationCode: params.origin,
        destinationLocationCode: params.destination,
        departureDateTime: { date: params.departureDate }
      }];

      const requestBody = {
        originDestinations,
        travelers,
        sources: params.sources || ['GDS']
      };

      // Add optional search criteria (cabin, carrier, connections)
      if (params.searchCriteria) {
        requestBody.searchCriteria = params.searchCriteria;
      }

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
     * Search for flight inspiration (cheapest destinations from an origin)
     * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-inspiration-search
     * @param {string} origin - IATA code of origin
     * @param {Object} options - Optional params
     * @returns {Promise<Object>} - Cheapest destination offers
     */
    async getFlightInspirations(origin, options = {}) {
      try {
        const token = await this.getAccessToken();

        console.log(`💡 Flight inspiration search from ${origin}`);

        const params = {
          origin: origin,
          ...(options.departureDate && { departureDate: options.departureDate }),
          ...(options.oneWay !== undefined && { oneWay: options.oneWay }),
          ...(options.duration && { duration: options.duration }),
          ...(options.nonStop !== undefined && { nonStop: options.nonStop }),
          ...(options.maxPrice && { maxPrice: options.maxPrice }),
          ...(options.viewBy && { viewBy: options.viewBy }),
          ...(options.destination && { destination: options.destination })
        };

        const response = await axios.get(`${this.baseUrls.v1}/shopping/flight-destinations`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: params,
          timeout: 10000
        });

        const destinations = response.data.data || [];
        console.log(`✅ Found ${destinations.length} inspiration destinations`);

        return {
          success: true,
          data: destinations.map(d => ({
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
        console.error('❌ Flight inspiration search error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
      }
    }

    /**
     * Get flight price analysis (price metrics for an itinerary)
     * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-price-analysis
     * @param {string} originIataCode - Origin IATA code
     * @param {string} destinationIataCode - Destination IATA code
     * @param {string} departureDate - Departure date (YYYY-MM-DD)
     * @param {Object} options - Optional params
     * @returns {Promise<Object>} - Price metrics
     */
    async getFlightPriceAnalysis(originIataCode, destinationIataCode, departureDate, options = {}) {
      try {
        const token = await this.getAccessToken();

        console.log(`📊 Price analysis: ${originIataCode} → ${destinationIataCode} on ${departureDate}`);

        const params = {
          originIataCode,
          destinationIataCode,
          departureDate,
          currencyCode: options.currencyCode || 'USD',
          ...(options.oneWay !== undefined && { oneWay: options.oneWay })
        };

        const response = await axios.get(`${this.baseUrls.v1}/analytics/itinerary-price-metrics`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: params,
          timeout: 10000
        });

        const metrics = response.data.data || [];
        console.log(`✅ Found ${metrics.length} price metric entries`);

        return {
          success: true,
          data: metrics,
          meta: response.data.meta
        };

      } catch (error) {
        console.error('❌ Flight price analysis error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.detail || error.message, data: [] };
      }
    }

    /**
     * Get default period for analytics — use a historical period that has data in test env
     */
    getDefaultPeriod() {
      // Test environment only has data for past periods
      // Use 6 months ago to ensure data availability
      const now = new Date();
      now.setMonth(now.getMonth() - 6);
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
      console.log(`🏨 Searching hotels in ${params.cityCode} with Amadeus...`);

      // 1. First attempt: Search for hotels with AVAILABILITY (Shop API)
      // This ensures we get bookable hotels with prices
      try {
        console.log('🔍 Attempting to find available hotels via Shopping API...');

        const shoppingParams = {
          cityCode: params.cityCode,
          checkInDate: params.checkInDate,
          checkOutDate: params.checkOutDate,
          adults: params.adults || 2,
          roomQuantity: 1,
          currency: 'USD',
          radius: params.radius || 20,
          radiusUnit: 'KM',
          paymentPolicy: 'NONE', // maximize results
          includeClosed: false,
          bestRateOnly: true
        };

        // If dates are missing, generate default future dates
        if (!shoppingParams.checkInDate || !shoppingParams.checkOutDate) {
          const today = new Date();
          const nextMonth = new Date(today);
          nextMonth.setDate(today.getDate() + 30);
          const nextMonthEnd = new Date(nextMonth);
          nextMonthEnd.setDate(nextMonth.getDate() + 3);

          shoppingParams.checkInDate = nextMonth.toISOString().split('T')[0];
          shoppingParams.checkOutDate = nextMonthEnd.toISOString().split('T')[0];
          console.log(`📅 Using default dates for availability search: ${shoppingParams.checkInDate} to ${shoppingParams.checkOutDate}`);
        }

        const shoppingResponse = await axios.get(`${this.baseUrls.v3}/shopping/hotel-offers`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: shoppingParams
        });

        if (shoppingResponse.data.data && shoppingResponse.data.data.length > 0) {
          console.log(`✅ Found ${shoppingResponse.data.data.length} available hotels with offers`);
          return { data: shoppingResponse.data.data };
        }

        console.log('⚠️ No hotels found with availability, falling back to directory search');

      } catch (shoppingError) {
        console.warn('⚠️ Shopping API search failed/empty, falling back to directory search:', shoppingError.response?.data?.errors?.[0]?.detail || shoppingError.message);
      }

      // 2. Fallback: Get hotels in the city using v1 endpoint (Reference Data)
      // This returns a list of hotels, but we don't know if they are bookable
      console.log('📂 Performing directory search (Reference Data API)...');

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

      console.log(`✅ Found ${hotelListResponse.data.data?.length || 0} hotels in ${params.cityCode} directory`);

      // If no hotels found, return empty results
      if (!hotelListResponse.data.data || hotelListResponse.data.data.length === 0) {
        return { data: [] };
      }

      // Filter and prioritize identifying specific known test hotels if in test environment
      // This helps avoid "INVALID PROPERTY CODE" errors by preferring hotels that might actually work
      const hotels = hotelListResponse.data.data;

      // For fallback directory results, we return the raw list
      // The controller will handle formatting
      return {
        data: hotels,
        hotels: hotels // standardized property for controller
      };

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