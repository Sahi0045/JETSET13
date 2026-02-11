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
          flight_offer: bookingData.flightOffer,
          // Fare breakdown for itemized display & refund support
          fare_breakdown: bookingData.fareBreakdown || null
        },
        passenger_details: bookingData.passengerDetails || bookingData.travelers
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
            ? `${fareDetails.includedCheckedBags.weight}${fareDetails.includedCheckedBags.weightUnit || 'kg'}`
            : '23kg',
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

    const { flightOffer, flightOffers, travelers, payments, contactInfo, totalAmount, transactionId, amount, fareBreakdown, passengerDetails } = req.body;

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
      totalAmount: totalAmount || amount
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

// Cancel a flight order
router.delete('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(`🗑️ Cancel flight order request: ${orderId}`);

    // Try real Amadeus cancellation first
    try {
      const result = await AmadeusService.cancelFlightOrder(orderId);
      if (result.success) {
        // Also update database status if available
        if (supabase) {
          await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .or(`booking_reference.eq.${orderId},booking_details->>order_id.eq.${orderId}`);
        }

        return res.json({
          success: true,
          message: result.message,
          mode: result.mode || 'AMADEUS_CANCELLATION'
        });
      }
    } catch (cancelError) {
      console.log('⚠️ Amadeus cancellation failed, updating database status:', cancelError.error || cancelError.message);
    }

    // Fallback: just mark as cancelled in our database
    if (supabase) {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .or(`booking_reference.eq.${orderId},booking_details->>order_id.eq.${orderId}`);

      if (!error) {
        return res.json({
          success: true,
          message: `Order ${orderId} has been cancelled in the system`,
          mode: 'DATABASE_CANCELLATION'
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

export default router;
