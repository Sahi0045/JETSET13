import express from 'express';
import AmadeusService from '../services/amadeusService.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://qqmagqwumjipdqvxbiqu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Log Supabase configuration status on module load
if (supabase) {
  console.log('✅ Supabase client initialized successfully');
  console.log('   URL:', supabaseUrl);
  console.log('   Key source:', supabaseKey ? (process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' :
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' :
      'SUPABASE_ANON_KEY') : 'None');
} else {
  console.error('❌ CRITICAL: Supabase client NOT initialized! Database saves will fail!');
  console.error('   Available env vars:');
  console.error('   - SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
  console.error('   - NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
  console.error('   - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
}

// Helper function to build the booking row object for insert
function buildBookingRow(bookingData, userId) {
  return {
    user_id: userId || null,
    booking_reference: bookingData.bookingReference,
    travel_type: 'flight',
    status: 'confirmed',
    total_amount: parseFloat(bookingData.totalAmount) || 0,
    payment_status: 'paid',
    booking_details: {
      pnr: bookingData.pnr,
      order_id: bookingData.orderId,
      transaction_id: bookingData.transactionId,
      amount: parseFloat(bookingData.totalAmount) || 0,
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
      // Amadeus enriched fields
      departure_terminal: bookingData.departureTerminal || '',
      arrival_terminal: bookingData.arrivalTerminal || '',
      aircraft: bookingData.aircraft || '',
      stops: bookingData.stops ?? 0,
      stop_details: bookingData.stopDetails || [],
      branded_fare: bookingData.brandedFare || null,
      branded_fare_label: bookingData.brandedFareLabel || null,
      operating_carrier: bookingData.operatingCarrier || null,
      operating_airline_name: bookingData.operatingAirlineName || null,
      last_ticketing_date: bookingData.lastTicketingDate || null,
      number_of_bookable_seats: bookingData.numberOfBookableSeats || null,
      refundable: bookingData.refundable || false,
      baggage_details: bookingData.baggageDetails || null,
      baggage: bookingData.baggage || null,
      origin_city: bookingData.originCity || '',
      destination_city: bookingData.destinationCity || '',
      departure_date_full: bookingData.departureDateFull || '',
      arrival_date: bookingData.arrivalDate || '',
      price_base: bookingData.priceBase || null,
      price_grand_total: bookingData.priceGrandTotal || null,
      price_fees: bookingData.priceFees || [],
      flight_offer: bookingData.flightOffer,
      // Fare breakdown for itemized display & refund support
      fare_breakdown: bookingData.fareBreakdown || null,
      // Store the original userId in booking_details so we can identify the user
      // even if user_id column is null (FK constraint fallback)
      original_user_id: bookingData.userId || null
    },
    passenger_details: bookingData.passengerDetails || bookingData.travelers
  };
}

// Helper function to save booking to database
async function saveBookingToDatabase(bookingData) {
  if (!supabase) {
    console.error('❌ CRITICAL: Supabase not configured! Bookings will NOT be saved to database!');
    console.error('   Please check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
    return null;
  }

  console.log('💾 Attempting to save booking to database...');
  console.log('   User ID:', bookingData.userId || 'NULL (GUEST USER)');
  console.log('   Booking Reference:', bookingData.bookingReference);
  console.log('   PNR:', bookingData.pnr);

  try {
    // First attempt: insert with the provided userId
    const row = buildBookingRow(bookingData, bookingData.userId);
    const { data, error } = await supabase
      .from('bookings')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('❌ ERROR saving booking to database:');
      console.error('   Error Code:', error.code);
      console.error('   Error Message:', error.message);
      console.error('   Error Details:', JSON.stringify(error, null, 2));
      console.error('   User ID that was attempted:', bookingData.userId || 'null');

      // If the error is a FK violation (user_id not in auth.users) or RLS policy
      // violation, retry without user_id so the booking is still saved
      if (bookingData.userId && (error.code === '23503' || error.code === '42501' || error.message?.includes('violates foreign key') || error.message?.includes('row-level security'))) {
        console.log('🔄 Retrying booking save without user_id (FK/RLS constraint issue)...');
        const fallbackRow = buildBookingRow(bookingData, null);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('bookings')
          .insert(fallbackRow)
          .select()
          .single();

        if (fallbackError) {
          console.error('❌ Fallback save also failed:', fallbackError.message);
          return null;
        }

        console.log('✅ SUCCESS (fallback)! Booking saved without user_id:');
        console.log('   Database ID:', fallbackData.id);
        console.log('   Original User ID stored in booking_details:', bookingData.userId);
        console.log('   Booking Reference:', fallbackData.booking_reference);
        return fallbackData;
      }

      return null;
    }

    console.log('✅ SUCCESS! Booking saved to database:');
    console.log('   Database ID:', data.id);
    console.log('   User ID:', data.user_id);
    console.log('   Booking Reference:', data.booking_reference);
    return data;
  } catch (err) {
    console.error('❌ EXCEPTION in database save:');
    console.error('   Error:', err.message);
    console.error('   Stack:', err.stack);
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

// Common city name to IATA code mapping for resolving non-IATA inputs
const CITY_TO_IATA = {
  // Major international cities
  'new york': 'JFK', 'new delhi': 'DEL', 'los angeles': 'LAX', 'san francisco': 'SFO',
  'chicago': 'ORD', 'miami': 'MIA', 'london': 'LHR', 'paris': 'CDG', 'tokyo': 'NRT',
  'dubai': 'DXB', 'singapore': 'SIN', 'hong kong': 'HKG', 'bangkok': 'BKK',
  'sydney': 'SYD', 'toronto': 'YYZ', 'mumbai': 'BOM', 'bangalore': 'BLR',
  'hyderabad': 'HYD', 'chennai': 'MAA', 'kolkata': 'CCU', 'goa': 'GOI',
  'jaipur': 'JAI', 'ahmedabad': 'AMD', 'pune': 'PNQ', 'kochi': 'COK',
  'beijing': 'PEK', 'shanghai': 'PVG', 'seoul': 'ICN', 'istanbul': 'IST',
  'rome': 'FCO', 'amsterdam': 'AMS', 'frankfurt': 'FRA', 'berlin': 'BER',
  'madrid': 'MAD', 'barcelona': 'BCN', 'kuala lumpur': 'KUL', 'bali': 'DPS',
  'maldives': 'MLE', 'phuket': 'HKT', 'kathmandu': 'KTM', 'colombo': 'CMB',
  'doha': 'DOH', 'abu dhabi': 'AUH', 'riyadh': 'RUH', 'cairo': 'CAI',
  'nairobi': 'NBO', 'johannesburg': 'JNB', 'sao paulo': 'GRU', 'mexico city': 'MEX',
  'dallas': 'DFW', 'houston': 'IAH', 'seattle': 'SEA', 'boston': 'BOS',
  'washington': 'IAD', 'atlanta': 'ATL', 'denver': 'DEN', 'las vegas': 'LAS',
  'orlando': 'MCO', 'philadelphia': 'PHL', 'vancouver': 'YVR', 'melbourne': 'MEL',
  'auckland': 'AKL', 'delhi': 'DEL', 'bombay': 'BOM', 'calcutta': 'CCU',
  'madras': 'MAA', 'bengaluru': 'BLR', 'trivandrum': 'TRV', 'lucknow': 'LKO',
  'chandigarh': 'IXC', 'indore': 'IDR', 'varanasi': 'VNS', 'amritsar': 'ATQ',
  'patna': 'PAT', 'mangalore': 'IXE', 'coimbatore': 'CJB', 'srinagar': 'SXR',
  'udaipur': 'UDR', 'jodhpur': 'JDH',
};

/**
 * Resolve a location string to an IATA code.
 * If it's already 3 uppercase letters, return as-is.
 * Otherwise try the static map, then fall back to Amadeus location search.
 */
const resolveToIATACode = async (location) => {
  if (!location) return location;

  // Already an IATA code (3 uppercase letters)
  if (/^[A-Z]{3}$/.test(location)) return location;

  // Try static map (case-insensitive)
  const lower = location.toLowerCase().trim();
  if (CITY_TO_IATA[lower]) {
    console.log(`📍 Resolved "${location}" -> ${CITY_TO_IATA[lower]} (static map)`);
    return CITY_TO_IATA[lower];
  }

  // Try Amadeus location search API as fallback
  try {
    const result = await AmadeusService.searchLocations(location, 'CITY,AIRPORT', { limit: 1 });
    if (result.success && result.data?.length > 0) {
      const code = result.data[0].code;
      console.log(`📍 Resolved "${location}" -> ${code} (Amadeus API)`);
      return code;
    }
  } catch (err) {
    console.warn(`⚠️ Could not resolve "${location}" via Amadeus API:`, err.message);
  }

  // Return as-is if nothing matched (will likely fail at Amadeus, but gives a clear error)
  console.warn(`⚠️ Could not resolve "${location}" to IATA code, passing as-is`);
  return location;
};

// Transform Amadeus API response to frontend format
const transformAmadeusFlightData = (flights, dictionaries = {}) => {
  if (!flights || flights.length === 0) return [];

  const airlines = dictionaries?.carriers || {};
  const airports = dictionaries?.locations || {};
  const aircraft = dictionaries?.aircraft || {};

  return flights.map((flight, index) => {
    try {
      const firstItinerary = flight.itineraries[0];
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

      // Calculate stops and layover details
      const segments = firstItinerary.segments;
      const stops = Math.max(0, segments.length - 1);

      let stopDetails = [];
      if (stops > 0) {
        stopDetails = segments.slice(0, -1).map((seg, index) => {
          const nextSeg = segments[index + 1];
          const arrivalTime = new Date(seg.arrival.at);
          const departureTime = new Date(nextSeg.departure.at);
          const diffMs = departureTime - arrivalTime;

          const hours = Math.floor(diffMs / 3600000);
          const minutes = Math.floor((diffMs % 3600000) / 60000);
          const durationStr = `${hours}h ${minutes}m`;

          return {
            airport: seg.arrival.iataCode,
            terminal: seg.arrival.terminal || '',
            arrivalAt: seg.arrival.at,
            departureAt: nextSeg.departure.at,
            duration: durationStr,
            waitingTime: durationStr // explicit alias for clarity
          };
        });
      }

      // Get pricing info
      const price = {
        total: flight.price?.total || '0',
        amount: parseFloat(flight.price?.total || 0),
        currency: flight.price?.currency || 'USD',
        base: flight.price?.base || '0',
        grandTotal: flight.price?.grandTotal || flight.price?.total || '0',
        fees: flight.price?.fees || []
      };

      // Get traveler pricing for cabin class
      const travelerPricing = flight.travelerPricings?.[0];
      const fareDetails = travelerPricing?.fareDetailsBySegment?.[0];

      if (index === 0) {
        console.log('DEBUG: First flight travelerPricing:', JSON.stringify(travelerPricing, null, 2));
      }

      // Check all segments to find the highest cabin class
      const allCabins = travelerPricing?.fareDetailsBySegment?.map(f => f.cabin) || [];
      const cabinPriority = { 'FIRST': 4, 'BUSINESS': 3, 'PREMIUM_ECONOMY': 2, 'ECONOMY': 1 };

      const cabin = allCabins.reduce((prev, current) => {
        return (cabinPriority[current] || 0) > (cabinPriority[prev] || 0) ? current : prev;
      }, 'ECONOMY');

      // Extract branded fare info
      const brandedFare = fareDetails?.brandedFare || null;
      const brandedFareLabel = fareDetails?.brandedFareLabel || null;

      // Extract operating carrier (codeshare info)
      const operatingCarrier = firstSegment.operating?.carrierCode || null;
      const operatingAirlineName = operatingCarrier ? (airlines[operatingCarrier] || operatingCarrier) : null;

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
        stopDetails: stopDetails,
        aircraft: aircraft[firstSegment.aircraft?.code] || firstSegment.aircraft?.code || 'Unknown',
        cabin: cabin,
        brandedFare: brandedFare,
        brandedFareLabel: brandedFareLabel,
        operatingCarrier: operatingCarrier,
        operatingAirlineName: operatingAirlineName,
        lastTicketingDate: flight.lastTicketingDate || null,
        numberOfBookableSeats: flight.numberOfBookableSeats || null,
        baggage: fareDetails?.includedCheckedBags?.weight
          ? `${fareDetails.includedCheckedBags.weight} ${fareDetails.includedCheckedBags.weightUnit || 'KG'}`
          : (fareDetails?.includedCheckedBags?.quantity
            ? `${fareDetails.includedCheckedBags.quantity} ${fareDetails.includedCheckedBags.quantity === 1 ? 'Piece' : 'Pieces'}`
            : null),
        baggageDetails: {
          checked: fareDetails?.includedCheckedBags || null,
          cabin: fareDetails?.includedCabinBags || null
        },
        refundable: travelerPricing?.price?.refundableTaxes ? true : false,
        seats: flight.numberOfBookableSeats || 'Available',
        isUpsellOffer: flight.isUpsellOffer || false,
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

    // Resolve city names to IATA codes (handles cases like "New York" -> "JFK")
    const resolvedFrom = await resolveToIATACode(from);
    const resolvedTo = await resolveToIATACode(to);
    console.log(`📍 Resolved locations: from="${from}" -> "${resolvedFrom}", to="${to}" -> "${resolvedTo}"`);

    // Prepare search parameters
    const searchParams = {
      from: resolvedFrom,
      to: resolvedTo,
      departDate,
      returnDate: returnDate && returnDate.trim() !== '' ? returnDate : undefined,
      adults: parseInt(req.body.adults || travelers) || 1,
      children: parseInt(req.body.children) || 0,
      infants: parseInt(req.body.infants) || 0,
      max: 50,
      travelClass: req.body.travelClass,
      nonStop: req.body.nonStop === 'true' || req.body.nonStop === true,
      maxPrice: req.body.maxPrice,
      includedAirlineCodes: req.body.includedAirlineCodes,
      excludedAirlineCodes: req.body.excludedAirlineCodes
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
      return res.status(amadeusError.code || 500).json({
        success: false,
        error: 'Flight search failed',
        details: amadeusError.error || amadeusError.message || 'Unable to search flights at this time',
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

    const { flightOffer, flightOffers, travelers, payments, contactInfo, totalAmount, transactionId, amount, fareBreakdown, passengerDetails, userId } = req.body;

    // Accept both flightOffer (singular) and flightOffers (plural)
    const offers = flightOffers || (flightOffer ? [flightOffer] : null);

    // Ensure travelers is always an array (even if empty) to prevent validation errors
    const travelersList = Array.isArray(travelers) ? travelers : (travelers ? [travelers] : []);

    console.log('📋 Validating request:', {
      hasOffers: !!offers,
      offersCount: offers?.length || 0,
      hasTravelers: !!travelers,
      travelersListCount: travelersList.length,
      hasContactInfo: !!contactInfo,
      totalAmount: totalAmount || amount,
      userId: userId || 'Not provided'
    });

    if (!offers) {
      console.error('❌ Missing required fields:', {
        hasOffers: !!offers,
        hasTravelers: !!travelers,
        hasTravelersList: travelersList.length > 0,
        receivedKeys: Object.keys(req.body)
      });
      return res.status(400).json({
        success: false,
        error: 'Flight offers are required'
      });
    }

    console.log('✅ Valid request - offers:', offers.length, 'travelers:', travelersList.length);

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

      try {
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

        // Save booking to database with all Amadeus fields
        const dbBooking = await saveBookingToDatabase({
          userId: userId || null,
          bookingReference: bookingReference,
          pnr: mockPNR,
          orderId: orderId,
          transactionId: transactionId || `TXN-${Date.now()}`,
          totalAmount: finalAmount,
          currency: firstOffer?.price?.currency || 'USD',
          origin: firstSegment.departure?.airport || firstOffer?.origin || firstOffer?.departure?.airport || '',
          destination: lastSegment.arrival?.airport || firstOffer?.destination || firstOffer?.arrival?.airport || '',
          departureDate: firstSegment.departure?.date || firstOffer?.departureDate || '',
          departureTime: firstSegment.departure?.time || firstOffer?.departureTime || '',
          arrivalTime: lastSegment.arrival?.time || firstOffer?.arrivalTime || '',
          arrivalDate: lastSegment.arrival?.date || firstOffer?.arrivalDate || '',
          airline: firstSegment.airline?.code || firstOffer?.airline?.code || firstOffer?.airlineCode || '',
          airlineName: firstSegment.airline?.name || firstOffer?.airline?.name || firstOffer?.airline || '',
          flightNumber: firstOffer?.flightNumber || '',
          duration: firstOffer?.duration || '',
          cabinClass: firstOffer?.cabinClass || firstOffer?.travelClass || firstOffer?.cabin || 'ECONOMY',
          departureTerminal: firstSegment.departure?.terminal || firstOffer?.departure?.terminal || '',
          arrivalTerminal: lastSegment.arrival?.terminal || firstOffer?.arrival?.terminal || '',
          aircraft: firstOffer?.aircraft || '',
          stops: firstOffer?.stops ?? 0,
          stopDetails: firstOffer?.stopDetails || [],
          brandedFare: firstOffer?.brandedFare || null,
          brandedFareLabel: firstOffer?.brandedFareLabel || null,
          operatingCarrier: firstOffer?.operatingCarrier || null,
          operatingAirlineName: firstOffer?.operatingAirlineName || null,
          lastTicketingDate: firstOffer?.lastTicketingDate || null,
          numberOfBookableSeats: firstOffer?.numberOfBookableSeats || null,
          refundable: firstOffer?.refundable || false,
          baggageDetails: firstOffer?.baggageDetails || null,
          baggage: firstOffer?.baggage || null,
          originCity: firstOffer?.departure?.cityName || '',
          destinationCity: firstOffer?.arrival?.cityName || '',
          priceBase: firstOffer?.price?.base || null,
          priceGrandTotal: firstOffer?.price?.grandTotal || firstOffer?.price?.total || null,
          priceFees: firstOffer?.price?.fees || [],
          fareBreakdown: fareBreakdown || null,
          passengerDetails: passengerDetails || travelersList.map((t, i) => ({
            id: `${i + 1}`,
            firstName: t.firstName || 'Guest',
            lastName: t.lastName || 'User',
            dateOfBirth: t.dateOfBirth,
            gender: t.gender,
            title: t.title || '',
            mobile: t.mobile || '',
            email: t.email || '',
            seatNumber: t.seatNumber || '',
            meal: t.meal || '',
            baggage: t.baggage || '',
            requiresWheelchair: t.requiresWheelchair || false
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
            travelers: travelersList.map((t, i) => ({
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
      } catch (mockError) {
        console.error('❌ Error creating mock booking:', mockError);
        console.error('❌ Mock booking error details:', {
          message: mockError.message,
          stack: mockError.stack,
          firstOffer: firstOffer
        });
        throw new Error(`Failed to create mock booking: ${mockError.message}`);
      }
    }

    // Prepare flight order data for Amadeus (only if we have valid Amadeus format)
    // The travelers from frontend are already in correct format: { id, firstName, lastName, dateOfBirth, gender }
    // But Amadeus needs name.firstName and name.lastName
    const amadeusTravelers = travelersList.map((traveler, idx) => {
      const travelerObj = {
        id: traveler.id || `${idx + 1}`,
        dateOfBirth: traveler.dateOfBirth || '1990-01-01',
        gender: (traveler.gender || 'MALE').toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE',
        name: {
          firstName: traveler.firstName || 'Test',
          lastName: traveler.lastName || 'User'
        },
        contact: contactInfo ? {
          emailAddress: contactInfo.email || travelersList[0]?.email,
          phones: [{
            deviceType: 'MOBILE',
            countryCallingCode: contactInfo.countryCode || '1',
            number: contactInfo.phoneNumber || '1234567890'
          }]
        } : undefined
      };

      // Add passport/document details if provided
      if (traveler.passportNumber || traveler.documentNumber) {
        travelerObj.documents = [{
          documentType: traveler.documentType || 'PASSPORT',
          birthPlace: traveler.birthPlace || '',
          issuanceLocation: traveler.issuanceLocation || '',
          issuanceDate: traveler.issuanceDate || '',
          number: traveler.passportNumber || traveler.documentNumber || '',
          expiryDate: traveler.passportExpiry || traveler.expiryDate || '',
          issuanceCountry: traveler.issuanceCountry || traveler.nationality || '',
          validityCountry: traveler.validityCountry || traveler.nationality || '',
          nationality: traveler.nationality || '',
          holder: true
        }];
      }

      return travelerObj;
    });

    // Price the flight offer before creating order (validates offer is still valid)
    let pricedOffer = offers[0];
    try {
      console.log('💰 Pricing flight offer before booking...');
      const pricingResult = await AmadeusService.priceFlightOffer(offers[0]);
      if (pricingResult.success && pricingResult.data?.flightOffers?.[0]) {
        pricedOffer = pricingResult.data.flightOffers[0];
        console.log('✅ Flight offer priced successfully, using priced version');
      } else {
        console.log('⚠️ Pricing failed, proceeding with original offer');
      }
    } catch (pricingError) {
      console.log('⚠️ Pricing step failed, proceeding with original offer:', pricingError.message || pricingError.error);
    }

    const flightOrderData = {
      data: {
        type: 'flight-order',
        flightOffers: [pricedOffer],
        travelers: amadeusTravelers,
        ticketingAgreement: {
          option: 'DELAY_TO_CANCEL',
          delay: '6D'
        },
        contacts: [{
          addresseeName: {
            firstName: amadeusTravelers[0]?.name?.firstName || 'Guest',
            lastName: amadeusTravelers[0]?.name?.lastName || 'User'
          },
          purpose: 'STANDARD',
          phones: amadeusTravelers[0]?.contact?.phones || [{
            deviceType: 'MOBILE',
            countryCallingCode: '1',
            number: '1234567890'
          }],
          emailAddress: contactInfo?.email || travelersList[0]?.email || 'guest@jetsetters.com'
        }]
      }
    };

    console.log('📤 Sending to Amadeus:', JSON.stringify(flightOrderData, null, 2));

    // Wrap Amadeus service call in try-catch to handle errors gracefully
    let orderResponse;
    try {
      orderResponse = await AmadeusService.createFlightOrder(flightOrderData);
      console.log('✅ Amadeus service call completed:', {
        success: orderResponse?.success,
        mode: orderResponse?.mode,
        hasPnr: !!orderResponse?.pnr
      });
    } catch (amadeusServiceError) {
      console.error('❌ AmadeusService.createFlightOrder threw an error:', amadeusServiceError);

      // If Amadeus service completely fails, create a mock booking as ultimate fallback
      const mockPNR = generateMockPNR();
      const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const bookingReference = `BOOK-${Date.now().toString(36).toUpperCase()}`;

      console.log('🆘 Creating emergency fallback booking with mock PNR');

      const dbBooking = await saveBookingToDatabase({
        userId: userId || null,
        bookingReference: bookingReference,
        pnr: mockPNR,
        orderId: orderId,
        transactionId: req.body.transactionId || `TXN-${Date.now()}`,
        totalAmount: totalAmount || amount || '0',
        origin: firstOffer?.itineraries?.[0]?.segments?.[0]?.departure?.iataCode || '',
        destination: firstOffer?.itineraries?.[0]?.segments?.[firstOffer.itineraries[0].segments.length - 1]?.arrival?.iataCode || '',
        departureDate: firstOffer?.itineraries?.[0]?.segments?.[0]?.departure?.at?.split('T')[0] || '',
        departureTime: '',
        arrivalTime: '',
        airline: firstOffer?.itineraries?.[0]?.segments?.[0]?.carrierCode || '',
        airlineName: firstOffer?.validatingAirlineCodes?.[0] || '',
        flightNumber: '',
        duration: firstOffer?.itineraries?.[0]?.duration || '',
        cabinClass: 'ECONOMY',
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

      return res.json({
        success: true,
        data: {
          id: orderId,
          orderId: orderId,
          pnr: mockPNR,
          status: 'CONFIRMED',
          bookingReference: bookingReference,
          travelers: amadeusTravelers
        },
        pnr: mockPNR,
        orderId: orderId,
        bookingReference: bookingReference,
        mode: 'EMERGENCY_FALLBACK',
        savedToDatabase: !!dbBooking,
        message: 'Booking created with emergency fallback (service error)'
      });
    }

    if (!orderResponse || !orderResponse.success) {
      const errorMsg = orderResponse?.error || 'Amadeus service returned unsuccessful response';
      console.error('❌ Amadeus order creation failed:', errorMsg);
      throw new Error(errorMsg);
    }

    console.log('✅ Flight order created successfully');

    // Extract flight details for database from the first offer
    const firstItinerary = firstOffer?.itineraries?.[0];
    const firstSegment = firstItinerary?.segments?.[0] || {};
    const lastSegment = firstItinerary?.segments?.[firstItinerary?.segments?.length - 1] || firstSegment;
    const pnrValue = orderResponse.pnr || orderResponse.data?.associatedRecords?.[0]?.reference;
    const orderIdValue = orderResponse.orderId || orderResponse.data?.id;

    // Extract Amadeus enriched fields
    const fareDetails = firstOffer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0];
    const allSegments = firstItinerary?.segments || [];
    const stopsCount = Math.max(0, allSegments.length - 1);
    let stopDetailsList = [];
    if (stopsCount > 0) {
      stopDetailsList = allSegments.slice(0, -1).map((seg, idx) => {
        const nextSeg = allSegments[idx + 1];
        return {
          airport: seg.arrival?.iataCode || '',
          terminal: seg.arrival?.terminal || '',
          duration: ''
        };
      });
    }

    // Save real Amadeus booking to database with all fields
    const dbBooking = await saveBookingToDatabase({
      userId: userId || null,
      bookingReference: orderIdValue,
      pnr: pnrValue,
      orderId: orderIdValue,
      transactionId: req.body.transactionId || `TXN-${Date.now()}`,
      totalAmount: firstOffer?.price?.total || '0',
      currency: firstOffer?.price?.currency || 'USD',
      origin: firstSegment.departure?.iataCode || '',
      destination: lastSegment.arrival?.iataCode || '',
      departureDate: firstSegment.departure?.at?.split('T')[0] || '',
      departureTime: firstSegment.departure?.at ? new Date(firstSegment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
      arrivalTime: lastSegment.arrival?.at ? new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
      arrivalDate: lastSegment.arrival?.at?.split('T')[0] || '',
      airline: firstSegment.carrierCode || '',
      airlineName: firstOffer?.validatingAirlineCodes?.[0] || firstSegment.carrierCode || '',
      flightNumber: firstSegment.number ? `${firstSegment.carrierCode}${firstSegment.number}` : '',
      duration: firstItinerary?.duration || '',
      cabinClass: fareDetails?.cabin || 'ECONOMY',
      departureTerminal: firstSegment.departure?.terminal || '',
      arrivalTerminal: lastSegment.arrival?.terminal || '',
      aircraft: firstSegment.aircraft?.code || '',
      stops: stopsCount,
      stopDetails: stopDetailsList,
      brandedFare: fareDetails?.brandedFare || null,
      brandedFareLabel: fareDetails?.brandedFareLabel || null,
      operatingCarrier: firstSegment.operating?.carrierCode || null,
      operatingAirlineName: firstSegment.operating?.carrierCode || null,
      lastTicketingDate: firstOffer?.lastTicketingDate || null,
      numberOfBookableSeats: firstOffer?.numberOfBookableSeats || null,
      refundable: firstOffer?.travelerPricings?.[0]?.price?.refundableTaxes ? true : false,
      baggageDetails: {
        checked: fareDetails?.includedCheckedBags || null,
        cabin: fareDetails?.includedCabinBags || null
      },
      baggage: fareDetails?.includedCheckedBags?.weight
        ? `${fareDetails.includedCheckedBags.weight}${fareDetails.includedCheckedBags.weightUnit || 'kg'}`
        : (fareDetails?.includedCheckedBags?.quantity ? `${fareDetails.includedCheckedBags.quantity} Piece(s)` : null),
      priceBase: firstOffer?.price?.base || null,
      priceGrandTotal: firstOffer?.price?.grandTotal || firstOffer?.price?.total || null,
      priceFees: firstOffer?.price?.fees || [],
      fareBreakdown: fareBreakdown || null,
      passengerDetails: passengerDetails || amadeusTravelers.map((t) => ({
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
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    console.error('❌ Request body that caused error:', JSON.stringify(req.body, null, 2));

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create flight order',
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Cancel a flight order — delegates to the orchestrated cancel-booking
// handler in payment.routes.js via internal request, which properly handles
// Amadeus cancellation + ARC Pay refund/void + DB update
router.delete('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(`🗑️ Cancel flight order request: ${orderId}`);

    // Use the same orchestrated cancel flow as ArcPayService.cancelBooking()
    // This ensures ARC Pay refund/void is properly called
    const paymentApiUrl = `${req.protocol}://${req.get('host')}/api/payments?action=cancel-booking`;

    try {
      const cancelResponse = await fetch(paymentApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingReference: orderId,
          reason: 'Customer cancellation via flight order API'
        })
      });

      const cancelResult = await cancelResponse.json();

      if (cancelResult.success) {
        return res.json({
          success: true,
          message: cancelResult.message || `Order ${orderId} cancelled`,
          cancellation: cancelResult.cancellation,
          booking: cancelResult.booking,
          mode: 'ORCHESTRATED_CANCELLATION'
        });
      }

      // If the orchestrated cancel returned an error (e.g. booking not found),
      // pass it through
      console.warn('⚠️ Orchestrated cancel returned error:', cancelResult.error);
    } catch (fetchError) {
      console.warn('⚠️ Could not reach orchestrated cancel endpoint:', fetchError.message);
    }

    // Fallback: direct Amadeus cancel + DB update (no ARC Pay refund)
    console.log('🔄 Falling back to direct cancellation (no ARC Pay refund)...');
    try {
      await AmadeusService.cancelFlightOrder(orderId);
    } catch (e) {
      console.warn('⚠️ Amadeus cancel failed:', e.message);
    }

    if (supabase) {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', payment_status: 'paid' })
        .or(`booking_reference.eq.${orderId},booking_details->>` + `order_id.eq.${orderId}`);

      if (!error) {
        return res.json({
          success: true,
          message: `Order ${orderId} has been cancelled (refund pending manual processing)`,
          mode: 'FALLBACK_CANCELLATION'
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Unable to cancel the order'
    });

  } catch (error) {
    console.error('❌ Cancel order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel flight order'
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

    // SECURITY: Require userId to prevent exposing all bookings
    if (!userId) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No user ID provided'
      });
    }

    let query = supabase.from('bookings').select('*');

    if (type) {
      query = query.eq('travel_type', type);
    }

    // Filter by user_id OR by original_user_id stored in booking_details
    // (fallback bookings where FK constraint prevented storing user_id directly)
    query = query.or(`user_id.eq.${userId},booking_details->>original_user_id.eq.${userId}`);

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
        // Core booking_details
        pnr: booking.booking_details?.pnr,
        orderId: booking.booking_details?.order_id,
        transactionId: booking.booking_details?.transaction_id,
        origin: booking.booking_details?.origin,
        destination: booking.booking_details?.destination,
        departureDate: booking.booking_details?.departure_date,
        departureTime: booking.booking_details?.departure_time,
        arrivalTime: booking.booking_details?.arrival_time,
        arrivalDate: booking.booking_details?.arrival_date,
        airline: booking.booking_details?.airline,
        airlineName: booking.booking_details?.airline_name,
        flightNumber: booking.booking_details?.flight_number,
        duration: booking.booking_details?.duration,
        cabinClass: booking.booking_details?.cabin_class,
        // Amadeus enriched fields
        departureTerminal: booking.booking_details?.departure_terminal || '',
        arrivalTerminal: booking.booking_details?.arrival_terminal || '',
        aircraft: booking.booking_details?.aircraft || '',
        stops: booking.booking_details?.stops ?? 0,
        stopDetails: booking.booking_details?.stop_details || [],
        brandedFare: booking.booking_details?.branded_fare || null,
        brandedFareLabel: booking.booking_details?.branded_fare_label || null,
        operatingCarrier: booking.booking_details?.operating_carrier || null,
        operatingAirlineName: booking.booking_details?.operating_airline_name || null,
        lastTicketingDate: booking.booking_details?.last_ticketing_date || null,
        numberOfBookableSeats: booking.booking_details?.number_of_bookable_seats || null,
        refundable: booking.booking_details?.refundable || false,
        baggageDetails: booking.booking_details?.baggage_details || null,
        baggage: booking.booking_details?.baggage || null,
        originCity: booking.booking_details?.origin_city || '',
        destinationCity: booking.booking_details?.destination_city || '',
        priceBase: booking.booking_details?.price_base || null,
        priceGrandTotal: booking.booking_details?.price_grand_total || null,
        priceFees: booking.booking_details?.price_fees || [],
        fareBreakdown: booking.booking_details?.fare_breakdown || null,
        // Travelers
        travelers: booking.passenger_details,
        // Cruise-specific fields
        cruiseName: booking.booking_details?.cruise_name || '',
        cruiseImage: booking.booking_details?.cruise_image || '',
        cruiseDepartureDate: booking.booking_details?.departure_date || '',
        cruiseReturnDate: booking.booking_details?.return_date || '',
        cruiseDeparture: booking.booking_details?.departure || '',
        cruiseArrival: booking.booking_details?.arrival || '',
        cruiseDuration: booking.booking_details?.duration || '',
        basePrice: booking.booking_details?.base_price || 0,
        taxesAndFees: booking.booking_details?.taxes_and_fees || 0,
        portCharges: booking.booking_details?.port_charges || 0
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

// ===== FLIGHT ANALYTICS ENDPOINTS =====

// Most Booked Destinations
router.get('/analytics/booked', async (req, res) => {
  try {
    const { origin, period } = req.query;

    if (!origin) {
      return res.status(400).json({ success: false, error: 'Origin city code is required' });
    }

    console.log(`📊 Analytics: Most booked from ${origin}`);
    const result = await AmadeusService.getMostBookedDestinations(origin, period);

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.json({ success: true, data: [], fallback: true, error: error.message });
  }
});

// Most Traveled Destinations
router.get('/analytics/traveled', async (req, res) => {
  try {
    const { origin, period } = req.query;

    if (!origin) {
      return res.status(400).json({ success: false, error: 'Origin city code is required' });
    }

    console.log(`📊 Analytics: Most traveled from ${origin}`);
    const result = await AmadeusService.getMostTraveledDestinations(origin, period);

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.json({ success: true, data: [], fallback: true, error: error.message });
  }
});

// Busiest Travel Period
router.get('/analytics/busiest', async (req, res) => {
  try {
    const { origin, year, direction } = req.query;

    if (!origin) {
      return res.status(400).json({ success: false, error: 'Origin city code is required' });
    }

    console.log(`📈 Analytics: Busiest period for ${origin}`);
    const result = await AmadeusService.getBusiestTravelPeriod(origin, year, direction || 'DEPARTING');

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.json({ success: true, data: [], fallback: true, error: error.message });
  }
});

// In-memory cache for calendar prices (origin-dest-date -> { price, timestamp })
const calendarPriceCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Cheapest Flight Dates
router.get('/cheapest-dates', async (req, res) => {
  try {
    const { origin, destination, departureDate, oneWay, duration, nonStop, viewBy } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({ success: false, error: 'Origin and destination are required' });
    }

    console.log(`💰 Cheapest dates: ${origin} → ${destination}`);
    const result = await AmadeusService.getCheapestFlightDates(origin, destination, {
      departureDate,
      oneWay: oneWay === 'true',
      duration: duration ? parseInt(duration) : undefined,
      nonStop: nonStop === 'true',
      viewBy: viewBy || 'DATE'
    });

    res.json({
      success: result.success,
      data: result.data || [],
      dictionaries: result.dictionaries,
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Cheapest dates error:', error);
    res.json({ success: true, data: [], fallback: true, error: error.message });
  }
});

// Calendar prices endpoint - fetches prices for multiple dates with caching
router.post('/calendar-prices', async (req, res) => {
  try {
    const { origin, destination, dates } = req.body;

    if (!origin || !destination || !dates || !Array.isArray(dates)) {
      return res.status(400).json({ success: false, error: 'origin, destination, and dates[] are required' });
    }

    console.log(`📅 Calendar prices: ${origin} → ${destination} for ${dates.length} dates`);

    const prices = {};
    const uncachedDates = [];

    // Check cache first
    for (const date of dates) {
      const cacheKey = `${origin}-${destination}-${date}`;
      const cached = calendarPriceCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        prices[date] = cached.price;
      } else {
        uncachedDates.push(date);
      }
    }

    console.log(`📅 Cache: ${dates.length - uncachedDates.length} hits, ${uncachedDates.length} misses`);

    // Fetch uncached dates sequentially with delay
    for (const date of uncachedDates) {
      try {
        const resolvedFrom = await resolveToIATACode(origin);
        const resolvedTo = await resolveToIATACode(destination);
        const result = await AmadeusService.searchFlights({
          from: resolvedFrom,
          to: resolvedTo,
          departDate: date,
          travelers: 1,
          max: 1
        });

        if (result.success && result.data && result.data.length > 0) {
          const cheapest = result.data.reduce((min, f) => {
            const p = parseFloat(f.price?.grandTotal || f.price?.total || 0);
            return p > 0 && p < min ? p : min;
          }, Infinity);
          if (cheapest < Infinity) {
            prices[date] = cheapest;
            calendarPriceCache.set(`${origin}-${destination}-${date}`, {
              price: cheapest,
              timestamp: Date.now()
            });
          }
        }

        // Delay between Amadeus calls to avoid rate limits
        if (uncachedDates.indexOf(date) < uncachedDates.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        console.warn(`📅 Failed to fetch price for ${date}:`, err.message);
      }
    }

    res.json({ success: true, prices });
  } catch (error) {
    console.error('❌ Calendar prices error:', error);
    res.json({ success: false, prices: {}, error: error.message });
  }
});

// Flight Status
router.get('/status', async (req, res) => {
  try {
    const { carrier, flightNumber, date } = req.query;

    if (!carrier || !flightNumber || !date) {
      return res.status(400).json({ success: false, error: 'Carrier, flightNumber, and date are required' });
    }

    console.log(`✈️ Flight status: ${carrier}${flightNumber} on ${date}`);
    const result = await AmadeusService.getFlightStatus(carrier, flightNumber, date);

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Flight status error:', error);
    res.json({ success: true, data: [], fallback: true, error: error.message });
  }
});

// Flight Availabilities
router.post('/availabilities', async (req, res) => {
  try {
    const { origin, destination, departureDate } = req.body;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({ success: false, error: 'Origin, destination, and departureDate are required' });
    }

    console.log(`🎫 Availabilities: ${origin} → ${destination}`);
    const result = await AmadeusService.getFlightAvailabilities({ origin, destination, departureDate });

    res.json({
      success: result.success,
      data: result.data || [],
      dictionaries: result.dictionaries,
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Availabilities error:', error);
    res.json({ success: true, data: [], fallback: true, error: error.message });
  }
});

// ===== AIRPORT & CITY SEARCH =====

// Airport/City search endpoint (exposed for frontend AirportService)
router.get('/airports/search', async (req, res) => {
  try {
    const { keyword, subType, countryCode, limit } = req.query;

    if (!keyword || keyword.length < 1) {
      return res.status(400).json({ success: false, error: 'keyword is required (min 1 char)' });
    }

    console.log(`🔍 Airport search: "${keyword}"`);
    const result = await AmadeusService.searchLocations(
      keyword,
      subType || 'CITY,AIRPORT',
      { countryCode, limit: parseInt(limit) || 10 }
    );

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Airport search error:', error);
    res.json({ success: false, data: [], error: error.message });
  }
});

// ===== FLIGHT INSPIRATION SEARCH =====

router.get('/inspiration', async (req, res) => {
  try {
    const { origin, departureDate, oneWay, duration, nonStop, maxPrice, viewBy, destination } = req.query;

    if (!origin) {
      return res.status(400).json({ success: false, error: 'Origin is required' });
    }

    console.log(`💡 Inspiration search from ${origin}`);
    const result = await AmadeusService.getFlightInspirations(origin, {
      departureDate,
      oneWay: oneWay === 'true',
      duration: duration ? parseInt(duration) : undefined,
      nonStop: nonStop === 'true',
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      viewBy: viewBy || 'DATE',
      destination
    });

    res.json({
      success: result.success,
      data: result.data || [],
      dictionaries: result.dictionaries,
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Inspiration search error:', error);
    res.json({ success: false, data: [], error: error.message });
  }
});

// ===== FLIGHT PRICE ANALYSIS =====

router.get('/price-analysis', async (req, res) => {
  try {
    const { origin, destination, departureDate, currencyCode, oneWay } = req.query;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({ success: false, error: 'origin, destination, and departureDate are required' });
    }

    console.log(`📊 Price analysis: ${origin} → ${destination} on ${departureDate}`);
    const result = await AmadeusService.getFlightPriceAnalysis(origin, destination, departureDate, {
      currencyCode: currencyCode || 'USD',
      oneWay: oneWay === 'true'
    });

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Price analysis error:', error);
    res.json({ success: false, data: [], error: error.message });
  }
});

// ============================================
// ADMIN BOOKINGS ENDPOINTS
// For viewing and managing all direct bookings
// ============================================

// GET all bookings for admin (no userId filter)
router.get('/admin-bookings', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { type, status, payment_status, search, page = 1, limit = 50 } = req.query;

    let query = supabase.from('bookings').select('*', { count: 'exact' });

    if (type && type !== 'all') {
      query = query.eq('travel_type', type);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (payment_status && payment_status !== 'all') {
      query = query.eq('payment_status', payment_status);
    }
    if (search) {
      query = query.ilike('booking_reference', `%${search}%`);
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error fetching admin bookings:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Transform bookings for admin view
    const bookings = (data || []).map(booking => {
      const amount = booking.total_amount ||
        booking.booking_details?.amount ||
        booking.booking_details?.flight_offer?.price?.total || 0;

      // Extract customer info from passenger_details or booking_details
      let customerName = 'N/A';
      let customerEmail = '';
      if (booking.passenger_details && Array.isArray(booking.passenger_details) && booking.passenger_details.length > 0) {
        const p = booking.passenger_details[0];
        customerName = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() || 'N/A';
        customerEmail = p.email || '';
      } else if (booking.booking_details?.contact?.email) {
        customerEmail = booking.booking_details.contact.email;
      }

      return {
        id: booking.id,
        userId: booking.user_id,
        type: booking.travel_type,
        bookingReference: booking.booking_reference,
        status: booking.status,
        totalAmount: parseFloat(amount) || 0,
        currency: booking.booking_details?.currency || 'USD',
        paymentStatus: booking.payment_status,
        bookingDate: booking.created_at,
        customerName,
        customerEmail,
        // Flight fields
        pnr: booking.booking_details?.pnr || '',
        origin: booking.booking_details?.origin || '',
        destination: booking.booking_details?.destination || '',
        departureDate: booking.booking_details?.departure_date || '',
        airline: booking.booking_details?.airline_name || booking.booking_details?.airline || '',
        // Cruise fields
        cruiseName: booking.booking_details?.cruise_name || '',
        cruiseDeparture: booking.booking_details?.departure || '',
        cruiseArrival: booking.booking_details?.arrival || '',
        // Raw details for expandable view
        bookingDetails: booking.booking_details,
        passengerDetails: booking.passenger_details,
        // Payment details for void/refund operations
        arcOrderId: booking.booking_details?.arc_order_id || booking.booking_details?.order_id || booking.booking_reference
      };
    });

    res.json({
      success: true,
      data: bookings,
      count: count || bookings.length,
      page: parseInt(page),
      totalPages: Math.ceil((count || bookings.length) / parseInt(limit))
    });
  } catch (error) {
    console.error('❌ Admin bookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT update booking status (admin)
router.put('/admin-bookings/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { id } = req.params;
    const { status, payment_status, notes } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (payment_status) updateData.payment_status = payment_status;
    if (notes) updateData.admin_notes = notes;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data, message: 'Booking updated successfully' });
  } catch (error) {
    console.error('❌ Admin booking update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST cancel booking (admin) — cancel via Amadeus + ARC Pay refund/void + DB update
router.post('/admin-bookings/:id/cancel', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { id } = req.params;
    const { reason = 'Admin cancellation' } = req.body;

    // Fetch booking
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking is already cancelled' });
    }

    // Direct ARC Pay cancel flow (no self-fetch — works on Vercel serverless)
    const bookingRef = booking.booking_reference || booking.booking_details?.order_id;
    const arcPayOrderId = booking.booking_details?.order_id || booking.booking_reference;

    // ARC Pay config
    const ARC_MERCHANT_ID = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
    const ARC_API_PASSWORD = process.env.ARC_PAY_API_PASSWORD;
    const ARC_BASE_URL = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77';
    const arcAuthHeader = 'Basic ' + Buffer.from(`merchant.${ARC_MERCHANT_ID}:${ARC_API_PASSWORD}`).toString('base64');
    const arcHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': arcAuthHeader };

    const cancellationResult = {
      bookingId: booking.id,
      bookingReference: bookingRef,
      amadeusCancelled: false,
      paymentProcessed: false,
      refundAmount: null,
      paymentAction: null,
      cancellationFee: 0
    };

    // 1. Cancel flight via Amadeus API
    try {
      const amadeus_client_id = process.env.AMADEUS_API_KEY || process.env.AMADEUS_CLIENT_ID;
      const amadeus_client_secret = process.env.AMADEUS_API_SECRET || process.env.AMADEUS_CLIENT_SECRET;
      const amadeus_base_url = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      if (amadeus_client_id && amadeus_client_secret) {
        const tokenResponse = await fetch(`${amadeus_base_url}/v1/security/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=client_credentials&client_id=${amadeus_client_id}&client_secret=${amadeus_client_secret}`
        });
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          const cancelResponse = await fetch(`${amadeus_base_url}/v1/booking/flight-orders/${bookingRef}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/vnd.amadeus+json' }
          });
          if (cancelResponse.ok || cancelResponse.status === 204) {
            console.log('✅ Amadeus flight order cancelled');
            cancellationResult.amadeusCancelled = true;
          } else {
            console.warn('⚠️ Amadeus cancellation failed:', cancelResponse.status);
          }
        }
      }
    } catch (amadeusError) {
      console.warn('⚠️ Amadeus cancellation error:', amadeusError.message);
    }

    // 2. Process refund/void via ARC Pay directly
    let cancellationFee = 0;
    try {
      const { data: priceSettings } = await supabase.from('price_settings').select('settings').single();
      cancellationFee = priceSettings?.settings?.cancellation_fee || 50.00;
    } catch (e) { cancellationFee = 50.00; }
    cancellationResult.cancellationFee = cancellationFee;

    if (booking.payment_status === 'paid' || booking.payment_status === 'completed') {
      try {
        // Look up the payment record
        const { data: payment } = await supabase
          .from('payments')
          .select('*')
          .or(`quote_id.eq.${booking.id},id.eq.${booking.payment_id || 'none'}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (payment) {
          const originalAmount = parseFloat(payment.amount || booking.total_amount || 0);
          const netRefundAmount = Math.max(0, originalAmount - cancellationFee);
          // CRITICAL: Use the ARC Pay order ID (FLT...), NOT the Supabase UUID
          const orderIdForArc = booking.booking_details?.order_id || payment.arc_order_id || booking.booking_reference || payment.id;
          console.log('🔑 ARC Pay Order ID for refund/void:', orderIdForArc);

          if ((payment.payment_status === 'completed' || payment.payment_status === 'paid') && netRefundAmount > 0) {
            // Issue partial REFUND (original - cancellation fee)
            const refundTxnId = `refund-admin-${Date.now()}`;
            const refundUrl = `${ARC_BASE_URL}/merchant/${ARC_MERCHANT_ID}/order/${orderIdForArc}/transaction/${refundTxnId}`;
            console.log('💸 Issuing REFUND:', netRefundAmount.toFixed(2));

            const refundResp = await fetch(refundUrl, {
              method: 'PUT',
              headers: arcHeaders,
              body: JSON.stringify({
                apiOperation: 'REFUND',
                transaction: {
                  amount: netRefundAmount.toFixed(2),
                  currency: payment.currency || 'USD',
                  reference: `Admin cancel refund (fee: ${cancellationFee}): ${reason}`
                }
              })
            });

            if (refundResp.ok) {
              console.log('✅ ARC Pay REFUND successful');
              cancellationResult.paymentProcessed = true;
              cancellationResult.paymentAction = 'PARTIAL_REFUND';
              cancellationResult.refundAmount = netRefundAmount;
              await supabase.from('payments').update({ payment_status: 'partially_refunded' }).eq('id', payment.id);
            } else {
              const errText = await refundResp.text();
              console.error('❌ ARC Pay REFUND failed:', refundResp.status, errText);
              cancellationResult.paymentAction = 'REFUND_FAILED';
            }
          } else if (payment.payment_status === 'pending' || payment.payment_status === 'authorized') {
            // VOID the authorization
            let targetTxnId = payment.arc_transaction_id;
            if (!targetTxnId) {
              try {
                const orderResp = await fetch(`${ARC_BASE_URL}/merchant/${ARC_MERCHANT_ID}/order/${orderIdForArc}`, { method: 'GET', headers: arcHeaders });
                if (orderResp.ok) {
                  const orderData = await orderResp.json();
                  const txns = orderData.transaction || [];
                  const payTxn = txns.find(t => t.transaction?.type === 'PAYMENT' || t.transaction?.type === 'AUTHORIZATION');
                  targetTxnId = payTxn?.transaction?.id || txns[txns.length - 1]?.transaction?.id;
                }
              } catch (e) { console.warn('⚠️ Could not retrieve order for txn ID:', e.message); }
            }
            if (targetTxnId) {
              const voidTxnId = `void-admin-${Date.now()}`;
              const voidUrl = `${ARC_BASE_URL}/merchant/${ARC_MERCHANT_ID}/order/${orderIdForArc}/transaction/${voidTxnId}`;
              console.log('🚫 Issuing VOID for transaction:', targetTxnId);
              const voidResp = await fetch(voidUrl, {
                method: 'PUT',
                headers: arcHeaders,
                body: JSON.stringify({ apiOperation: 'VOID', transaction: { targetTransactionId: targetTxnId, reference: `Admin cancel: ${reason}` } })
              });
              if (voidResp.ok) {
                console.log('✅ ARC Pay VOID successful');
                cancellationResult.paymentProcessed = true;
                cancellationResult.paymentAction = 'VOID';
                cancellationResult.refundAmount = originalAmount;
                cancellationResult.cancellationFee = 0;
                await supabase.from('payments').update({ payment_status: 'voided' }).eq('id', payment.id);
              } else {
                console.error('❌ ARC Pay VOID failed:', voidResp.status);
                cancellationResult.paymentAction = 'VOID_FAILED';
              }
            }
          } else if ((payment.payment_status === 'completed' || payment.payment_status === 'paid') && netRefundAmount <= 0) {
            cancellationResult.paymentProcessed = true;
            cancellationResult.paymentAction = 'NO_REFUND_FEE_COVERS';
            cancellationResult.refundAmount = 0;
            await supabase.from('payments').update({ payment_status: 'cancelled' }).eq('id', payment.id);
          }
        } else {
          // No payment record found — direct booking via hosted checkout
          // Use booking data directly for ARC Pay refund
          console.log('⚠️ No payment record found, using booking data for refund');
          const originalAmount = parseFloat(booking.total_amount || 0);
          const netRefundAmount = Math.max(0, originalAmount - cancellationFee);
          const orderIdForArc = booking.booking_details?.order_id || booking.booking_reference;
          console.log('🔑 ARC Pay Order ID (from booking):', orderIdForArc, 'Amount:', originalAmount, 'Net refund:', netRefundAmount);

          if (netRefundAmount > 0) {
            const refundTxnId = `refund-admin-${Date.now()}`;
            const refundUrl = `${ARC_BASE_URL}/merchant/${ARC_MERCHANT_ID}/order/${orderIdForArc}/transaction/${refundTxnId}`;
            console.log('💸 Issuing REFUND (no payment record):', netRefundAmount.toFixed(2));

            const refundResp = await fetch(refundUrl, {
              method: 'PUT',
              headers: arcHeaders,
              body: JSON.stringify({
                apiOperation: 'REFUND',
                transaction: {
                  amount: netRefundAmount.toFixed(2),
                  currency: 'USD',
                  reference: `Admin cancel refund (fee: ${cancellationFee}): ${reason}`
                }
              })
            });

            if (refundResp.ok) {
              console.log('✅ ARC Pay REFUND successful (no payment record)');
              cancellationResult.paymentProcessed = true;
              cancellationResult.paymentAction = 'PARTIAL_REFUND';
              cancellationResult.refundAmount = netRefundAmount;
            } else {
              const errText = await refundResp.text();
              console.error('❌ ARC Pay REFUND failed:', refundResp.status, errText);
              cancellationResult.paymentAction = 'REFUND_FAILED';
            }
          } else {
            // Fee covers the full amount
            cancellationResult.paymentProcessed = true;
            cancellationResult.paymentAction = 'NO_REFUND_FEE_COVERS';
            cancellationResult.refundAmount = 0;
          }
        }
      } catch (paymentError) {
        console.warn('⚠️ Payment refund/void error:', paymentError.message);
        cancellationResult.paymentAction = 'MANUAL_PROCESS_REQUIRED';
      }
    }

    // 3. Update booking status in DB
    // DB constraint: payment_status IN ('unpaid','partial','paid','refunded','partially_refunded')
    const newPaymentStatus = cancellationResult.paymentProcessed
      ? (cancellationResult.paymentAction === 'PARTIAL_REFUND' ? 'partially_refunded'
        : cancellationResult.paymentAction === 'VOID' ? 'refunded' : 'refunded')
      : (booking.payment_status === 'paid' ? 'paid' : booking.payment_status);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        payment_status: newPaymentStatus,
        booking_details: {
          ...booking.booking_details,
          cancellation: {
            cancelledAt: new Date().toISOString(),
            reason,
            adminCancelled: true,
            amadeusCancelled: cancellationResult.amadeusCancelled,
            paymentAction: cancellationResult.paymentAction,
            refundAmount: cancellationResult.refundAmount,
            cancellationFee: cancellationResult.cancellationFee,
            netRefund: cancellationResult.refundAmount || 0
          }
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message });
    }

    console.log('✅ Admin booking cancelled:', id, 'Payment action:', cancellationResult.paymentAction);

    res.json({
      success: true,
      message: `Booking ${bookingRef} cancelled successfully`,
      data: {
        bookingId: id,
        bookingReference: bookingRef,
        previousStatus: booking.status,
        newStatus: 'cancelled',
        reason,
        cancellation: cancellationResult
      }
    });
  } catch (error) {
    console.error('❌ Admin booking cancel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
