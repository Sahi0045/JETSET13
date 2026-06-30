import express from 'express';
import AmadeusService from '../services/amadeusService.js';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { get as cacheGet, set as cacheSet, withCache, CacheKeys, TTL } from '../services/cache.service.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { handleCancelBookingAction, reverseArcPaymentForOrder } from './payment/operations.handlers.js';

// Only the fields the handler genuinely requires; passthrough keeps the rest.
const flightSearchSchema = z
  .object({
    from: z.string().min(1, 'from is required'),
    to: z.string().min(1, 'to is required'),
    departDate: z.string().min(1, 'departDate is required'),
  })
  .passthrough();

const router = express.Router();

// Invoke the single orchestrated cancel handler (Amadeus cancel + ARC Pay refund/void +
// DB update + email) in-process — no HTTP self-call, so it works on Vercel serverless.
// Single source of truth for cancellation; returns that handler's response payload + status.
async function invokeOrchestratedCancel(bookingReference, reason) {
  let payload = null;
  let statusCode = 200;
  const fakeRes = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; }
  };
  await handleCancelBookingAction({ method: 'POST', body: { bookingReference, reason } }, fakeRes);
  return { statusCode, payload };
}

// Called when flight ticket issuance FAILS after the customer was already charged.
// Reverses the ARC payment (VOID/REFUND), marks the booking row as cancelled/refunded with
// the failure recorded, and returns an honest error — never fabricates a confirmed booking.
// Responds via `res`; returns the Express response.
async function refundOnFulfillmentFailure(res, { orderId, bookingReference, amount, currency = 'USD', errorMsg }) {
  console.warn('🚑 Ticket not booked after payment — reversing charge. order:', orderId, '| reason:', errorMsg);
  const reversal = await reverseArcPaymentForOrder(orderId, {
    amount,
    currency,
    reason: 'Flight booking failed after payment'
  });
  console.log('💸 Payment reversal result:', reversal.action, '| reversed:', reversal.reversed);

  // Record the failure on the booking row created at hosted-checkout (if any).
  try {
    const ref = bookingReference || orderId;
    if (supabase && ref) {
      const { data: bk } = await supabase
        .from('bookings')
        .select('*')
        .or(`booking_reference.eq.${ref},booking_details->>order_id.eq.${ref}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bk) {
        await supabase.from('bookings').update({
          status: 'cancelled',
          payment_status: reversal.reversed ? 'refunded' : bk.payment_status,
          booking_details: {
            ...bk.booking_details,
            fulfillment_failed: { at: new Date().toISOString(), error: errorMsg, reversal }
          },
          updated_at: new Date().toISOString()
        }).eq('id', bk.id);
      }
    }
  } catch (e) {
    console.error('⚠️ Could not update booking after fulfillment failure:', e.message);
  }

  const userMessage = reversal.reversed
    ? 'We could not confirm your flight booking, so your payment has been reversed. The amount will be returned to your original payment method.'
    : 'We could not confirm your flight booking. Your payment could not be auto-reversed and our team will process your refund shortly.';

  return res.status(502).json({
    success: false,
    bookingFailed: true,
    refunded: reversal.reversed,
    refundAction: reversal.action,                 // VOID | REFUND | ALREADY_REVERSED | NONE | FAILED
    refundAmount: reversal.amount ?? amount ?? null,
    error: userMessage,                            // FlightCreateOrders surfaces `.error` first
    message: userMessage,
    technicalError: errorMsg
  });
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
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
      // Real Amadeus order id — required to cancel the reservation via the GDS
      amadeus_order_id: bookingData.amadeusOrderId || null,
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
    passenger_details: bookingData.passengerData || bookingData.passengerDetails || bookingData.travelers || []
  };
}

// Helper to handle duplicate booking_reference
async function handleDuplicateBookingMerge(bookingData, rowTemplate) {
  console.log('🔄 Booking reference already exists, updating with merged data...');

  // Fetch existing booking to get ARC Pay session data
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingData.bookingReference)
    .single();

  // Merge: keep ARC Pay fields from existing booking_details, add new flight data
  const mergedDetails = {
    ...rowTemplate.booking_details,
    // Preserve ARC Pay data from the pending booking
    session_id: existingBooking?.booking_details?.session_id || rowTemplate.booking_details.session_id,
    success_indicator: existingBooking?.booking_details?.success_indicator || rowTemplate.booking_details.success_indicator,
    arc_pay_checkout_url: existingBooking?.booking_details?.arc_pay_checkout_url || rowTemplate.booking_details.arc_pay_checkout_url,
    checkout_created_at: existingBooking?.booking_details?.checkout_created_at || rowTemplate.booking_details.checkout_created_at,
  };

  const { data: updatedData, error: updateError } = await supabase
    .from('bookings')
    .update({
      ...rowTemplate,
      booking_details: mergedDetails,
    })
    .eq('booking_reference', bookingData.bookingReference)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Update with merged data failed:', updateError.message);
    return null;
  }

  console.log('✅ SUCCESS (merged)! Booking updated with ARC Pay data preserved:');
  console.log('   Database ID:', updatedData.id);
  console.log('   Session ID preserved:', mergedDetails.session_id || 'NONE');
  console.log('   Booking Reference:', updatedData.booking_reference);
  return updatedData;
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
      console.error('   User ID that was attempted:', bookingData.userId || 'null');

      // If duplicate key right away
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        return await handleDuplicateBookingMerge(bookingData, row);
      }

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
          // If the fallback hits duplicate key
          if (fallbackError.code === '23505' || fallbackError.message?.includes('duplicate key') || fallbackError.message?.includes('unique constraint')) {
            return await handleDuplicateBookingMerge(bookingData, fallbackRow);
          }
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
        // Richer Amadeus fare data surfaced to the UI
        amenities: fareDetails?.amenities || [],
        fareBasis: fareDetails?.fareBasis || null,
        bookingClass: fareDetails?.class || null,
        validatingAirlineCodes: flight.validatingAirlineCodes || [],
        originalOffer: flight // Keep original for booking
      };
    } catch (error) {
      console.error('Error transforming flight offer:', error);
      return null;
    }
  }).filter(Boolean);
};

// Build raw Amadeus-shaped flight offers for LOCAL TESTING only (e.g. when the Amadeus key
// is rate-limited). Returned through transformAmadeusFlightData so the shape — including
// `originalOffer` used by the booking step — matches a real search result exactly.
// Gated behind ENABLE_MOCK_FLIGHTS=true; never enable in production.
function buildMockFlightOffers(searchParams) {
  const from = String(searchParams.from || 'DEL').toUpperCase().slice(0, 3);
  const to = String(searchParams.to || 'BOM').toUpperCase().slice(0, 3);
  const date = String(searchParams.departDate || new Date().toISOString().split('T')[0]).split('T')[0];

  const mk = (id, carrier, num, depTime, arrTime, total, base, durH, durM, aircraft) => ({
    type: 'flight-offer',
    id: String(id),
    source: 'GDS',
    instantTicketingRequired: false,
    nonHomogeneous: false,
    oneWay: false,
    lastTicketingDate: date,
    numberOfBookableSeats: 9,
    itineraries: [{
      duration: `PT${durH}H${durM}M`,
      segments: [{
        departure: { iataCode: from, terminal: '3', at: `${date}T${depTime}:00` },
        arrival: { iataCode: to, terminal: '2', at: `${date}T${arrTime}:00` },
        carrierCode: carrier,
        number: num,
        aircraft: { code: aircraft },
        operating: { carrierCode: carrier },
        duration: `PT${durH}H${durM}M`,
        id: '1',
        numberOfStops: 0,
        blacklistedInEU: false
      }]
    }],
    price: {
      currency: 'USD',
      total: total.toFixed(2),
      base: base.toFixed(2),
      fees: [{ amount: '0.00', type: 'SUPPLIER' }, { amount: '0.00', type: 'TICKETING' }],
      grandTotal: total.toFixed(2)
    },
    pricingOptions: { fareType: ['PUBLISHED'], includedCheckedBagsOnly: true },
    validatingAirlineCodes: [carrier],
    travelerPricings: [{
      travelerId: '1',
      fareOption: 'STANDARD',
      travelerType: 'ADULT',
      price: { currency: 'USD', total: total.toFixed(2), base: base.toFixed(2) },
      fareDetailsBySegment: [{
        segmentId: '1',
        cabin: 'ECONOMY',
        fareBasis: 'ZZ1YXII',
        brandedFare: 'ECOVALUE',
        class: 'Z',
        includedCheckedBags: { quantity: 1 }
      }]
    }]
  });

  return [
    mk(1, 'AI', '131', '10:30', '12:45', 120, 90, 2, 15, '32N'),
    mk(2, '6E', '209', '18:05', '20:30', 99, 75, 2, 25, '320')
  ];
}

// Flight search endpoint
router.post('/search', validate({ body: flightSearchSchema }), async (req, res) => {
  try {
    console.log('🔍 Flight search request received:', req.body);

    const { from, to, departDate, returnDate, tripType, travelers } = req.body;

    // LOCAL TESTING: serve mock flights without calling Amadeus (e.g. when the API key is
    // rate-limited). Opt-in via ENABLE_MOCK_FLIGHTS=true — never set this in production.
    if (process.env.ENABLE_MOCK_FLIGHTS === 'true') {
      const mockParams = { from, to, departDate, returnDate, adults: parseInt(req.body.adults || travelers) || 1 };
      const mockFlights = transformAmadeusFlightData(buildMockFlightOffers(mockParams));
      console.log(`🧪 ENABLE_MOCK_FLIGHTS=true → returning ${mockFlights.length} mock flights (Amadeus skipped)`);
      return res.json({
        success: true,
        data: mockFlights,
        meta: { searchParams: mockParams, resultCount: mockFlights.length, source: 'mock' }
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
      // Call real Amadeus API (served from Redis cache when available; passthrough when not)
      const flightCacheKey = CacheKeys.flightSearch(
        searchParams.from,
        searchParams.to,
        `${searchParams.departDate}|${searchParams.returnDate || 'ow'}`,
        `${searchParams.adults}-${searchParams.children}-${searchParams.infants}-${searchParams.travelClass || 'any'}-${searchParams.nonStop ? 'ns' : 'any'}`
      );
      let amadeusResponse = await cacheGet(flightCacheKey);
      if (amadeusResponse) {
        console.log('✅ Flight search served from cache');
      } else {
        amadeusResponse = await AmadeusService.searchFlights(searchParams);
        // Only cache successful, non-empty results — never cache failures/empties
        if (amadeusResponse?.success && amadeusResponse.data?.length) {
          await cacheSet(flightCacheKey, amadeusResponse, TTL.FLIGHT_SEARCH);
        }
      }

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

// Branded-fare upsell endpoint — returns alternative fare families for an offer
router.post('/upsell', async (req, res) => {
  try {
    const { flightOffer } = req.body;

    if (!flightOffer) {
      return res.status(400).json({
        success: false,
        error: 'Flight offer is required for upsell'
      });
    }

    const upsellResponse = await AmadeusService.getBrandedFareUpsell(flightOffer);

    // Reuse the standard transform so fare options share the card data shape
    const options = transformAmadeusFlightData(
      upsellResponse.data || [],
      upsellResponse.dictionaries
    );

    res.json({
      success: true,
      data: options,
      meta: { count: options.length }
    });

  } catch (error) {
    console.error('❌ Branded-fare upsell error:', error);
    // Soft-fail: no upsell options just means the caller falls back to the base fare
    res.status(200).json({
      success: false,
      data: [],
      error: error.error || error.message || 'No fare options available'
    });
  }
});

// Date-wise lowest fares for the date strip (cheapest fare per day)
router.post('/date-prices', async (req, res) => {
  try {
    const { from, to, dates, adults, children, infants, travelClass } = req.body;

    if (!from || !to || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'from, to and a non-empty dates array are required'
      });
    }

    const cacheKey = CacheKeys.flightBrowse('date-prices', [from, to, (dates || []).join(','), adults, children, infants, travelClass]);
    const payload = await withCache(cacheKey, TTL.FLIGHT_CALENDAR, async () => {
      const resolvedFrom = await resolveToIATACode(from);
      const resolvedTo = await resolveToIATACode(to);

      // Cap dates (a month view sends ~31) and skip past dates
      const today = new Date().toISOString().split('T')[0];
      const limited = dates.slice(0, 35).filter((d) => d && d >= today);

      const probe = async (date) => {
        const r = await AmadeusService.searchFlights({
          from: resolvedFrom,
          to: resolvedTo,
          departDate: date,
          adults: parseInt(adults) || 1,
          children: parseInt(children) || 0,
          infants: parseInt(infants) || 0,
          travelClass: travelClass || undefined,
          max: 1, // Amadeus returns cheapest first
          currency: 'USD'
        });
        const offers = r.data || [];
        if (!offers.length) return { date, price: null };
        const min = Math.min(...offers.map(o => parseFloat(o.price?.total || o.price?.grandTotal || Infinity)));
        return { date, price: Number.isFinite(min) ? min : null };
      };

      // Throttle: process in batches to stay within Amadeus rate limits
      const dateWisePrices = {};
      const BATCH = 6;
      for (let i = 0; i < limited.length; i += BATCH) {
        const batch = limited.slice(i, i + BATCH);
        const settled = await Promise.allSettled(batch.map(probe));
        settled.forEach((r) => {
          if (r.status === 'fulfilled' && r.value && r.value.price != null) {
            dateWisePrices[r.value.date] = r.value.price;
          }
        });
      }

      const priceVals = Object.values(dateWisePrices);
      const lowestPrice = priceVals.length ? Math.min(...priceVals) : null;
      // Only cache when we actually got prices — never cache an empty result.
      return priceVals.length ? { dateWisePrices, lowestPrice } : null;
    });

    const out = payload || { dateWisePrices: {}, lowestPrice: null };
    res.json({ success: true, dateWisePrices: out.dateWisePrices, lowestPrice: out.lowestPrice, currency: 'USD' });

  } catch (error) {
    console.error('❌ Date-prices error:', error);
    res.status(200).json({ success: false, dateWisePrices: {}, lowestPrice: null });
  }
});

// Fare rules + extra-bag prices for a chosen flight offer
router.post('/fare-rules', async (req, res) => {
  try {
    const { flightOffer } = req.body;
    if (!flightOffer) {
      return res.status(400).json({ success: false, error: 'flightOffer is required' });
    }

    const priced = await AmadeusService.priceFlightOffer(flightOffer, {
      include: ['detailed-fare-rules', 'bags']
    });

    const included = priced.included || {};

    // Structured extra-baggage options
    const bags = Object.values(included.bags || {}).map((b) => ({
      quantity: b.quantity,
      name: b.name,
      price: b.price ? { amount: parseFloat(b.price.amount), currency: b.price.currencyCode } : null,
      segmentIds: b.segmentIds || [],
    }));

    // Fare-rule notes (free text) — surface penalty/general categories
    const rulesObj = included['detailed-fare-rules'] || {};
    const fareRules = [];
    Object.values(rulesObj).forEach((r) => {
      const descs = r.fareNotes?.descriptions || [];
      descs.forEach((d) => {
        if (d.text) fareRules.push({ title: d.descriptionType || 'INFORMATION', text: d.text });
      });
    });

    // ===== Derive a structured cancellation/change policy from the PENALTIES text =====
    const penaltyText = fareRules
      .filter((r) => /PENALT|CANCEL|REISSUE|CHANGE|REFUND/i.test((r.title || '') + ' ' + (r.text || '')))
      .map((r) => r.text)
      .join(' \n ')
      .toUpperCase();

    let cancellation = null;
    if (penaltyText) {
      // All "CHARGE <CUR> <amount>" occurrences with their position in the text
      const charges = [];
      const re = /CHARGE\s+([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/g;
      let m;
      while ((m = re.exec(penaltyText)) !== null) {
        charges.push({ currency: m[1], amount: Math.round(parseFloat(m[2].replace(/,/g, ''))), index: m.index });
      }

      const changeIdx = penaltyText.search(/CHANGE|REISSUE|REVALIDATION/);
      const cancelIdx = penaltyText.search(/CANCELLATION|CANCEL\b|REFUND/);

      const nearest = (anchor) => {
        if (anchor < 0 || charges.length === 0) return null;
        // first charge at/after the anchor, else the closest overall
        const after = charges.filter((c) => c.index >= anchor).sort((a, b) => a.index - b.index)[0];
        return after || charges[0];
      };

      const changeCharge = nearest(changeIdx);
      const cancelCharge = nearest(cancelIdx) || changeCharge;

      // Cutoff window, e.g. "TILL 02 HRS" / "WITHIN 4 HOURS" / "4 HOURS BEFORE"
      const cutoffMatch = penaltyText.match(/TILL\s+0?(\d{1,2})\s*HRS?/) ||
        penaltyText.match(/WITHIN\s+0?(\d{1,2})\s*H(?:OUR|RS?)/) ||
        penaltyText.match(/0?(\d{1,2})\s*HOURS?\s+(?:BEFORE|PRIOR)/);
      const cutoffHours = cutoffMatch ? parseInt(cutoffMatch[1], 10) : 4;

      const isNonRefundable = /NON[\s-]?REFUND/i.test(penaltyText);

      // Offer-level refundable flag + total
      const tp = flightOffer.travelerPricings?.[0];
      const refundableFlag = tp?.price?.refundableTaxes ? true : (isNonRefundable ? false : null);

      cancellation = {
        hasData: charges.length > 0 || cutoffMatch != null,
        currency: (cancelCharge || changeCharge)?.currency || 'INR',
        cutoffHours,
        changeFee: changeCharge?.amount ?? null,
        cancelFee: cancelCharge?.amount ?? null,
        refundable: refundableFlag,
        fareTotal: flightOffer.price ? parseFloat(flightOffer.price.grandTotal || flightOffer.price.total) : null,
        fareCurrency: flightOffer.price?.currency || null,
      };
    }

    res.json({ success: true, bags, fareRules: fareRules.slice(0, 8), cancellation });
  } catch (error) {
    console.error('❌ Fare-rules error:', error);
    res.status(200).json({ success: false, bags: [], fareRules: [] });
  }
});

// SeatMap Display — seat map for a chosen flight offer
router.post('/seatmaps', async (req, res) => {
  try {
    const { flightOffer } = req.body;
    if (!flightOffer) {
      return res.status(400).json({ success: false, error: 'flightOffer is required' });
    }

    // First attempt with the offer as received
    let result = await AmadeusService.getSeatMaps(flightOffer);

    // Amadeus offers expire fast — by the time the user reaches the booking page the
    // stored offer is often stale and the seat map comes back empty. Re-price the offer
    // (which returns a freshly validated copy) and retry once.
    if (!result?.data || result.data.length === 0) {
      try {
        const priced = await AmadeusService.priceFlightOffer(flightOffer);
        const refreshed = priced?.data?.flightOffers?.[0];
        if (refreshed) {
          const retry = await AmadeusService.getSeatMaps(refreshed);
          if (retry?.data && retry.data.length > 0) result = retry;
        }
      } catch (repriceErr) {
        console.warn('⚠️ SeatMap re-price retry failed:', repriceErr.error || repriceErr.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('❌ SeatMap error:', error);
    res.status(200).json({ success: false, data: [] });
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
        const orderId = req.body.orderId || `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const bookingReference = req.body.bookingReference || `BOOK-${Date.now().toString(36).toUpperCase()}`;

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
          amadeusOrderId: orderId,
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

        // --- Send Booking Confirmation Email ---
        if (dbBooking) {
          try {
            const { sendBookingNotificationEmails } = await import('../services/emailService.js');
            console.log('📧 Sending booking confirmation email (Mock)...');

            const firstTraveler = travelersList && travelersList.length > 0 ? travelersList[0] : null;
            let customerFirstName = firstTraveler?.firstName || 'Valued';
            let customerLastName = firstTraveler?.lastName || 'Customer';
            const customerName = `${customerFirstName} ${customerLastName}`.trim();

            // Find a valid email address (avoid empty strings)
            let finalEmail = contactInfo?.email || req.body.customerEmail || '';
            if (!finalEmail && firstTraveler?.email) finalEmail = firstTraveler.email;
            if (!finalEmail) finalEmail = 'guest@jetsetterss.com';

            const bookingEmailData = {
              customerEmail: finalEmail,
              customerName: customerName,
              bookingReference: dbBooking.booking_reference,
              bookingType: 'flight',
              paymentAmount: finalAmount,
              currency: currency,
              travelDate: dbBooking.booking_details?.departure_date_full || firstSegment?.departure?.date || '',
              passengers: travelersList.length || 1,
              bookingDetails: {
                origin: dbBooking.booking_details?.origin_city || firstSegment?.departure?.airport,
                destination: dbBooking.booking_details?.destination_city || lastSegment?.arrival?.airport,
                airline: dbBooking.booking_details?.airline_name || firstSegment?.airline?.name
              }
            };

            const emailResult = await sendBookingNotificationEmails(bookingEmailData);
            if (emailResult.success) {
              console.log('✅ Booking confirmation email sent successfully (Mock)');
            } else {
              console.warn('⚠️ Booking confirmation email sent with issues:', emailResult.error);
            }
          } catch (emailError) {
            console.error('❌ Failed to send booking confirmation email:', emailError.message);
          }
        }
        // ---------------------------------------

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

      // PRODUCTION: never fabricate a booking after a real charge — reverse the payment instead.
      if (process.env.NODE_ENV === 'production') {
        return await refundOnFulfillmentFailure(res, {
          orderId: req.body.orderId,
          bookingReference: req.body.bookingReference,
          amount: totalAmount || amount,
          currency: firstOffer?.price?.currency || 'USD',
          errorMsg: amadeusServiceError?.message || 'Amadeus booking failed'
        });
      }

      // Non-production only: create a mock booking as ultimate fallback (keeps dev/test flowing)
      const mockPNR = generateMockPNR();
      const orderId = req.body.orderId || `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const bookingReference = req.body.bookingReference || `BOOK-${Date.now().toString(36).toUpperCase()}`;

      console.log('🆘 Creating emergency fallback booking with mock PNR');

      const dbBooking = await saveBookingToDatabase({
        userId: userId || null,
        bookingReference: bookingReference,
        pnr: mockPNR,
        orderId: orderId,
        amadeusOrderId: orderId,
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

      // --- Send Booking Confirmation Email ---
      if (dbBooking) {
        try {
          const { sendBookingNotificationEmails } = await import('../services/emailService.js');
          console.log('📧 Sending booking confirmation email (Fallback)...');

          const mainTraveler = (amadeusTravelers && amadeusTravelers.length > 0) ? amadeusTravelers[0] : null;
          let customerFirstName = mainTraveler?.name?.firstName || 'Valued';
          let customerLastName = mainTraveler?.name?.lastName || 'Customer';
          const customerName = `${customerFirstName} ${customerLastName}`.trim();

          // Find a valid email address (avoid empty strings)
          let finalEmail = contactInfo?.email || req.body.customerEmail || '';
          if (!finalEmail && mainTraveler?.contact?.emailAddress) finalEmail = mainTraveler.contact.emailAddress;
          if (!finalEmail) finalEmail = 'guest@jetsetterss.com';

          const bookingEmailData = {
            customerEmail: finalEmail,
            customerName: customerName,
            bookingReference: dbBooking.booking_reference,
            bookingType: 'flight',
            paymentAmount: totalAmount || amount || '0',
            currency: 'USD',
            travelDate: dbBooking.booking_details?.departure_date_full || firstOffer?.itineraries?.[0]?.segments?.[0]?.departure?.at?.split('T')[0] || '',
            passengers: amadeusTravelers.length || 1,
            bookingDetails: {
              origin: dbBooking.booking_details?.origin_city || firstOffer?.itineraries?.[0]?.segments?.[0]?.departure?.iataCode,
              destination: dbBooking.booking_details?.destination_city || firstOffer?.itineraries?.[0]?.segments?.[firstOffer.itineraries[0].segments.length - 1]?.arrival?.iataCode,
              airline: dbBooking.booking_details?.airline_name || firstOffer?.validatingAirlineCodes?.[0]
            }
          };

          const emailResult = await sendBookingNotificationEmails(bookingEmailData);
          if (emailResult.success) {
            console.log('✅ Booking confirmation email sent successfully (Fallback)');
          } else {
            console.warn('⚠️ Booking confirmation email sent with issues:', emailResult.error);
          }
        } catch (emailError) {
          console.error('❌ Failed to send booking confirmation email:', emailError.message);
        }
      }
      // ---------------------------------------

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
      if (process.env.NODE_ENV === 'production') {
        return await refundOnFulfillmentFailure(res, {
          orderId: req.body.orderId,
          bookingReference: req.body.bookingReference,
          amount: totalAmount || amount,
          currency: firstOffer?.price?.currency || 'USD',
          errorMsg
        });
      }
      throw new Error(errorMsg);
    }

    console.log('✅ Flight order created successfully');

    // PRODUCTION: a "successful" MOCK response means no real ticket was issued — reverse the charge.
    if (process.env.NODE_ENV === 'production' && typeof orderResponse.mode === 'string' && orderResponse.mode.toUpperCase().includes('MOCK')) {
      console.error('❌ Amadeus returned a MOCK booking in production (no real ticket):', orderResponse.mode);
      return await refundOnFulfillmentFailure(res, {
        orderId: req.body.orderId,
        bookingReference: req.body.bookingReference,
        amount: totalAmount || amount,
        currency: firstOffer?.price?.currency || 'USD',
        errorMsg: `No real ticket issued (mode: ${orderResponse.mode})`
      });
    }

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
      bookingReference: req.body.bookingReference || orderIdValue,
      pnr: pnrValue,
      orderId: req.body.orderId || orderIdValue,
      amadeusOrderId: orderIdValue, // the real Amadeus order id (for cancellation)
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

    // --- Send Booking Confirmation Email ---
    if (dbBooking) {
      try {
        const { sendBookingNotificationEmails } = await import('../services/emailService.js');
        console.log('📧 Sending booking confirmation email...');

        // Extract traveler info
        const mainTraveler = (amadeusTravelers && amadeusTravelers.length > 0) ? amadeusTravelers[0] : null;
        const fallbackTraveler = (travelersList && travelersList.length > 0) ? travelersList[0] : null;

        let customerFirstName = 'Valued';
        let customerLastName = 'Customer';

        if (mainTraveler?.name?.firstName) {
          customerFirstName = mainTraveler.name.firstName;
          customerLastName = mainTraveler.name.lastName || '';
        } else if (fallbackTraveler?.firstName) {
          customerFirstName = fallbackTraveler.firstName;
          customerLastName = fallbackTraveler.lastName || '';
        }

        const customerName = `${customerFirstName} ${customerLastName}`.trim();

        // Find a valid email address (avoid empty strings)
        let finalEmail = contactInfo?.email || req.body.customerEmail || '';
        if (!finalEmail && fallbackTraveler?.email) finalEmail = fallbackTraveler.email;
        if (!finalEmail) finalEmail = 'guest@jetsetterss.com';

        const bookingEmailData = {
          customerEmail: finalEmail,
          customerName: customerName,
          bookingReference: dbBooking.booking_reference,
          bookingType: 'flight',
          paymentAmount: dbBooking.total_amount || firstOffer?.price?.total || '0',
          currency: dbBooking.currency || firstOffer?.price?.currency || 'USD',
          travelDate: dbBooking.booking_details?.departure_date_full || firstSegment?.departure?.at?.split('T')[0],
          passengers: amadeusTravelers.length || travelersList.length || 1,
          bookingDetails: {
            origin: dbBooking.booking_details?.origin_city || firstSegment?.departure?.iataCode,
            destination: dbBooking.booking_details?.destination_city || lastSegment?.arrival?.iataCode,
            airline: dbBooking.booking_details?.airline_name || firstOffer?.validatingAirlineCodes?.[0]
          }
        };

        const emailResult = await sendBookingNotificationEmails(bookingEmailData);
        if (emailResult.success) {
          console.log('✅ Booking confirmation email sent successfully');
        } else {
          console.warn('⚠️ Booking confirmation email sent with issues:', emailResult.error);
        }
      } catch (emailError) {
        console.error('❌ Failed to send booking confirmation email:', emailError.message);
      }
    }
    // ---------------------------------------

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

    // Delegate to the orchestrated cancel: it cancels the real Amadeus order (via the
    // stored amadeus_order_id), refunds/voids via ARC Pay, updates booking status, and
    // persists the full cancellation record. Single source of truth — called in-process
    // (no HTTP self-call) so it also works on Vercel serverless.
    try {
      const { payload: cancelResult } = await invokeOrchestratedCancel(orderId, 'Customer cancellation via flight order API');

      if (cancelResult?.success) {
        return res.json({
          success: true,
          message: cancelResult.message || `Order ${orderId} cancelled`,
          cancellation: cancelResult.cancellation,
          booking: cancelResult.booking,
          amadeusCancelled: cancelResult.cancellation?.amadeusCancelled ?? false,
          mode: 'ORCHESTRATED_CANCELLATION'
        });
      }

      console.warn('⚠️ Orchestrated cancel returned error:', cancelResult?.error);
    } catch (invokeError) {
      console.warn('⚠️ Orchestrated cancel failed:', invokeError.message);
    }

    // Fallback: mock-aware Amadeus cancel + DB status (no refund) if the orchestrator is unreachable
    let amadeusCancelled = false;
    if (supabase) {
      try {
        const { data: bk } = await supabase
          .from('bookings')
          .select('booking_details')
          .or(`booking_reference.eq.${orderId},booking_details->>order_id.eq.${orderId},booking_details->>amadeus_order_id.eq.${orderId}`)
          .limit(1)
          .maybeSingle();
        const amaId = bk?.booking_details?.amadeus_order_id || bk?.booking_details?.order_id || orderId;
        try {
          const r = await AmadeusService.cancelFlightOrder(amaId);
          amadeusCancelled = !!r?.success;
        } catch (e) {
          console.warn('⚠️ Fallback Amadeus cancel failed:', e.error || e.message);
        }
      } catch (lookupErr) {
        console.warn('⚠️ Booking lookup for cancellation failed:', lookupErr.message);
      }

      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .or(`booking_reference.eq.${orderId},booking_details->>` + `order_id.eq.${orderId}`);

      if (!error) {
        return res.json({
          success: true,
          message: `Order ${orderId} has been cancelled${amadeusCancelled ? '' : ' (refund pending manual processing)'}`,
          amadeusCancelled,
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

// Get a single booking by bookingReference (For Manage Booking page)
router.get('/bookings/:bookingRef', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const { bookingRef } = req.params;

    if (!bookingRef) {
      return res.status(400).json({
        success: false,
        error: 'No booking reference provided'
      });
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_reference', bookingRef)
      .single();

    if (error) {
      console.error(`❌ Error fetching booking ${bookingRef}:`, error.message);
      return res.status(error.code === 'PGRST116' ? 404 : 500).json({
        success: false,
        error: error.code === 'PGRST116' ? 'Booking not found' : error.message
      });
    }

    // Format for frontend
    const formattedBooking = {
      ...data.booking_details,
      status: data.status,
      payment_status: data.payment_status,
      bookingReference: data.booking_reference,
      type: data.travel_type,
      bookingDate: data.created_at,
      source: 'database'
    };

    res.json({
      success: true,
      data: formattedBooking
    });
  } catch (error) {
    console.error('❌ Get single booking check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve booking'
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
        amadeusOrderId: booking.booking_details?.amadeus_order_id || booking.booking_details?.order_id || null,
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
    const cacheKey = CacheKeys.flightBrowse('cheapest-dates', [origin, destination, departureDate, viewBy || 'DATE', oneWay, nonStop, duration]);
    const result = await withCache(cacheKey, TTL.FLIGHT_BROWSE, async () => {
      const r = await AmadeusService.getCheapestFlightDates(origin, destination, {
        departureDate,
        oneWay: oneWay === 'true',
        duration: duration ? parseInt(duration) : undefined,
        nonStop: nonStop === 'true',
        viewBy: viewBy || 'DATE'
      });
      // Only cache successful, non-empty responses — never cache failures/empties.
      return (r && r.success && Array.isArray(r.data) && r.data.length) ? r : null;
    });

    const out = result || { success: true, data: [], fallback: true };
    res.json({
      success: out.success,
      data: out.data || [],
      dictionaries: out.dictionaries,
      meta: out.meta
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
    const cacheKey = CacheKeys.flightBrowse('inspiration', [origin, departureDate, oneWay, duration, nonStop, maxPrice, viewBy || 'DATE', destination]);
    const result = await withCache(cacheKey, TTL.FLIGHT_BROWSE, async () => {
      const r = await AmadeusService.getFlightInspirations(origin, {
        departureDate,
        oneWay: oneWay === 'true',
        duration: duration ? parseInt(duration) : undefined,
        nonStop: nonStop === 'true',
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        viewBy: viewBy || 'DATE',
        destination
      });
      // Only cache successful, non-empty responses — never cache failures/empties.
      return (r && r.success && Array.isArray(r.data) && r.data.length) ? r : null;
    });

    const out = result || { success: false, data: [] };
    res.json({
      success: out.success,
      data: out.data || [],
      dictionaries: out.dictionaries,
      meta: out.meta
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
    const cacheKey = CacheKeys.flightBrowse('price-analysis', [origin, destination, departureDate, currencyCode || 'USD', oneWay]);
    const result = await withCache(cacheKey, TTL.FLIGHT_BROWSE, async () => {
      const r = await AmadeusService.getFlightPriceAnalysis(origin, destination, departureDate, {
        currencyCode: currencyCode || 'USD',
        oneWay: oneWay === 'true'
      });
      // Only cache successful, non-empty responses — never cache failures/empties.
      return (r && r.success && Array.isArray(r.data) && r.data.length) ? r : null;
    });

    const out = result || { success: false, data: [] };
    res.json({
      success: out.success,
      data: out.data || [],
      meta: out.meta
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

// ── Unified bookings (flight/hotel/cruise from `bookings` + packages from quotes) ──
// Normalize a `bookings` row to the shared admin shape.
function normalizeBookingRow(b) {
  const amount = b.total_amount || b.booking_details?.amount || b.booking_details?.flight_offer?.price?.total || 0;
  let customerName = 'N/A', customerEmail = '';
  if (Array.isArray(b.passenger_details) && b.passenger_details.length) {
    const p = b.passenger_details[0];
    customerName = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() || 'N/A';
    customerEmail = p.email || '';
  } else if (b.booking_details?.guest_info) {
    const g = b.booking_details.guest_info;
    customerName = `${g.firstName || g.first_name || ''} ${g.lastName || g.last_name || ''}`.trim() || customerName;
    customerEmail = g.email || '';
  } else if (b.booking_details?.contact?.email) {
    customerEmail = b.booking_details.contact.email;
  }
  const d = b.booking_details || {};
  const service =
    b.travel_type === 'hotel' ? (d.hotel_name || d.location || 'Hotel') :
    b.travel_type === 'cruise' ? (d.cruise_name || `${d.departure || ''}→${d.arrival || ''}`) :
    b.travel_type === 'flight' ? (`${d.origin || ''}${d.origin ? '→' : ''}${d.destination || ''}`.trim() || d.airline_name || 'Flight') :
    (d.destination || '');
  return {
    id: b.id, userId: b.user_id, type: b.travel_type,
    bookingReference: b.booking_reference,
    status: b.status, paymentStatus: b.payment_status,
    totalAmount: parseFloat(amount) || 0, currency: d.currency || 'USD',
    bookingDate: b.created_at, customerName, customerEmail,
    service,
    bookingDetails: d, passengerDetails: b.passenger_details, isPackage: false,
    arcOrderId: d.arc_order_id || d.order_id || b.booking_reference,
  };
}

// Fetch + normalize package "bookings" from the quote system.
async function fetchPackageBookings() {
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, quote_number, title, total_amount, currency, status, payment_status, inquiry_id, created_at')
    .neq('status', 'draft');
  if (!quotes || !quotes.length) return [];
  const inquiryIds = [...new Set(quotes.map((q) => q.inquiry_id).filter(Boolean))];
  let invById = {};
  if (inquiryIds.length) {
    const { data: inquiries } = await supabase
      .from('inquiries')
      .select('id, customer_name, customer_email, inquiry_type, package_destination, travel_details')
      .in('id', inquiryIds);
    invById = Object.fromEntries((inquiries || []).map((i) => [i.id, i]));
  }
  return quotes.map((q) => {
    const inv = invById[q.inquiry_id] || {};
    const status = q.status === 'paid' ? 'paid' : q.status === 'accepted' ? 'confirmed' : 'pending';
    return {
      id: q.id, type: 'package',
      bookingReference: q.quote_number || `QUOTE-${String(q.id).slice(0, 8)}`,
      status, paymentStatus: q.payment_status === 'completed' ? 'paid' : (q.payment_status || 'unpaid'),
      totalAmount: parseFloat(q.total_amount) || 0, currency: q.currency || 'USD',
      bookingDate: q.created_at,
      customerName: inv.customer_name || 'N/A', customerEmail: inv.customer_email || '',
      service: inv.package_destination || inv.travel_details?.destination || q.title || 'Package',
      isPackage: true, quoteId: q.id, inquiryId: q.inquiry_id,
    };
  });
}

// GET /api/flights/admin-bookings-all — every booking across all four services.
router.get('/admin-bookings-all', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database not configured' });
    const { type, status, payment_status, search, page = 1, limit = 50 } = req.query;

    let rows = [];
    if (type !== 'package') {
      let q = supabase.from('bookings').select('*');
      if (type && type !== 'all') q = q.eq('travel_type', type);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      rows = (data || []).map(normalizeBookingRow);
    }
    if (!type || type === 'all' || type === 'package') {
      rows = rows.concat(await fetchPackageBookings());
    }

    if (status && status !== 'all') rows = rows.filter((b) => b.status === status);
    if (payment_status && payment_status !== 'all') rows = rows.filter((b) => b.paymentStatus === payment_status);
    if (search) {
      const s = String(search).toLowerCase();
      rows = rows.filter((b) =>
        (b.bookingReference || '').toLowerCase().includes(s) ||
        (b.customerName || '').toLowerCase().includes(s) ||
        (b.customerEmail || '').toLowerCase().includes(s) ||
        (b.service || '').toLowerCase().includes(s));
    }
    rows.sort((a, b) => new Date(b.bookingDate || 0) - new Date(a.bookingDate || 0));

    const count = rows.length;
    const off = (parseInt(page) - 1) * parseInt(limit);
    const data = rows.slice(off, off + parseInt(limit));
    res.json({ success: true, data, count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) || 1 });
  } catch (error) {
    console.error('❌ Unified bookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/flights/admin-bookings-stats — real revenue + counts, broken down by service.
router.get('/admin-bookings-stats', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database not configured' });
    const byType = {};
    const ensure = (t) => (byType[t] = byType[t] || { count: 0, revenue: 0, paid: 0 });
    let totalRevenue = 0, totalBookings = 0, paidBookings = 0, pendingBookings = 0;
    const byStatus = {};

    const { data: bookings } = await supabase
      .from('bookings').select('travel_type, status, payment_status, total_amount');
    for (const b of bookings || []) {
      const t = b.travel_type || 'other';
      ensure(t); byType[t].count += 1; totalBookings += 1;
      byStatus[b.status] = (byStatus[b.status] || 0) + 1;
      if (b.payment_status === 'paid') {
        const amt = parseFloat(b.total_amount) || 0;
        byType[t].revenue += amt; byType[t].paid += 1; totalRevenue += amt; paidBookings += 1;
      } else if (b.payment_status !== 'refunded') pendingBookings += 1;
    }

    const { data: quotes } = await supabase.from('quotes').select('total_amount, status, payment_status').neq('status', 'draft');
    ensure('package');
    for (const q of quotes || []) {
      byType.package.count += 1; totalBookings += 1;
      if (q.payment_status === 'completed' || q.status === 'paid') {
        const amt = parseFloat(q.total_amount) || 0;
        byType.package.revenue += amt; byType.package.paid += 1; totalRevenue += amt; paidBookings += 1;
      } else pendingBookings += 1;
    }

    Object.values(byType).forEach((v) => { v.revenue = +v.revenue.toFixed(2); });
    res.json({
      success: true,
      stats: { totalRevenue: +totalRevenue.toFixed(2), totalBookings, paidBookings, pendingBookings, byType, byStatus },
    });
  } catch (error) {
    console.error('❌ Bookings stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/flights/admin-customers — unified customer list across bookings + inquiries.
router.get('/admin-customers', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database not configured' });
    const { search } = req.query;

    const map = {}; // email(lower) → aggregate
    const ensure = (email, name, phone) => {
      const key = (email || '').toLowerCase().trim();
      if (!key) return null;
      if (!map[key]) map[key] = { name: name || '', email, phone: phone || '', bookings: 0, spent: 0, inquiries: 0, lastActivity: null };
      const c = map[key];
      if (name && !c.name) c.name = name;
      if (phone && !c.phone) c.phone = phone;
      return c;
    };
    const touch = (c, date) => { if (date && (!c.lastActivity || date > c.lastActivity)) c.lastActivity = date; };

    const { data: bookings } = await supabase.from('bookings').select('*').limit(5000);
    for (const b of bookings || []) {
      const n = normalizeBookingRow(b);
      const phone = b.booking_details?.contact?.phone || b.booking_details?.guest_info?.phone || '';
      const c = ensure(n.customerEmail, n.customerName !== 'N/A' ? n.customerName : '', phone);
      if (c) { c.bookings += 1; if (b.payment_status === 'paid') c.spent += parseFloat(n.totalAmount) || 0; touch(c, b.created_at); }
    }

    const { data: inquiries } = await supabase
      .from('inquiries').select('customer_name, customer_email, customer_phone, created_at').limit(5000);
    for (const i of inquiries || []) {
      const c = ensure(i.customer_email, i.customer_name, i.customer_phone);
      if (c) { c.inquiries += 1; touch(c, i.created_at); }
    }

    let customers = Object.values(map);
    if (search) {
      const s = String(search).toLowerCase();
      customers = customers.filter((c) =>
        (c.name || '').toLowerCase().includes(s) ||
        (c.email || '').toLowerCase().includes(s) ||
        (c.phone || '').includes(s));
    }
    customers.forEach((c) => { c.spent = +c.spent.toFixed(2); });
    customers.sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));

    const totalSpent = customers.reduce((s, c) => s + c.spent, 0);
    res.json({
      success: true,
      data: customers,
      count: customers.length,
      summary: { totalCustomers: customers.length, totalSpent: +totalSpent.toFixed(2) },
    });
  } catch (error) {
    console.error('❌ Admin customers error:', error);
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

    // Delegate to the single orchestrated cancel handler (Amadeus cancel + ARC Pay
    // refund/void + DB update + email). No HTTP self-call, so it works on serverless.
    const bookingRef = booking.booking_reference || booking.booking_details?.order_id;
    const { statusCode, payload } = await invokeOrchestratedCancel(bookingRef, reason);

    if (!payload?.success) {
      return res.status(statusCode || 500).json(payload || { success: false, error: 'Cancellation failed' });
    }

    console.log('✅ Admin booking cancelled:', id, 'Payment action:', payload.cancellation?.paymentAction);

    res.json({
      success: true,
      message: `Booking ${bookingRef} cancelled successfully`,
      data: {
        bookingId: id,
        bookingReference: bookingRef,
        previousStatus: booking.status,
        newStatus: 'cancelled',
        reason,
        cancellation: payload.cancellation
      }
    });
  } catch (error) {
    console.error('❌ Admin booking cancel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
