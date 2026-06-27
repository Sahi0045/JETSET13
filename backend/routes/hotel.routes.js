import express from 'express';
import { listHotels, searchHotels, getDestinations, getHotelDetails, checkAvailability, bookHotel } from '../controllers/hotel.controller.js';
import axios from 'axios';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import amadeusService from '../services/amadeusService.js';
import supabase from '../config/supabase.js';

// Ensure environment variables are loaded
dotenv.config();

// API URLs - use TEST environment consistent with provided credentials
const AMADEUS_API_URLS = {
  v1: 'https://test.api.amadeus.com/v1',
  v2: 'https://test.api.amadeus.com/v2',
  v3: 'https://test.api.amadeus.com/v3'
};

const router = express.Router();
// console.log('coming to this page')
// Get list of destinations
router.get('/destinations', getDestinations);

// Search locations/cities for autocomplete
router.get('/locations', async (req, res) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword || keyword.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Keyword must be at least 2 characters'
      });
    }
    
    const result = await amadeusService.searchLocations(keyword, 'CITY');
    return res.json(result);
  } catch (error) {
    console.error('Error searching locations:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to search locations',
      message: error.message
    });
  }
});

// List hotels in a city
router.get('/destinations', getDestinations);

// List hotels in a city
router.get('/list', listHotels);

// Search hotels with availability (support both GET and POST)
router.post('/search', searchHotels);
router.get('/search', searchHotels);

// Get hotel details by ID
router.get('/details/:hotelId', getHotelDetails);

// Check availability for a specific hotel
router.get('/availability/:hotelId', checkAvailability);

// Get hotel offers for a specific hotel (using v3 endpoint)
router.get('/offers/:hotelId', async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { checkInDate, checkOutDate, adults } = req.query;
    
    if (!hotelId || !checkInDate || !checkOutDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Hotel ID, check-in date, and check-out date are required' 
      });
    }
    
    // Get access token
    const token = await getAccessToken();
    
    // Use v3 endpoint for hotel offers
    const response = await axios.get(`${AMADEUS_API_URLS.v3}/shopping/hotel-offers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.amadeus+json'
      },
      params: {
        hotelIds: hotelId,
        checkInDate,
        checkOutDate,
        adults: parseInt(adults) || 2,
        roomQuantity: 1,
        currency: 'USD',
        bestRateOnly: true
      }
    });
    
    return res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Error checking hotel availability:', error.response?.data || error);
    
    // Handle specific errors
    if (error.response?.data?.errors) {
      return res.status(400).json({
        success: false,
        message: 'Error checking hotel availability',
        error: error.response.data.errors[0]?.detail || 'No offers available'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error checking hotel availability',
      error: error.message
    });
  }
});

// Book a hotel
router.post('/book/:hotelId', bookHotel);

// Save a hotel booking to the database (called after ARC Pay payment succeeds)
router.post('/bookings', async (req, res) => {
  try {
    const {
      orderId,
      hotelId,
      hotelName,
      hotelImage,
      location,
      roomType,
      checkInDate,
      checkOutDate,
      nights,
      guests,
      pricePerNight,
      subtotal,
      taxes,
      serviceFee,
      totalAmount,
      currency = 'USD',
      guestInfo,
      transactionId,
      resultIndicator,
      sessionId,
      userId
    } = req.body;

    console.log('🏨 Saving hotel booking to database:', {
      orderId,
      hotelName,
      totalAmount,
      nights
    });

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    if (!supabase) {
      console.log('⚠️ Supabase not configured, skipping database save');
      return res.json({
        success: true,
        message: 'Booking processed (database not available)',
        data: { orderId }
      });
    }

    // Fetch the pending booking row created at checkout time. It carries the
    // ARC Pay success_indicator we use to verify the payment really succeeded.
    let existing = null;
    try {
      const { data: found } = await supabase
        .from('bookings')
        .select('*')
        .eq('booking_reference', orderId)
        .single();
      existing = found;
    } catch (_) { /* no pending row — proceed */ }

    // Verify payment: ARC Pay returns resultIndicator on success which must match
    // the successIndicator captured when the checkout session was created.
    const storedIndicator = existing?.booking_details?.success_indicator;
    const providedIndicator = resultIndicator || transactionId;
    if (storedIndicator && providedIndicator && storedIndicator !== providedIndicator) {
      console.warn('⚠️ Payment indicator mismatch for hotel order:', orderId);
      try {
        await supabase
          .from('bookings')
          .update({ status: 'pending', payment_status: 'unpaid' })
          .eq('booking_reference', orderId);
      } catch (_) { /* non-blocking */ }
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Payment could not be verified'
      });
    }

    // Build the guest/passenger array from guestInfo
    const guest = guestInfo || {};
    const passengers = [{
      id: 'G1',
      type: 'adult',
      firstName: guest.firstName || guest.first_name || '',
      lastName: guest.lastName || guest.last_name || '',
      email: guest.email || '',
      phone: guest.phone || ''
    }];

    const buildRow = (uid) => ({
      user_id: uid || null,
      booking_reference: orderId,
      travel_type: 'hotel',
      status: 'confirmed',
      total_amount: parseFloat(totalAmount) || 0,
      payment_status: 'paid',
      booking_details: {
        // preserve checkout-time fields (session_id, success_indicator, etc.)
        ...(existing?.booking_details || {}),
        order_id: orderId,
        transaction_id: providedIndicator || sessionId || existing?.booking_details?.transaction_id || null,
        hotel_id: hotelId || '',
        hotel_name: hotelName || '',
        hotel_image: hotelImage || '',
        location: location || '',
        room_type: roomType || '',
        check_in_date: checkInDate || '',
        check_out_date: checkOutDate || '',
        nights: parseInt(nights) || 0,
        guests: parseInt(guests) || 0,
        price_per_night: parseFloat(pricePerNight) || 0,
        subtotal: parseFloat(subtotal) || 0,
        taxes: parseFloat(taxes) || 0,
        service_fee: parseFloat(serviceFee) || 0,
        amount: parseFloat(totalAmount) || 0,
        currency,
        guest_info: guest,
        paid_at: new Date().toISOString(),
        original_user_id: userId || null
      },
      passenger_details: passengers
    });

    // Upsert on booking_reference so the existing pending/unpaid row is upgraded
    // to confirmed/paid (rather than colliding with the unique constraint).
    let { data, error } = await supabase
      .from('bookings')
      .upsert(buildRow(userId), { onConflict: 'booking_reference' })
      .select()
      .single();

    // FK (user_id not in auth.users) or RLS violation → retry without user_id
    if (error && userId && (error.code === '23503' || error.code === '42501' ||
        error.message?.includes('violates foreign key') || error.message?.includes('row-level security'))) {
      console.log('🔄 Retrying hotel booking save without user_id (FK/RLS constraint issue)...');
      ({ data, error } = await supabase
        .from('bookings')
        .upsert(buildRow(null), { onConflict: 'booking_reference' })
        .select()
        .single());
    }

    if (error) {
      console.error('❌ Error saving hotel booking:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to save booking'
      });
    }

    console.log('✅ Hotel booking saved/confirmed in database:', data.id);

    res.json({
      success: true,
      message: 'Hotel booking saved successfully',
      data: {
        id: data.id,
        orderId,
        bookingReference: orderId,
        status: 'confirmed'
      }
    });

  } catch (error) {
    console.error('❌ Hotel booking save error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save hotel booking'
    });
  }
});

// Get all hotel bookings
router.get('/bookings', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ success: true, data: [] });
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('travel_type', 'hotel')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching hotel bookings:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ Error fetching hotel bookings:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch hotel bookings' });
  }
});

// Add a test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Hotel API is working!',
    env: {
      hasAmadeusKeys: !!(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET)
    }
  });
});

// Add a mock search endpoint that always returns sample hotels (for testing)
router.get('/mock-search', (req, res) => {
  // Get parameters
  const { destination } = req.query;
  
  // Create sample hotels based on destination
  const mockHotels = [
    {
      id: 'mock-hotel-1',
      name: `${destination || 'Sample'} Grand Hotel`,
      cityCode: destination || 'NYC',
      location: `${destination || 'New York'}, US`,
      rating: 4.5,
      price: '299.99',
      currency: 'USD',
      image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945',
      images: [
        'https://images.unsplash.com/photo-1566073771259-6a8506099945',
        'https://images.unsplash.com/photo-1582719508461-905c673771fd'
      ],
      amenities: ['Free WiFi', 'Pool', 'Spa']
    },
    {
      id: 'mock-hotel-2',
      name: `${destination || 'Sample'} Plaza Resort`,
      cityCode: destination || 'NYC',
      location: `${destination || 'New York'}, US`,
      rating: 4.8,
      price: '399.99',
      currency: 'USD',
      image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa',
      images: [
        'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa',
        'https://images.unsplash.com/photo-1590490360182-c33d57733427'
      ],
      amenities: ['Restaurant', 'Room Service', 'Fitness Center']
    },
    {
      id: 'mock-hotel-3',
      name: `Royal ${destination || 'Sample'} Hotel`,
      cityCode: destination || 'NYC',
      location: `${destination || 'New York'}, US`,
      rating: 4.2,
      price: '199.99',
      currency: 'USD',
      image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427',
      images: [
        'https://images.unsplash.com/photo-1590490360182-c33d57733427',
        'https://images.unsplash.com/photo-1564501049412-61c2a3083791'
      ],
      amenities: ['Breakfast', 'Parking', 'Airport Shuttle']
    }
  ];
  
  // Return structured response with hotels array
  res.json({
    success: true,
    data: {
      hotels: mockHotels
    }
  });
});

// Direct test endpoint that searches for hotels and returns the results
router.get('/direct-search', async (req, res) => {
  try {
    const { cityCode } = req.query;
    
    if (!cityCode) {
      return res.status(400).json({
        success: false,
        message: 'City code is required'
      });
    }
    
    // Get access token
    const token = await getAccessToken();
    
    // Search for hotels in the city using v1 endpoint
    const searchResponse = await axios.get(`${AMADEUS_API_URLS.v1}/reference-data/locations/hotels/by-city`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      params: {
        cityCode: cityCode,
        radius: 50,
        radiusUnit: 'KM',
        hotelSource: 'ALL'
      }
    });
    
    res.json({
      success: true,
      data: searchResponse.data
    });
  } catch (error) {
    console.error('Error in direct hotel search:', error.response?.data || error);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.errors?.[0]?.detail || 'Error searching hotels'
    });
  }
});

// Legacy check-availability endpoint - fixed to use hotelId properly
router.get('/check-availability', async (req, res) => {
  try {
    const { destination, checkInDate, checkOutDate, travelers } = req.query;

    if (!destination || !checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: destination, checkInDate, and checkOutDate are required'
      });
    }

    // Get access token
    const accessToken = await getAccessToken();

    // First, determine if destination is a city code or hotel ID
    let hotelId = null;
    
    // If the destination looks like a hotel ID (usually longer alphanumeric string)
    if (destination.length > 3) {
      hotelId = destination;
    } else {
      // Assume it's a city code and search for hotels in that city
      try {
        const searchResponse = await axios.get(`${AMADEUS_API_URLS.v1}/reference-data/locations/hotels/by-city`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          params: {
            cityCode: destination,
            radius: 50,
            radiusUnit: 'KM',
            hotelSource: 'ALL'
          }
        });

        if (!searchResponse.data.data || searchResponse.data.data.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'No hotels found in this location'
          });
        }

        // Get the first hotel's ID
        hotelId = searchResponse.data.data[0].hotelId;
        
        // Return the hotel search results since we can't reliably check availability
        return res.json({
          success: true,
          message: "Retrieved hotels in the city. Use hotel IDs to check specific availability.",
          data: {
            hotels: searchResponse.data.data.slice(0, 10).map(hotel => ({
              hotelId: hotel.hotelId,
              name: hotel.name,
              address: hotel.address,
              geoCode: hotel.geoCode
            }))
          }
        });
      } catch (searchError) {
        console.error('Error searching for hotels:', searchError.response?.data || searchError);
        return res.status(searchError.response?.status || 500).json({
          success: false,
          message: searchError.response?.data?.errors?.[0]?.detail || 'Error searching for hotels'
        });
      }
    }

    // Now check availability for this hotel using v3 endpoint
    try {
      const hotelResponse = await axios.get(`${AMADEUS_API_URLS.v3}/shopping/hotel-offers`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.amadeus+json'
        },
        params: {
          hotelIds: hotelId,
          checkInDate,
          checkOutDate,
          adults: parseInt(travelers) || 1,
          roomQuantity: 1,
          currency: 'USD',
          bestRateOnly: true
        }
      });

      if (hotelResponse.data.data && hotelResponse.data.data.length > 0) {
        res.json({
          success: true,
          data: hotelResponse.data
        });
      } else {
        res.json({
          success: false,
          message: 'No availability found for these dates'
        });
      }
    } catch (availabilityError) {
      console.error('Error checking hotel availability:', availabilityError.response?.data || availabilityError);
      
      // Handle specific availability errors
      if (availabilityError.response?.status === 400) {
        const errorDetail = availabilityError.response?.data?.errors?.[0]?.detail || '';
        if (errorDetail.includes('INVALID PROPERTY CODE') || errorDetail.includes('VERIFY CHAIN/REP CODE')) {
          return res.status(400).json({
            success: false,
            message: 'The hotel ID format is not compatible with availability checking. Try a different hotel.'
          });
        }
      }
      
      // Try the fallback hotel ID that we know works
      try {
        console.log('Trying fallback hotel ID EDLONDER');
        const fallbackResponse = await axios.get(`${AMADEUS_API_URLS.v3}/shopping/hotel-offers`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.amadeus+json'
          },
          params: {
            hotelIds: 'EDLONDER',
            checkInDate,
            checkOutDate,
            adults: parseInt(travelers) || 1,
            roomQuantity: 1,
            currency: 'USD',
            bestRateOnly: true
          }
        });
        
        if (fallbackResponse.data.data && fallbackResponse.data.data.length > 0) {
          return res.json({
            success: true,
            message: 'Using fallback hotel data',
            data: fallbackResponse.data
          });
        }
      } catch (fallbackError) {
        console.error('Fallback hotel attempt also failed:', fallbackError.message);
      }
      
      return res.status(availabilityError.response?.status || 500).json({
        success: false,
        message: availabilityError.response?.data?.errors?.[0]?.detail || 'Error checking hotel availability'
      });
    }
  } catch (error) {
    console.error('Error in hotel check-availability:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.errors?.[0]?.detail || 'Error checking hotel availability'
    });
  }
});

// Helper function to get access token
const getAccessToken = async () => {
  try {
    console.log('Attempting to get Amadeus token with credentials:', {
      apiKeyExists: !!process.env.AMADEUS_API_KEY,
      apiSecretExists: !!process.env.AMADEUS_API_SECRET,
      reactKeyExists: !!process.env.REACT_APP_AMADEUS_API_KEY,
      reactSecretExists: !!process.env.REACT_APP_AMADEUS_API_SECRET
    });
    
    // Try server-side variables first, fall back to React ones if needed
    const apiKey = process.env.AMADEUS_API_KEY || process.env.REACT_APP_AMADEUS_API_KEY;
    const apiSecret = process.env.AMADEUS_API_SECRET || process.env.REACT_APP_AMADEUS_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      throw new Error('Missing Amadeus API credentials');
    }
    
    const response = await axios.post(
      `${AMADEUS_API_URLS.v1}/security/oauth2/token`,
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(), // form body
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: apiKey,
          password: apiSecret,
        }
      }
    );

    console.log('Successfully obtained Amadeus access token');
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get access token:', error.response?.data || error.message);
    throw new Error('Could not generate access token: ' + (error.response?.data?.error_description || error.message));
  }
};

export default router;
