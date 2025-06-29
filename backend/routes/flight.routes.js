import express from 'express';
import AmadeusService from '../services/amadeusService.js';

const router = express.Router();

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
    
    const { flightOffers, travelers, payments } = req.body;
    
    if (!flightOffers || !travelers) {
      return res.status(400).json({
        success: false,
        error: 'Flight offers and travelers are required'
      });
    }

    // Prepare flight order data for Amadeus
    const flightOrderData = {
      data: {
        type: 'flight-order',
        flightOffers: flightOffers,
        travelers: travelers,
        contacts: {
          emailAddress: travelers[0]?.contact?.emailAddress || req.body.contactEmail,
          phones: [{
            deviceType: 'MOBILE',
            countryCallingCode: '1',
            number: travelers[0]?.contact?.phones?.[0]?.number || req.body.contactPhone
          }]
        }
      }
    };

    const orderResponse = await AmadeusService.createFlightOrder(flightOrderData);
    
    if (!orderResponse.success) {
      throw new Error(orderResponse.error);
    }

    res.json({
      success: true,
      data: orderResponse.data,
      pnr: orderResponse.pnr,
      orderId: orderResponse.orderId || orderResponse.data?.id,
      mode: orderResponse.mode,
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

export default router;
