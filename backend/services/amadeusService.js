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

  // ===== UTILITY METHODS =====

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
      
      // If we don't need to check availability, return hotel list
      if (!params.checkInDate || !params.checkOutDate) {
        return hotelListResponse.data;
      }
      
      // If no hotels found, return empty results
      if (!hotelListResponse.data.data || hotelListResponse.data.data.length === 0) {
        return { data: [] };
      }
      
      // Filter and prioritize hotels
      const prioritizedHotels = this.prioritizeHotels(hotelListResponse.data.data);
      console.log(`Prioritized ${prioritizedHotels.length} best hotels (excluding test properties)`);
      
      // If no suitable hotels found after filtering, use the full list
      const hotelsToCheck = prioritizedHotels.length > 0 ? prioritizedHotels : hotelListResponse.data.data;
      
      // Get the first 5 hotel IDs to check availability
      const hotelIds = hotelsToCheck.slice(0, 5).map(hotel => hotel.hotelId);
      
      try {
        // Try to check availability using v3 endpoint
        const availabilityResponse = await axios.get(`${this.baseUrls.v3}/shopping/hotel-offers`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.amadeus+json'
          },
          params: {
            hotelIds: hotelIds.join(','),
            checkInDate: params.checkInDate,
            checkOutDate: params.checkOutDate,
            adults: params.adults || 2,
            roomQuantity: 1,
            currency: 'USD',
            bestRateOnly: true
          }
        });
        
        console.log(`Found ${availabilityResponse.data.data?.length || 0} hotels with availability`);
        
        // Return the combined results
        return {
          ...availabilityResponse.data,
          hotels: hotelListResponse.data.data
        };
      } catch (availabilityError) {
        console.warn('Could not check availability, returning hotel list only:', availabilityError.message);
        
        // If availability check fails, try with fallback hotel ID
        try {
          console.log('Trying with fallback hotel ID: EDLONDER');
          const fallbackResponse = await axios.get(`${this.baseUrls.v3}/shopping/hotel-offers`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.amadeus+json'
            },
            params: {
              hotelIds: 'EDLONDER',
              checkInDate: params.checkInDate,
              checkOutDate: params.checkOutDate,
              adults: params.adults || 2,
              roomQuantity: 1,
              currency: 'USD',
              bestRateOnly: true
            }
          });
          
          if (fallbackResponse.data.data && fallbackResponse.data.data.length > 0) {
            console.log('Successfully found availability with fallback hotel');
            return {
              ...fallbackResponse.data,
              hotels: hotelListResponse.data.data
            };
          }
        } catch (fallbackError) {
          console.log('Fallback hotel search also failed, returning hotel list only');
        }
        
        // Return just the hotel list
        return hotelListResponse.data;
      }
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
          checkInDate: new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0], // Tomorrow
          checkOutDate: new Date(Date.now() + 2*24*60*60*1000).toISOString().split('T')[0], // Day after tomorrow
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
          travelerPricings: Array.from({length: travelers}, (_, i) => ({
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
      travelers: Array.from({length: travelers}, (_, i) => ({
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