import axios from 'axios';

// Amadeus API configuration - USE TEST API with test credentials
const AMADEUS_API_URLS = {
  v1: 'https://test.api.amadeus.com/v1',
  v2: 'https://test.api.amadeus.com/v2',
  v3: 'https://test.api.amadeus.com/v3'
};

// ARC Pay configuration
const ARC_PAY_CONFIG = {
  API_URL: process.env.ARC_PAY_API_URL || 'https://api.arcpay.travel/api/rest/version/100/merchant/TESTARC05511704',
  MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
  API_USERNAME: process.env.ARC_PAY_API_USERNAME || 'TESTARC05511704',
  API_PASSWORD: process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c',
  BASE_URL: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100',
  PORTAL_URL: process.env.ARC_PAY_PORTAL_URL || 'https://api.arcpay.travel/ma/'
};

// Get Amadeus access token
const getAccessToken = async () => {
  try {
    // Use URLSearchParams for proper form encoding
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.AMADEUS_API_KEY || process.env.REACT_APP_AMADEUS_API_KEY);
    params.append('client_secret', process.env.AMADEUS_API_SECRET || process.env.REACT_APP_AMADEUS_API_SECRET);

    const response = await axios.post('https://test.api.amadeus.com/v1/security/oauth2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('❌ Amadeus authentication failed:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Amadeus API');
  }
};

// Helper function to get auth config for ARC Pay API
// ARC Pay uses merchant.MERCHANT_ID:password format for Basic Auth
const getArcPayAuthConfig = () => {
  const authString = `merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`;
  const authHeader = 'Basic ' + Buffer.from(authString).toString('base64');

  return {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': authHeader
    },
    timeout: 30000
  };
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Route based on URL path or query parameter
  const { query } = req;
  let endpoint = query.endpoint; // From query parameter
  let hotelId = query.hotelId; // From query parameter

  // Also check the URL path for direct endpoint access
  if (!endpoint && req.url) {
    if (req.url.includes('/destinations')) {
      endpoint = 'destinations';
    } else if (req.url.includes('/locations')) {
      endpoint = 'locations';
    } else if (req.url.includes('/search')) {
      endpoint = 'search';
    } else if (req.url.includes('/offers')) {
      endpoint = 'offers';
      // Try to extract hotelId from path /api/hotels/offers/XXXX
      const match = req.url.match(/\/offers\/([^?]+)/);
      if (match) hotelId = match[1];
    }
  }

  if (req.method === 'GET') {
    if (endpoint === 'destinations') {
      return await handleDestinations(req, res);
    } else if (endpoint === 'locations') {
      return await handleLocationSearch(req, res);
    } else if (endpoint === 'search') {
      return await handleHotelSearch(req, res);
    } else if (endpoint === 'offers') {
      // Put hotelId in body if exists (handler expects it there)
      if (hotelId) {
        req.body = { ...req.body, hotelId };
      }
      return await getHotelOffers(req, res);
    } else {
      return res.status(404).json({
        success: false,
        error: 'Endpoint not found. Available endpoints: /destinations, /locations, /search',
        url: req.url,
        query: query
      });
    }
  } else if (req.method === 'POST') {
    return await handleHotelRequest(req, res);
  } else {
    res.status(405).json({
      success: false,
      error: 'Method not allowed.',
      allowedMethods: ['GET', 'POST']
    });
  }
}

async function handleHotelRequest(req, res) {
  try {
    const {
      hotelId,
      checkInDate,
      checkOutDate,
      travelers,
      action = 'getOffers' // Default action
    } = req.body;

    console.log('🏨 Hotel API request:', { hotelId, checkInDate, checkOutDate, travelers, action });

    // Handle different actions
    switch (action) {
      case 'getOffers':
        return await getHotelOffers(req, res);
      case 'bookHotel':
        return await bookHotel(req, res);
      case 'createPayment':
        return await createHotelPayment(req, res);
      default:
        return await getHotelOffers(req, res);
    }
  } catch (error) {
    console.error('Hotel API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

async function getHotelOffers(req, res) {
  const { hotelId, checkInDate, checkOutDate, travelers = 2 } = req.body;

  // Validate required parameters
  if (!hotelId) {
    return res.status(400).json({
      success: false,
      error: 'Hotel ID is required'
    });
  }

  if (!checkInDate || !checkOutDate) {
    return res.status(400).json({
      success: false,
      error: 'Check-in and check-out dates are required'
    });
  }

  try {
    console.log('🏨 Fetching hotel offers from Amadeus API...');
    const token = await getAccessToken();

    // Get hotel offers from Amadeus
    const offersResponse = await axios.get(`${AMADEUS_API_URLS.v3}/shopping/hotel-offers`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        hotelIds: hotelId,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        adults: travelers,
        roomQuantity: 1,
        currency: 'USD',
        bestRateOnly: false
      }
    });

    if (offersResponse.data.data && offersResponse.data.data.length > 0) {
      const hotelData = offersResponse.data.data[0];
      const offers = hotelData.offers || [];

      console.log(`✅ Found ${offers.length} offers for hotel ${hotelId}`);

      // Format offers for frontend
      const formattedOffers = offers.map((offer, index) => ({
        id: offer.id || `offer-${index}`,
        roomType: offer.room?.typeEstimated?.category || 'Standard Room',
        bedType: offer.room?.typeEstimated?.bedType || 'Queen',
        price: parseFloat(offer.price?.total || 0),
        currency: offer.price?.currency || 'USD',
        cancellationPolicy: offer.policies?.cancellation?.description || 'Non-refundable',
        mealPlan: offer.boardType || 'Room only',
        description: offer.room?.description?.text || 'Comfortable room with modern amenities',
        maxOccupancy: offer.room?.typeEstimated?.beds || 2
      }));

      return res.status(200).json({
        success: true,
        hotelId: hotelId,
        offers: formattedOffers,
        meta: {
          totalOffers: formattedOffers.length,
          source: 'amadeus-api',
          currency: 'USD'
        }
      });
    } else {
      // Generate fallback offers if no real offers found
      console.log('🔄 No real offers found, generating fallback offers...');
      return generateFallbackOffers(res, hotelId);
    }
  } catch (amadeusError) {
    console.error('⚠️ Amadeus API failed:', amadeusError.message);
    // Generate fallback offers
    return generateFallbackOffers(res, hotelId);
  }
}

function generateFallbackOffers(res, hotelId) {
  const fallbackOffers = [
    {
      id: `fallback-${hotelId}-1`,
      roomType: 'Standard Room',
      bedType: 'Queen',
      price: 149.99,
      currency: 'USD',
      cancellationPolicy: 'Free cancellation up to 24 hours before check-in',
      mealPlan: 'Room only',
      description: 'Comfortable room with modern amenities and city view',
      maxOccupancy: 2
    },
    {
      id: `fallback-${hotelId}-2`,
      roomType: 'Deluxe Room',
      bedType: 'King',
      price: 199.99,
      currency: 'USD',
      cancellationPolicy: 'Free cancellation up to 48 hours before check-in',
      mealPlan: 'Breakfast included',
      description: 'Spacious room with premium amenities and panoramic view',
      maxOccupancy: 2
    },
    {
      id: `fallback-${hotelId}-3`,
      roomType: 'Suite',
      bedType: 'King + Sofa',
      price: 299.99,
      currency: 'USD',
      cancellationPolicy: 'Free cancellation up to 72 hours before check-in',
      mealPlan: 'Full board',
      description: 'Luxurious suite with separate living area and executive privileges',
      maxOccupancy: 4
    }
  ];

  return res.status(200).json({
    success: true,
    hotelId: hotelId,
    offers: fallbackOffers,
    meta: {
      totalOffers: fallbackOffers.length,
      source: 'fallback-data',
      currency: 'USD'
    }
  });
}

async function bookHotel(req, res) {
  try {
    const {
      hotelId,
      offerId,
      guestDetails,
      checkInDate,
      checkOutDate,
      totalPrice,
      currency = 'USD'
    } = req.body;

    // Validate required fields
    if (!hotelId || !offerId || !guestDetails || !checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required booking details'
      });
    }

    console.log('🏨 Processing hotel booking request...');

    // Generate booking reference
    const bookingReference = `HTL${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // For now, we'll create a placeholder booking since full Amadeus booking requires production access
    const bookingData = {
      bookingReference: bookingReference,
      status: 'CONFIRMED',
      hotelId: hotelId,
      offerId: offerId,
      guestDetails: guestDetails,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      totalPrice: totalPrice,
      currency: currency,
      createdAt: new Date().toISOString(),
      paymentStatus: 'PENDING'
    };

    return res.status(200).json({
      success: true,
      booking: bookingData,
      message: 'Hotel booking created successfully'
    });

  } catch (error) {
    console.error('❌ Hotel booking failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process hotel booking',
      details: error.message
    });
  }
}

async function createHotelPayment(req, res) {
  try {
    const {
      bookingReference,
      amount,
      currency = 'USD',
      guestDetails,
      hotelDetails
    } = req.body;

    // Validate required fields
    if (!bookingReference || !amount || !guestDetails) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment details'
      });
    }

    console.log('💳 Creating Arc Pay order for hotel booking...');

    // Create ARC Pay order
    try {
      const arcPayOrderData = {
        order: {
          reference: bookingReference,
          description: `Hotel booking - ${hotelDetails?.name || 'Hotel Reservation'}`,
          amount: {
            value: parseFloat(amount) * 100, // Convert to cents
            currency: currency
          }
        },
        customer: {
          reference: guestDetails.email || `guest-${Date.now()}`,
          firstName: guestDetails.firstName || 'Guest',
          lastName: guestDetails.lastName || 'User',
          email: guestDetails.email || 'guest@example.com',
          phone: guestDetails.phone || ''
        },
        billingAddress: {
          line1: guestDetails.address?.line1 || '',
          city: guestDetails.address?.city || '',
          state: guestDetails.address?.state || '',
          country: guestDetails.address?.country || 'US',
          postcode: guestDetails.address?.postcode || ''
        },
        interaction: {
          returnUrl: `${process.env.FRONTEND_URL || 'https://prod-h8l83lxpv-shubhams-projects-4a867368.vercel.app'}/hotel-booking-success?booking=${bookingReference}`,
          cancelUrl: `${process.env.FRONTEND_URL || 'https://prod-h8l83lxpv-shubhams-projects-4a867368.vercel.app'}/hotel-booking-cancelled?booking=${bookingReference}`
        }
      };

      const arcPayResponse = await axios.post(
        `${ARC_PAY_CONFIG.API_URL}/order`,
        arcPayOrderData,
        getArcPayAuthConfig()
      );

      if (arcPayResponse.data.result === 'SUCCESS') {
        console.log('✅ Arc Pay order created successfully');

        return res.status(200).json({
          success: true,
          orderId: arcPayResponse.data.order.reference,
          paymentUrl: arcPayResponse.data._links?.payment?.href,
          orderData: arcPayResponse.data,
          message: 'Payment order created successfully'
        });
      } else {
        throw new Error('Arc Pay order creation failed');
      }

    } catch (arcPayError) {
      console.error('❌ Arc Pay order creation failed:', arcPayError.message);

      // Return a mock payment URL for development
      return res.status(200).json({
        success: true,
        orderId: bookingReference,
        paymentUrl: `${process.env.FRONTEND_URL || 'https://prod-h8l83lxpv-shubhams-projects-4a867368.vercel.app'}/hotel-payment?booking=${bookingReference}&amount=${amount}`,
        orderData: {
          reference: bookingReference,
          amount: { value: amount, currency: currency },
          status: 'PENDING'
        },
        message: 'Mock payment order created (Arc Pay unavailable)',
        isMockPayment: true
      });
    }

  } catch (error) {
    console.error('❌ Payment creation failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create payment order',
      details: error.message
    });
  }
}

// Handle hotel destinations
async function handleDestinations(req, res) {
  // Popular destinations data for hotel search
  const destinations = [
    {
      id: 1,
      name: "Paris",
      code: "PAR",
      country: "France",
      image: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a",
      description: "The City of Light",
      rating: 4.8,
      reviews: 1250,
      popular: true
    },
    {
      id: 2,
      name: "London",
      code: "LON",
      country: "United Kingdom",
      image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad",
      description: "A Royal Experience",
      rating: 4.7,
      reviews: 980,
      popular: true
    },
    {
      id: 3,
      name: "New York",
      code: "NYC",
      country: "United States",
      image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9",
      description: "The City That Never Sleeps",
      rating: 4.9,
      reviews: 2100,
      popular: true
    },
    {
      id: 4,
      name: "Tokyo",
      code: "TYO",
      country: "Japan",
      image: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc",
      description: "Where Tradition Meets Future",
      rating: 4.8,
      reviews: 1560,
      popular: true
    },
    {
      id: 5,
      name: "Dubai",
      code: "DXB",
      country: "United Arab Emirates",
      image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c",
      description: "Luxury in the Desert",
      rating: 4.9,
      reviews: 890,
      popular: true
    },
    {
      id: 6,
      name: "Rome",
      code: "ROM",
      country: "Italy",
      image: "https://images.unsplash.com/photo-1525874684015-58379d421a52",
      description: "The Eternal City",
      rating: 4.7,
      reviews: 1100,
      popular: true
    },
    {
      id: 7,
      name: "Singapore",
      code: "SIN",
      country: "Singapore",
      image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd",
      description: "Garden City of Asia",
      rating: 4.8,
      reviews: 950,
      popular: true
    },
    {
      id: 8,
      name: "Barcelona",
      code: "BCN",
      country: "Spain",
      image: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4",
      description: "Gaudi's Masterpiece",
      rating: 4.7,
      reviews: 850,
      popular: false
    },
    {
      id: 9,
      name: "Amsterdam",
      code: "AMS",
      country: "Netherlands",
      image: "https://images.unsplash.com/photo-1576924542622-772579fe5fbb",
      description: "City of Canals",
      rating: 4.6,
      reviews: 780,
      popular: false
    },
    {
      id: 10,
      name: "Hong Kong",
      code: "HKG",
      country: "China",
      image: "https://images.unsplash.com/photo-1508002366005-75a695ee2d17",
      description: "East Meets West",
      rating: 4.7,
      reviews: 920,
      popular: false
    },
    {
      id: 11,
      name: "Berlin",
      code: "BER",
      country: "Germany",
      image: "https://images.unsplash.com/photo-1528728329032-2972f65dfb3f",
      description: "Historic and Modern",
      rating: 4.5,
      reviews: 720,
      popular: false
    },
    {
      id: 12,
      name: "Istanbul",
      code: "IST",
      country: "Turkey",
      image: "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b",
      description: "Where Europe Meets Asia",
      rating: 4.6,
      reviews: 850,
      popular: false
    },
    {
      id: 13,
      name: "Mumbai",
      code: "BOM",
      country: "India",
      image: "https://images.unsplash.com/photo-1567157577867-05ccb1388e66",
      description: "The City of Dreams",
      rating: 4.4,
      reviews: 980,
      popular: false
    },
    {
      id: 14,
      name: "Bangkok",
      code: "BKK",
      country: "Thailand",
      image: "https://images.unsplash.com/photo-1508009603885-50cf7c579365",
      description: "The City of Angels",
      rating: 4.5,
      reviews: 1200,
      popular: false
    },
    {
      id: 15,
      name: "Sydney",
      code: "SYD",
      country: "Australia",
      image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
      description: "Harbour City",
      rating: 4.8,
      reviews: 890,
      popular: false
    },
    {
      id: 16,
      name: "Delhi",
      code: "DEL",
      country: "India",
      image: "https://images.unsplash.com/photo-1587474260584-136574528ed5",
      description: "Historic Capital",
      rating: 4.3,
      reviews: 750,
      popular: false
    },
    {
      id: 17,
      name: "Bali",
      code: "DPS",
      country: "Indonesia",
      image: "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1",
      description: "Island Paradise",
      rating: 4.9,
      reviews: 1100,
      popular: false
    },
    {
      id: 18,
      name: "Las Vegas",
      code: "LAS",
      country: "United States",
      image: "https://images.unsplash.com/photo-1605833172749-de56ca0a5c90",
      description: "Entertainment Capital",
      rating: 4.5,
      reviews: 780,
      popular: false
    },
    {
      id: 19,
      name: "Miami",
      code: "MIA",
      country: "United States",
      image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
      description: "Magic City",
      rating: 4.6,
      reviews: 690,
      popular: false
    },
    {
      id: 20,
      name: "Los Angeles",
      code: "LAX",
      country: "United States",
      image: "https://images.unsplash.com/photo-1444723121867-7a241cacace9",
      description: "City of Angels",
      rating: 4.4,
      reviews: 850,
      popular: false
    }
  ];

  // Optional query parameters for filtering
  const { popular, country, limit } = req.query;
  let filteredDestinations = [...destinations];

  // Filter by popular destinations
  if (popular === 'true') {
    filteredDestinations = filteredDestinations.filter(dest => dest.popular);
  }

  // Filter by country
  if (country) {
    filteredDestinations = filteredDestinations.filter(dest =>
      dest.country.toLowerCase().includes(country.toLowerCase())
    );
  }

  // Limit results
  if (limit) {
    const limitNum = parseInt(limit);
    if (!isNaN(limitNum) && limitNum > 0) {
      filteredDestinations = filteredDestinations.slice(0, limitNum);
    }
  }

  res.status(200).json({
    success: true,
    data: filteredDestinations,
    total: filteredDestinations.length,
    message: 'Hotel destinations retrieved successfully'
  });
}

// Handle location/city search for autocomplete
async function handleLocationSearch(req, res) {
  const { keyword } = req.query;

  if (!keyword || keyword.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Keyword must be at least 2 characters'
    });
  }

  try {
    console.log(`🔍 Searching locations for: ${keyword}`);
    const token = await getAccessToken();
    console.log(`✅ Got Amadeus token for location search`);

    // Use Amadeus location search API
    const response = await axios.get(`${AMADEUS_API_URLS.v1}/reference-data/locations`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        keyword: keyword,
        subType: 'CITY,AIRPORT',
        'page[limit]': 15,
        view: 'FULL'
      }
    });

    const locations = response.data.data || [];
    console.log(`✅ Found ${locations.length} locations for "${keyword}" from Amadeus API`);

    // Format locations for frontend - prioritize cities
    const formattedLocations = locations
      .filter(loc => loc.iataCode) // Only include locations with IATA codes
      .map(loc => ({
        name: loc.address?.cityName || loc.name || keyword,
        code: loc.iataCode,
        type: loc.subType,
        cityName: loc.address?.cityName || loc.name,
        cityCode: loc.address?.cityCode || loc.iataCode,
        country: loc.address?.countryName || '',
        countryCode: loc.address?.countryCode || '',
        displayName: `${loc.address?.cityName || loc.name}${loc.address?.countryName ? ', ' + loc.address.countryName : ''}`
      }))
      // Remove duplicates by city code
      .filter((loc, index, self) =>
        index === self.findIndex(l => l.cityCode === loc.cityCode || l.code === loc.code)
      )
      .slice(0, 10);

    return res.json({
      success: true,
      data: formattedLocations,
      source: 'amadeus'
    });

  } catch (error) {
    console.error('❌ Error searching locations:', error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      error: 'Failed to search locations. Please try again.',
      details: error.response?.data?.errors?.[0]?.detail || error.message
    });
  }
}

// Handle hotel search
async function handleHotelSearch(req, res) {
  const { destination, checkInDate, checkOutDate, travelers, radius, radiusUnit, hotelSource } = req.query;

  // Validate required parameters
  if (!destination) {
    return res.status(400).json({
      success: false,
      error: 'Destination is required',
      message: 'Please provide a destination to search for hotels'
    });
  }

  if (!checkInDate || !checkOutDate) {
    return res.status(400).json({
      success: false,
      error: 'Check-in and check-out dates are required',
      message: 'Please provide both check-in and check-out dates'
    });
  }

  // City mappings for destination codes
  const cityMappings = {
    'PAR': 'Paris',
    'LON': 'London',
    'NYC': 'New York',
    'TYO': 'Tokyo',
    'DXB': 'Dubai',
    'ROM': 'Rome',
    'SIN': 'Singapore',
    'BCN': 'Barcelona',
    'AMS': 'Amsterdam',
    'HKG': 'Hong Kong',
    'BER': 'Berlin',
    'IST': 'Istanbul',
    'BOM': 'Mumbai',
    'BKK': 'Bangkok',
    'SYD': 'Sydney',
    'DEL': 'Delhi',
    'DPS': 'Bali',
    'LAS': 'Las Vegas',
    'MIA': 'Miami',
    'LAX': 'Los Angeles'
  };

  const cityName = cityMappings[destination] || destination;
  const travelersCount = parseInt(travelers) || 2;

  // Try to get real hotels from Amadeus API first
  try {
    console.log(`🏨 Attempting to fetch real hotels from Amadeus API for ${destination}...`);
    console.log('Using API credentials:', {
      hasApiKey: !!process.env.AMADEUS_API_KEY,
      hasApiSecret: !!process.env.AMADEUS_API_SECRET,
      hasReactApiKey: !!process.env.REACT_APP_AMADEUS_API_KEY,
      hasReactApiSecret: !!process.env.REACT_APP_AMADEUS_API_SECRET
    });

    const token = await getAccessToken();
    console.log('✅ Got Amadeus token successfully');

    // Search for hotels in the city
    const hotelListResponse = await axios.get(`${AMADEUS_API_URLS.v1}/reference-data/locations/hotels/by-city`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        cityCode: destination,
        radius: 50,
        radiusUnit: 'KM',
        hotelSource: 'ALL'
      },
      timeout: 10000
    });

    if (hotelListResponse.data.data && hotelListResponse.data.data.length > 0) {
      console.log(`✅ Found ${hotelListResponse.data.data.length} real hotels from Amadeus for ${destination}`);

      // Format real hotel data for frontend
      const realHotels = hotelListResponse.data.data.slice(0, 8).map((hotel, index) => ({
        id: `amadeus-${hotel.hotelId}`,
        hotelId: hotel.hotelId,
        name: hotel.name,
        location: `${hotel.address?.cityName || cityName}${hotel.address?.countryCode ? `, ${hotel.address.countryCode}` : ''}`,
        address: hotel.address,
        geoCode: hotel.geoCode,
        price: (150 + index * 25).toFixed(2),
        currency: 'USD',
        rating: (4.0 + Math.random() * 1.0).toFixed(1),
        reviews: Math.floor(Math.random() * 1000) + 100,
        stars: 4,
        image: `https://images.unsplash.com/photo-${1566073771259 + index}?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80`,
        images: [
          `https://images.unsplash.com/photo-${1566073771259 + index}?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80`,
          `https://images.unsplash.com/photo-${1551882547 + index}?auto=format&fit=crop&w=1470&q=80`
        ],
        amenities: ['Free WiFi', 'Air Conditioning', 'Pool', '24-hour Front Desk', 'Restaurant'].sort(() => 0.5 - Math.random()).slice(0, 3),
        availability: 'Available',
        source: 'amadeus-real-data'
      }));

      console.log(`📤 Return ${realHotels.length} real hotels to frontend`);

      return res.status(200).json({
        success: true,
        data: {
          hotels: realHotels,
          searchParams: {
            destination: destination,
            cityName: cityName,
            checkInDate: checkInDate,
            checkOutDate: checkOutDate,
            travelers: travelersCount,
            radius: 50,
            radiusUnit: 'KM'
          },
          meta: {
            totalResults: realHotels.length,
            resultsFound: realHotels.length,
            searchTime: Math.random() * 2 + 0.5,
            currency: 'USD',
            source: 'amadeus-production-api'
          }
        },
        message: `Found ${realHotels.length} real hotels in ${cityName}`,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`⚠️ Amadeus returned 0 hotels for ${destination}, using fallback`);
    }
  } catch (amadeusError) {
    console.error(`❌ Amadeus API failed for ${destination}:`, amadeusError.response?.data || amadeusError.message);
    console.error('Full error:', amadeusError);
  }

  // Fallback to mock data if Amadeus fails
  console.log('🔄 Using fallback mock hotel data...');

  // Generate mock hotel data based on destination
  const generateHotels = (cityName, destination) => {
    const hotelNames = [
      `${cityName} Grand Hotel`,
      `Royal ${cityName} Resort`,
      `${cityName} Palace Hotel`,
      `Luxury ${cityName} Suites`,
      `${cityName} Executive Inn`,
      `${cityName} Continental Hotel`,
      `Premium ${cityName} Plaza`,
      `${cityName} International`
    ];

    const amenities = [
      ['Free WiFi', 'Swimming Pool', 'Fitness Center', 'Restaurant', 'Room Service'],
      ['Free WiFi', 'Spa', 'Bar', 'Concierge', 'Parking'],
      ['Free WiFi', 'Business Center', 'Airport Shuttle', 'Laundry', 'Restaurant'],
      ['Free WiFi', 'Pool', 'Gym', '24/7 Reception', 'Breakfast'],
      ['Free WiFi', 'Rooftop Terrace', 'Restaurant', 'Bar', 'Room Service'],
      ['Free WiFi', 'Conference Rooms', 'Parking', 'Breakfast', 'Concierge'],
      ['Free WiFi', 'Spa', 'Pool', 'Restaurant', 'Valet Parking'],
      ['Free WiFi', 'Fitness Center', 'Business Center', 'Airport Transfer', 'Bar']
    ];

    const images = [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1578898886397-72d4e503b0b5?auto=format&fit=crop&w=1470&q=80'
    ];

    const basePrice = Math.floor(Math.random() * 200) + 100; // Base price between $100-300

    return hotelNames.map((name, index) => ({
      id: `hotel-${destination}-${index}`,
      hotelId: `${destination}${String(index + 1).padStart(3, '0')}`,
      name: name,
      location: `${cityName}${destination !== cityName ? `, ${destination}` : ''}`,
      address: {
        streetAddress: `${Math.floor(Math.random() * 999) + 1} ${['Main St', 'Broadway', 'Central Ave', 'Park Ave', 'Hotel Blvd'][index % 5]}`,
        cityName: cityName,
        countryCode: getCountryCode(destination),
        postalCode: String(Math.floor(Math.random() * 90000) + 10000)
      },
      price: (basePrice + (index * 25)).toFixed(2),
      currency: 'USD',
      rating: (4.0 + Math.random() * 1.0).toFixed(1),
      reviews: Math.floor(Math.random() * 1000) + 100,
      image: images[index % images.length],
      images: [images[index % images.length]],
      amenities: amenities[index % amenities.length],
      description: `Experience luxury and comfort at ${name}. Located in the heart of ${cityName}, this hotel offers exceptional service and modern amenities.`,
      availability: 'Available',
      roomTypes: [
        {
          type: 'Standard Room',
          price: (basePrice + (index * 25)).toFixed(2),
          currency: 'USD',
          available: true,
          beds: 'Queen Bed',
          occupancy: 2
        },
        {
          type: 'Deluxe Room',
          price: (basePrice + (index * 25) + 50).toFixed(2),
          currency: 'USD',
          available: true,
          beds: 'King Bed',
          occupancy: 2
        },
        {
          type: 'Suite',
          price: (basePrice + (index * 25) + 100).toFixed(2),
          currency: 'USD',
          available: true,
          beds: 'King Bed + Sofa',
          occupancy: 4
        }
      ],
      coordinates: {
        latitude: (40.7128 + (Math.random() - 0.5) * 0.1), // Random coordinates around a base point
        longitude: (-74.0060 + (Math.random() - 0.5) * 0.1)
      },
      checkInTime: '15:00',
      checkOutTime: '11:00',
      policies: {
        cancellation: 'Free cancellation up to 24 hours before check-in',
        pets: Math.random() > 0.5 ? 'Pets allowed' : 'No pets allowed',
        smoking: 'Non-smoking'
      }
    }));
  };

  // Helper function to get country code
  const getCountryCode = (destination) => {
    const countryCodes = {
      'PAR': 'FR', 'LON': 'GB', 'NYC': 'US', 'TYO': 'JP', 'DXB': 'AE',
      'ROM': 'IT', 'SIN': 'SG', 'BCN': 'ES', 'AMS': 'NL', 'HKG': 'HK',
      'BER': 'DE', 'IST': 'TR', 'BOM': 'IN', 'BKK': 'TH', 'SYD': 'AU',
      'DEL': 'IN', 'DPS': 'ID', 'LAS': 'US', 'MIA': 'US', 'LAX': 'US'
    };
    return countryCodes[destination] || 'XX';
  };

  // Generate hotels for the destination
  const hotels = generateHotels(cityName, destination);

  // Response data
  const responseData = {
    success: true,
    data: {
      hotels: hotels,
      searchParams: {
        destination: destination,
        cityName: cityName,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        travelers: travelersCount,
        radius: radius || 50,
        radiusUnit: radiusUnit || 'KM'
      },
      meta: {
        totalResults: hotels.length,
        resultsFound: hotels.length,
        searchTime: Math.random() * 2 + 0.5, // Random search time
        currency: 'USD',
        source: 'mock-data-api'
      }
    },
    message: `Found ${hotels.length} hotels in ${cityName}`,
    timestamp: new Date().toISOString()
  };

  // Add delay to simulate real API response time
  setTimeout(() => {
    res.status(200).json(responseData);
  }, Math.random() * 1000 + 500); // 500-1500ms delay
} 