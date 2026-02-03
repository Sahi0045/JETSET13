import express from 'express';
import AmadeusService from '../services/amadeusService.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://qqmagqwumjipdqvxbiqu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Helper function to save booking to database
async function saveBookingToDatabase(bookingData) {
  if (!supabase) {
    console.log('⚠️ Supabase not configured, skipping database save');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: bookingData.userId || null,
        booking_reference: bookingData.bookingReference,
        travel_type: 'flight',
        status: 'confirmed',
        total_amount: parseFloat(bookingData.totalAmount) || 0,
        payment_status: 'paid',
        booking_details: {
          pnr: bookingData.pnr,
          order_id: bookingData.orderId,
          transaction_id: bookingData.transactionId,
          amount: parseFloat(bookingData.totalAmount) || 0, // Also store in booking_details for redundancy
          currency: bookingData.currency || 'USD',
          origin: bookingData.origin,
          destination: bookingData.destination,
          departure_date: bookingData.departureDate,
          departure_time: bookingData.departureTime,
          arrival_time: bookingData.arrivalTime,
          airline: bookingData.airline,
          airline_name: bookingData.airlineName,
          flight_number: bookingData.flightNumber,
          duration: bookingData.duration,
          cabin_class: bookingData.cabinClass,
          flight_offer: bookingData.flightOffer
        },
        passenger_details: bookingData.travelers
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving booking to database:', error);
      return null;
    }

    console.log('✅ Booking saved to database:', data.id);
    return data;
  } catch (err) {
    console.error('❌ Database save error:', err);
    return null;
  }
}

// Helper function to generate mock PNR for demo/test bookings
function generateMockPNR() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let pnr = '';
  for (let i = 0; i < 3; i++) {
    pnr += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 3; i++) {
    pnr += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  return pnr;
}

// Helper function to get Amadeus credentials
const getAmadeusCredentials = () => {
  const apiKey = process.env.AMADEUS_API_KEY || process.env.REACT_APP_AMADEUS_API_KEY;
  const apiSecret = process.env.AMADEUS_API_SECRET || process.env.REACT_APP_AMADEUS_API_SECRET;

  const keySource = process.env.AMADEUS_API_KEY ? 'AMADEUS_API_KEY' :
    (process.env.REACT_APP_AMADEUS_API_KEY ? 'REACT_APP_AMADEUS_API_KEY' : 'None');
  const secretSource = process.env.AMADEUS_API_SECRET ? 'AMADEUS_API_SECRET' :
    (process.env.REACT_APP_AMADEUS_API_SECRET ? 'REACT_APP_AMADEUS_API_SECRET' : 'None');

  console.log('Amadeus credentials source:', { keySource, secretSource });

  return { apiKey, apiSecret };
};

// Transform Amadeus API response to frontend format
const transformAmadeusFlightData = (amadeusFlights, dictionaries = {}) => {
  if (!amadeusFlights || amadeusFlights.length === 0) return [];

  const airlines = dictionaries?.carriers || {};
  const airports = dictionaries?.locations || {};
  const aircraft = dictionaries?.aircraft || {};

  return amadeusFlights.map(flight => {
    try {
      const firstItinerary = flight.itineraries?.[0];
      const firstSegment = firstItinerary?.segments?.[0];
      const lastSegment = firstItinerary?.segments?.[firstItinerary.segments.length - 1];

      if (!firstSegment || !lastSegment) {
        console.warn('Invalid flight segment data:', flight);
        return null;
      }

      // Calculate total duration
      let totalDuration = 'Unknown';
      if (firstItinerary?.duration) {
        const durationMatch = firstItinerary.duration.match(/PT(\d+H)?(\d+M)?/);
        if (durationMatch) {
          const hours = durationMatch[1] ? parseInt(durationMatch[1]) : 0;
          const minutes = durationMatch[2] ? parseInt(durationMatch[2]) : 0;
          totalDuration = `${hours}h ${minutes}m`;
        }
      }

      // Get airline name
      const carrierCode = firstSegment.carrierCode;
      const airlineName = airlines[carrierCode] || carrierCode;

      // Format departure and arrival
      const departure = {
        time: new Date(firstSegment.departure.at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        airport: firstSegment.departure.iataCode,
        terminal: firstSegment.departure.terminal || '',
        date: firstSegment.departure.at.split('T')[0]
      };

      const arrival = {
        time: new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        airport: lastSegment.arrival.iataCode,
        terminal: lastSegment.arrival.terminal || '',
        date: lastSegment.arrival.at.split('T')[0]
      };

      // Calculate stops
      const stops = Math.max(0, firstItinerary.segments.length - 1);

      // Get pricing info
      const price = {
        total: flight.price?.total || '0',
        amount: parseFloat(flight.price?.total || 0),
        currency: flight.price?.currency || 'USD'
      };

      // Get traveler pricing for cabin class
      const travelerPricing = flight.travelerPricings?.[0];
      const fareDetails = travelerPricing?.fareDetailsBySegment?.[0];
      const cabin = fareDetails?.cabin || 'ECONOMY';

      return {
        id: flight.id,
        airline: airlineName,
        airlineCode: carrierCode,
        flightNumber: `${carrierCode}-${firstSegment.number}`,
        price: price,
        duration: totalDuration,
        departure: departure,
        arrival: arrival,
        stops: stops,
        stopDetails: stops > 0 ? firstItinerary.segments.slice(0, -1).map(seg => ({
          airport: seg.arrival.iataCode,
          duration: seg.duration || 'Unknown'
        })) : [],
        aircraft: aircraft[firstSegment.aircraft?.code] || firstSegment.aircraft?.code || 'Unknown',
        cabin: cabin,
        baggage: fareDetails?.includedCheckedBags?.weight
          ? `${fareDetails.includedCheckedBags.weight}${fareDetails.includedCheckedBags.weightUnit || 'kg'}`
          : '23kg',
        refundable: travelerPricing?.price?.refundableTaxes ? true : false,
        seats: 'Available',
        originalOffer: flight // Keep original for booking
      };
    } catch (error) {
      console.error('Error transforming flight offer:', error);
      return null;
    }
  }).filter(Boolean);
};

// Flight search endpoint
router.post('/search', async (req, res) => {
  try {
    console.log('🔍 Flight search request received:', req.body);

    const { from, to, departDate, returnDate, tripType, travelers } = req.body;

    // Validate required fields
    if (!from || !to || !departDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, and departDate are required'
      });
    }

    // Check if Amadeus credentials are available
    const { apiKey, apiSecret } = getAmadeusCredentials();
    console.log('Checking Amadeus credentials:', {
      key: apiKey ? 'Available' : 'Missing',
      secret: apiSecret ? 'Available' : 'Missing'
    });

    if (!apiKey || !apiSecret) {
      console.error('❌ Missing Amadeus API credentials');
      return res.status(500).json({
        success: false,
        error: 'Amadeus API credentials not configured. Please contact support.'
      });
    }

    console.log('✅ Amadeus credentials found, proceeding with real API call');

    // Prepare search parameters
    const searchParams = {
      from,
      to,
      departDate,
      returnDate: returnDate && returnDate.trim() !== '' ? returnDate : undefined,
      travelers: parseInt(travelers) || 1,
      max: 20
    };

    console.log('Searching flights with params:', searchParams);

    try {
      // Call real Amadeus API
      const amadeusResponse = await AmadeusService.searchFlights(searchParams);

      if (!amadeusResponse.success) {
        throw new Error(amadeusResponse.error);
      }

      console.log(`✅ Amadeus API returned ${amadeusResponse.data?.length || 0} flight offers`);

      if (!amadeusResponse.data || amadeusResponse.data.length === 0) {
        return res.json({
          success: true,
          data: [],
          message: 'No flights found for the specified route and date.'
        });
      }

      // Transform Amadeus response to frontend format
      const transformedFlights = transformAmadeusFlightData(
        amadeusResponse.data,
        amadeusResponse.dictionaries
      );

      console.log(`✅ Transformed ${transformedFlights.length} flights for frontend`);

      res.json({
        success: true,
        data: transformedFlights,
        meta: {
          searchParams: searchParams,
          resultCount: transformedFlights.length,
          totalResults: amadeusResponse.data.length,
          source: 'amadeus-production-api'
        }
      });

    } catch (amadeusError) {
      console.error('❌ Amadeus API error:', amadeusError);

      // Return detailed error information
      return res.status(500).json({
        success: false,
        error: 'Flight search failed',
        details: amadeusError.message || 'Unable to search flights at this time',
        code: amadeusError.code || 500
      });
    }
  } catch (error) {
    console.error('❌ Error in flight search:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Flight pricing endpoint
router.post('/price', async (req, res) => {
  try {
    console.log('💰 Flight pricing request received');

    const { flightOffer } = req.body;

    if (!flightOffer) {
      return res.status(400).json({
        success: false,
        error: 'Flight offer is required for pricing'
      });
    }

    const pricingResponse = await AmadeusService.priceFlightOffer(flightOffer);

    if (!pricingResponse.success) {
      throw new Error(pricingResponse.error);
    }

    res.json({
      success: true,
      data: pricingResponse.data,
      message: 'Flight priced successfully'
    });

  } catch (error) {
    console.error('❌ Flight pricing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to price flight'
    });
  }
});

// Flight order creation endpoint
router.post('/order', async (req, res) => {
  try {
    console.log('📋 Flight order creation request received');
    console.log('Request body keys:', Object.keys(req.body));

    const { flightOffer, flightOffers, travelers, payments, contactInfo, totalAmount, transactionId, amount } = req.body;

    // Accept both flightOffer (singular) and flightOffers (plural)
    const offers = flightOffers || (flightOffer ? [flightOffer] : null);

    if (!offers || !travelers) {
      console.error('❌ Missing required fields:', {
        hasOffers: !!offers,
        hasTravelers: !!travelers,
        receivedKeys: Object.keys(req.body)
      });
      return res.status(400).json({
        success: false,
        error: 'Flight offers and travelers are required'
      });
    }

    console.log('✅ Valid request - offers:', offers.length, 'travelers:', travelers.length);

    // Check if the flight offer is in valid Amadeus format
    // Our transformed UI format has: segments, airline.code, departure.time
    // Amadeus format needs: itineraries, source, validatingAirlineCodes, travelerPricings
    const firstOffer = offers[0];
    const isValidAmadeusOffer = firstOffer &&
      firstOffer.itineraries &&
      Array.isArray(firstOffer.itineraries) &&
      firstOffer.source &&
      firstOffer.travelerPricings;

    console.log('📋 Offer validation:', {
      hasItineraries: !!firstOffer?.itineraries,
      hasSource: !!firstOffer?.source,
      hasTravelerPricings: !!firstOffer?.travelerPricings,
      isValidAmadeusOffer
    });

    // If not a valid Amadeus offer, generate mock booking
    if (!isValidAmadeusOffer) {
      console.log('🧪 Flight offer is in UI format (not Amadeus format), generating mock booking...');

      const mockPNR = generateMockPNR();
      const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const bookingReference = `BOOK-${Date.now().toString(36).toUpperCase()}`;

      // Extract price - prioritize from destructured request body, then from flight offer
      const finalAmount = totalAmount || amount || firstOffer?.price?.total || firstOffer?.price?.amount || firstOffer?.totalPrice?.amount || '0';
      const currency = firstOffer?.price?.currency || firstOffer?.totalPrice?.currency || 'USD';

      console.log('💰 Amount for booking:', {
        fromTotalAmount: totalAmount,
        fromAmount: amount,
        fromFlightOfferPriceTotal: firstOffer?.price?.total,
        fromFlightOfferPriceAmount: firstOffer?.price?.amount,
        finalAmount: finalAmount
      });

      // Extract flight details for database
      const firstSegment = firstOffer?.segments?.[0] || firstOffer?.itineraries?.[0]?.segments?.[0] || {};
      const lastSegment = firstOffer?.segments?.[firstOffer?.segments?.length - 1] || firstSegment;

      console.log(`✅ Mock booking created: PNR=${mockPNR}, OrderID=${orderId}`);

      // Save booking to database
      const dbBooking = await saveBookingToDatabase({
        bookingReference: bookingReference,
        pnr: mockPNR,
        orderId: orderId,
        transactionId: transactionId || `TXN-${Date.now()}`,
        totalAmount: finalAmount,
        origin: firstSegment.departure?.airport || firstOffer?.origin || firstOffer?.departure?.airport || '',
        destination: lastSegment.arrival?.airport || firstOffer?.destination || firstOffer?.arrival?.airport || '',
        departureDate: firstSegment.departure?.date || firstOffer?.departureDate || '',
        departureTime: firstSegment.departure?.time || firstOffer?.departureTime || '',
        arrivalTime: lastSegment.arrival?.time || firstOffer?.arrivalTime || '',
        airline: firstSegment.airline?.code || firstOffer?.airline?.code || '',
        airlineName: firstSegment.airline?.name || firstOffer?.airline?.name || '',
        flightNumber: firstOffer?.flightNumber || '',
        duration: firstOffer?.duration || '',
        cabinClass: firstOffer?.cabinClass || firstOffer?.travelClass || 'ECONOMY',
        travelers: travelers.map((t, i) => ({
          id: `${i + 1}`,
          firstName: t.firstName || 'Guest',
          lastName: t.lastName || 'User',
          dateOfBirth: t.dateOfBirth,
          gender: t.gender
        })),
        flightOffer: firstOffer,
        userId: req.body.userId || null
      });

      console.log('📝 Database save result:', dbBooking ? 'Success' : 'Skipped/Failed');

      return res.json({
        success: true,
        data: {
          id: orderId,
          orderId: orderId,
          pnr: mockPNR,
          status: 'CONFIRMED',
          bookingReference: bookingReference,
          flightOffers: offers,
          travelers: travelers.map((t, i) => ({
            id: `${i + 1}`,
            name: { firstName: t.firstName || 'Guest', lastName: t.lastName || 'User' }
          })),
          totalPrice: { amount: totalAmount, currency: currency },
          createdAt: new Date().toISOString(),
          databaseId: dbBooking?.id || null
        },
        pnr: mockPNR,
        orderId: orderId,
        bookingReference: bookingReference,
        mode: 'MOCK_DEMO_BOOKING',
        savedToDatabase: !!dbBooking,
        message: 'Demo booking created successfully with mock PNR (real Amadeus booking requires original offer data)'
      });
    }

    // Prepare flight order data for Amadeus (only if we have valid Amadeus format)
    // The travelers from frontend are already in correct format: { id, firstName, lastName, dateOfBirth, gender }
    // But Amadeus needs name.firstName and name.lastName
    const amadeusTravelers = travelers.map((traveler, idx) => ({
      id: traveler.id || `${idx + 1}`,
      dateOfBirth: traveler.dateOfBirth || '1990-01-01',
      gender: (traveler.gender || 'MALE').toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE',
      name: {
        firstName: traveler.firstName || 'Test',
        lastName: traveler.lastName || 'User'
      },
      contact: contactInfo ? {
        emailAddress: contactInfo.email || travelers[0]?.email,
        phones: [{
          deviceType: 'MOBILE',
          countryCallingCode: contactInfo.countryCode || '1',
          number: contactInfo.phoneNumber || '1234567890'
        }]
      } : undefined
    }));

    const flightOrderData = {
      data: {
        type: 'flight-order',
        flightOffers: offers,
        travelers: amadeusTravelers
      }
    };

    console.log('📤 Sending to Amadeus:', JSON.stringify(flightOrderData, null, 2));

    const orderResponse = await AmadeusService.createFlightOrder(flightOrderData);

    if (!orderResponse.success) {
      throw new Error(orderResponse.error);
    }

    console.log('✅ Flight order created successfully');

    // Extract flight details for database from the first offer
    const firstItinerary = firstOffer?.itineraries?.[0];
    const firstSegment = firstItinerary?.segments?.[0] || {};
    const lastSegment = firstItinerary?.segments?.[firstItinerary?.segments?.length - 1] || firstSegment;
    const pnrValue = orderResponse.pnr || orderResponse.data?.associatedRecords?.[0]?.reference;
    const orderIdValue = orderResponse.orderId || orderResponse.data?.id;

    // Save real Amadeus booking to database
    const dbBooking = await saveBookingToDatabase({
      bookingReference: orderIdValue,
      pnr: pnrValue,
      orderId: orderIdValue,
      transactionId: req.body.transactionId || `TXN-${Date.now()}`,
      totalAmount: firstOffer?.price?.total || '0',
      origin: firstSegment.departure?.iataCode || '',
      destination: lastSegment.arrival?.iataCode || '',
      departureDate: firstSegment.departure?.at?.split('T')[0] || '',
      departureTime: firstSegment.departure?.at ? new Date(firstSegment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
      arrivalTime: lastSegment.arrival?.at ? new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
      airline: firstSegment.carrierCode || '',
      airlineName: firstOffer?.validatingAirlineCodes?.[0] || firstSegment.carrierCode || '',
      flightNumber: firstSegment.number ? `${firstSegment.carrierCode}${firstSegment.number}` : '',
      duration: firstItinerary?.duration || '',
      cabinClass: firstOffer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin || 'ECONOMY',
      travelers: amadeusTravelers.map((t) => ({
        id: t.id,
        firstName: t.name.firstName,
        lastName: t.name.lastName,
        dateOfBirth: t.dateOfBirth,
        gender: t.gender
      })),
      flightOffer: firstOffer,
      userId: req.body.userId || null
    });

    console.log('📝 Database save result:', dbBooking ? 'Success' : 'Skipped/Failed');

    res.json({
      success: true,
      data: orderResponse.data,
      pnr: pnrValue,
      orderId: orderIdValue,
      bookingReference: orderIdValue,
      mode: orderResponse.mode,
      savedToDatabase: !!dbBooking,
      message: orderResponse.message || 'Flight order created successfully'
    });

  } catch (error) {
    console.error('❌ Flight order creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create flight order'
    });
  }
});

// Get flight order details (with fallback simulation due to API limitations)
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Try real Amadeus API first
    try {
      const orderDetails = await AmadeusService.getFlightOrderDetails(orderId);

      if (orderDetails.success) {
        return res.json({
          success: true,
          data: orderDetails.data,
          pnr: orderDetails.pnr || orderDetails.data.associatedRecords?.[0]?.reference,
          orderId: orderId,
          mode: orderDetails.mode,
          message: orderDetails.mode === 'MOCK_STORAGE' ? 'Mock order retrieved successfully' : 'Flight order details retrieved successfully'
        });
      }
    } catch (amadeusError) {
      console.log('⚠️ Amadeus API unavailable, using simulation:', amadeusError.message);
    }

    // Fallback simulation for demonstration
    const simulatedOrderDetails = {
      id: orderId,
      status: "CONFIRMED",
      creationDate: "2025-06-19T19:05:00.000Z",
      bookingReference: `BOOK-${Date.now()}`,

      // PNR is found in associatedRecords
      associatedRecords: [{
        reference: "PNR" + Math.random().toString(36).substr(2, 6).toUpperCase(),
        creationDate: "2025-06-19T19:05:00.000Z",
        originSystemCode: "GDS",
        flightNumber: "AI-9731"
      }],

      flightOffers: [{
        id: "1",
        price: { total: "29.60", currency: "USD" },
        itineraries: [{
          segments: [{
            departure: { iataCode: "DEL", at: "2025-06-29T11:10:00" },
            arrival: { iataCode: "JAI", at: "2025-06-29T12:15:00" },
            carrierCode: "AI",
            number: "9731"
          }]
        }]
      }],

      travelers: [{
        id: "1",
        name: { firstName: "John", lastName: "Doe" },
        dateOfBirth: "1990-01-01"
      }],

      totalPrice: { amount: "29.60", currency: "USD" },
      bookingStatus: "CONFIRMED",
      paymentStatus: "COMPLETED"
    };

    const pnr = simulatedOrderDetails.associatedRecords?.[0]?.reference;

    res.json({
      success: true,
      data: simulatedOrderDetails,
      pnr: pnr,
      message: 'Order details retrieved (simulated)',
      note: 'Simulated response due to API limitations'
    });

  } catch (error) {
    console.error('❌ Error fetching flight order details:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch flight order details'
    });
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const { apiKey, apiSecret } = getAmadeusCredentials();

    res.json({
      success: true,
      service: 'Flight API',
      status: 'operational',
      credentials: {
        configured: !!(apiKey && apiSecret),
        keySource: apiKey ? 'Available' : 'Missing',
        secretSource: apiSecret ? 'Available' : 'Missing'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all bookings from database (for My Trips page)
router.get('/bookings', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured'
      });
    }

    // Filter by travel type if provided
    const { type, userId } = req.query;

    let query = supabase.from('bookings').select('*');

    if (type) {
      query = query.eq('travel_type', type);
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    // Order by created_at descending (newest first)
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching bookings:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // Transform database format to frontend format
    const transformedBookings = (data || []).map(booking => {
      // Get amount from total_amount column or from booking_details or from flight_offer
      const amount = booking.total_amount || 
                     booking.booking_details?.amount ||
                     booking.booking_details?.flight_offer?.price?.total ||
                     0;
      
      return {
        id: booking.id,
        type: booking.travel_type,
        bookingReference: booking.booking_reference,
        status: booking.status,
        totalAmount: parseFloat(amount) || 0,
        amount: parseFloat(amount) || 0, // Add both for compatibility
        currency: booking.booking_details?.currency || booking.booking_details?.flight_offer?.price?.currency || 'USD',
        paymentStatus: booking.payment_status,
        bookingDate: booking.created_at,
        // Spread booking_details
        pnr: booking.booking_details?.pnr,
        orderId: booking.booking_details?.order_id,
        transactionId: booking.booking_details?.transaction_id,
        origin: booking.booking_details?.origin,
        destination: booking.booking_details?.destination,
        departureDate: booking.booking_details?.departure_date,
        departureTime: booking.booking_details?.departure_time,
        arrivalTime: booking.booking_details?.arrival_time,
        airline: booking.booking_details?.airline,
        airlineName: booking.booking_details?.airline_name,
        flightNumber: booking.booking_details?.flight_number,
        duration: booking.booking_details?.duration,
        cabinClass: booking.booking_details?.cabin_class,
        // Travelers
        travelers: booking.passenger_details
      };
    });

    console.log(`✅ Fetched ${transformedBookings.length} bookings from database`);

    res.json({
      success: true,
      data: transformedBookings,
      count: transformedBookings.length
    });

  } catch (error) {
    console.error('❌ Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch bookings'
    });
  }
});

export default router;
