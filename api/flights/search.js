import AmadeusService from '../../backend/services/amadeusService.js';

// Common city name to IATA code mapping for resolving non-IATA inputs
const CITY_TO_IATA = {
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
async function resolveToIATACode(location) {
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

  // Return as-is (will fail IATA validation and give a clear error)
  console.warn(`⚠️ Could not resolve "${location}" to IATA code`);
  return location;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST method for flight search
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  // Debug: Check environment variables at the start
  const envDebug = {
    hasAmadeusKey: !!process.env.AMADEUS_API_KEY,
    hasAmadeusSecret: !!process.env.AMADEUS_API_SECRET,
    hasReactAmadeusKey: !!process.env.REACT_APP_AMADEUS_API_KEY,
    hasReactAmadeusSecret: !!process.env.REACT_APP_AMADEUS_API_SECRET,
    keyPrefix: process.env.AMADEUS_API_KEY?.substring(0, 5) || 'none'
  };
  console.log('🔑 Environment variables check:', envDebug);

  try {
    console.log('🔍 Flight search request received');
    console.log('Request body:', req.body);

    const { from: rawFrom, to: rawTo, departDate, returnDate, tripType, travelers, travelClass, max = 10 } = req.body;

    // Validate required fields
    if (!rawFrom || !rawTo || !departDate) {
      console.log('❌ Missing required fields:', { from: rawFrom, to: rawTo, departDate });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, and departDate are required'
      });
    }

    // Resolve city names to IATA codes before validation
    const from = await resolveToIATACode(rawFrom);
    const to = await resolveToIATACode(rawTo);
    if (rawFrom !== from || rawTo !== to) {
      console.log(`📍 Resolved locations: from="${rawFrom}" -> "${from}", to="${rawTo}" -> "${to}"`);
    }

    // Validate IATA codes (3-letter airport codes)
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid airport codes. Airport codes must be 3-letter IATA codes (e.g., DEL, JAI)',
        details: {
          from: !/^[A-Z]{3}$/.test(from) ? `Invalid origin airport code: "${rawFrom}"` : null,
          to: !/^[A-Z]{3}$/.test(to) ? `Invalid destination airport code: "${rawTo}"` : null
        }
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(departDate)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD format'
      });
    }

    // Check if departure date is in the future
    const today = new Date();
    const depDate = new Date(departDate);
    if (depDate < today.setHours(0, 0, 0, 0)) {
      return res.status(400).json({
        success: false,
        error: 'Departure date must be today or in the future'
      });
    }

    console.log('✅ Validation passed. Searching flights with Amadeus API...');
    console.log('🎫 Travel Class requested:', travelClass || 'ECONOMY (default)');

    // Prepare search parameters for Amadeus API
    const searchParams = {
      from,
      to,
      departDate,
      returnDate: returnDate && returnDate.trim() !== '' ? returnDate : undefined,
      travelers: parseInt(travelers) || 1,
      travelClass: travelClass || undefined, // ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
      max: parseInt(max) || 10
    };

    try {
      // Call real Amadeus API
      const amadeusResponse = await AmadeusService.searchFlights(searchParams);

      if (!amadeusResponse.success) {
        throw new Error(amadeusResponse.error);
      }

      console.log(`✅ Amadeus API returned ${amadeusResponse.data?.length || 0} flight offers`);

      if (!amadeusResponse.data || amadeusResponse.data.length === 0) {
        console.log('No flights found for the search criteria');
        return res.status(200).json({
          success: true,
          data: [],
          meta: {
            searchParams: searchParams,
            resultCount: 0,
            totalResults: 0,
            source: 'amadeus-production-api',
            message: 'No flights found for the specified route and date.'
          }
        });
      }

      // Transform Amadeus response to frontend format
      const transformedFlights = transformAmadeusFlightData(
        amadeusResponse.data,
        amadeusResponse.dictionaries
      );

      console.log(`✅ Transformed ${transformedFlights.length} flights for frontend`);

      return res.status(200).json({
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

      // Check if it's a credentials issue
      const isCredentialError = amadeusError.message?.includes('credentials') ||
        amadeusError.message?.includes('Missing Amadeus');

      return res.status(500).json({
        success: false,
        error: 'Flight search failed',
        details: amadeusError.message || 'Unable to search flights at this time',
        code: amadeusError.code || 500,
        debug: {
          hasApiKey: !!process.env.AMADEUS_API_KEY,
          hasApiSecret: !!process.env.AMADEUS_API_SECRET,
          hasReactApiKey: !!process.env.REACT_APP_AMADEUS_API_KEY,
          isCredentialError
        }
      });
    }

  } catch (error) {
    console.error('❌ Flight search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error while searching flights',
      details: error.message,
      debug: {
        hasAmadeusKey: !!process.env.AMADEUS_API_KEY,
        hasAmadeusSecret: !!process.env.AMADEUS_API_SECRET,
        keyPrefix: process.env.AMADEUS_API_KEY?.substring(0, 5) || 'none'
      }
    });
  }
}

// Transform Amadeus API response to frontend format
function transformAmadeusFlightData(amadeusFlights, dictionaries = {}) {
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

      // Format departure and arrival times
      const departure = {
        time: new Date(firstSegment.departure.at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        airport: firstSegment.departure.iataCode,
        terminal: firstSegment.departure.terminal || 'T1',
        date: firstSegment.departure.at.split('T')[0]
      };

      const arrival = {
        time: new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        airport: lastSegment.arrival.iataCode,
        terminal: lastSegment.arrival.terminal || 'T1',
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
} 