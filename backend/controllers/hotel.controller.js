import amadeusService from '../services/amadeusService.js';
import axios from 'axios';
import dotenv from 'dotenv';
import { get as cacheGet, set as cacheSet, CacheKeys, TTL } from '../services/cache.service.js';
import { getHotelImages } from '../services/hotelImages.js';

// Ensure environment variables are loaded
dotenv.config();

// Convert Amadeus amenity codes (e.g. SWIMMING_POOL) to readable labels.
const formatAmenity = (code) =>
  String(code || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// const getAccessToken = async () => {
//   const response = await axios.post('https://test.api.amadeus.com/v1/security/oauth2/token', null, {
//     headers: {
//       'Content-Type': 'application/x-www-form-urlencoded',
//     },
//     auth: {
//       username: process.env.REACT_APP_AMADEUS_API_KEY, // Use server-side env vars
//       password: process.env.REACT_APP_AMADEUS_API_SECRET,
//     },
//     params: {
//       grant_type: 'client_credentials',
//     }
//   });

//   return response.data.access_token;
// };


const getAccessToken = async () => {
  try {
    // Only use environment variables, no hardcoded fallbacks
    const apiKey = process.env.AMADEUS_API_KEY || process.env.REACT_APP_AMADEUS_API_KEY;
    const apiSecret = process.env.AMADEUS_API_SECRET || process.env.REACT_APP_AMADEUS_API_SECRET;
    
    console.log('Attempting to get Amadeus token with credentials:', {
      apiKeyExists: !!apiKey,
      apiSecretExists: !!apiSecret,
    });
    
    if (!apiKey || !apiSecret) {
      throw new Error('Missing Amadeus API credentials');
    }
    
    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
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


export const listHotels = async (req, res) => {
  try {
    const { cityCode } = req.query;
    
    if (!cityCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'City code is required' 
      });
    }

    const hotels = await amadeusService.searchHotels({ cityCode });
    
    res.json({
      success: true,
      data: hotels
    });
  } catch (error) {
    console.error('Error in listHotels controller:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Error listing hotels',
      error: error.message
    });
  }
};

export const getDestinations = async (req, res) => {
  try {
    // Enhanced destinations list with more popular cities and correct IATA codes
    const destinations = [
      { code: 'PAR', name: 'Paris', country: 'France' },
      { code: 'LON', name: 'London', country: 'United Kingdom' },
      { code: 'NYC', name: 'New York', country: 'United States' },
      { code: 'BOM', name: 'Mumbai', country: 'India' },
      { code: 'DEL', name: 'Delhi', country: 'India' },
      { code: 'TYO', name: 'Tokyo', country: 'Japan' },
      { code: 'ROM', name: 'Rome', country: 'Italy' },
      { code: 'SYD', name: 'Sydney', country: 'Australia' },
      { code: 'SIN', name: 'Singapore', country: 'Singapore' },
      { code: 'DXB', name: 'Dubai', country: 'United Arab Emirates' },
      { code: 'BKK', name: 'Bangkok', country: 'Thailand' },
      { code: 'BCN', name: 'Barcelona', country: 'Spain' },
      { code: 'AMS', name: 'Amsterdam', country: 'Netherlands' },
      { code: 'HKG', name: 'Hong Kong', country: 'China' },
      { code: 'MAD', name: 'Madrid', country: 'Spain' },
      { code: 'BER', name: 'Berlin', country: 'Germany' },
      { code: 'IST', name: 'Istanbul', country: 'Turkey' }
    ];
    
    res.json({
      success: true,
      data: destinations
    });
  } catch (error) {
    console.error('Error getting destinations:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting destinations',
      error: error.message
    });
  }
};

export const searchHotels = async (req, res) => {
  try {
    const params = req.method === 'POST' ? req.body : req.query;
    const { destination, dates, travelers, cityCode, checkInDate, checkOutDate, adults } = params;
    console.log('Search params:', params);

    // Validate required parameters
    if (!destination && !cityCode) {
      return res.status(400).json({
        success: false,
        message: 'Destination city code is required'
      });
    }

    const searchParams = {
      cityCode: cityCode || destination,
      checkInDate: checkInDate || null,
      checkOutDate: checkOutDate || null,
      adults: parseInt(adults || travelers) || 2,
      // Add additional parameters from successful tests
      radius: 50,
      radiusUnit: 'KM',
      hotelSource: 'ALL'
    };
    
    // Parse dates if they're in a combined format
    if (dates && dates !== 'Select dates' && (!searchParams.checkInDate || !searchParams.checkOutDate)) {
      const [start, end] = dates.split(' - ');
      if (start && end) {
        searchParams.checkInDate = start;
        searchParams.checkOutDate = end;
      }
    }

    // If dates are not provided, use dates 30 days in the future for a 3-day stay
    if (!searchParams.checkInDate || !searchParams.checkOutDate) {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 30);
      
      const futureCheckOutDate = new Date(futureDate);
      futureCheckOutDate.setDate(futureDate.getDate() + 3);
      
      searchParams.checkInDate = futureDate.toISOString().split('T')[0];
      searchParams.checkOutDate = futureCheckOutDate.toISOString().split('T')[0];
      
      console.log(`No dates provided, using future dates: ${searchParams.checkInDate} to ${searchParams.checkOutDate}`);
    }

    // Correct Amadeus hotel flow: Hotel List (by-city) -> hotelIds ->
    // Hotel Offers (by hotelIds) + Hotel Sentiments (real ratings).
    try {
      const hotelCacheKey = CacheKeys.hotelSearch(
        searchParams.cityCode,
        searchParams.checkInDate,
        searchParams.checkOutDate,
        searchParams.adults
      );
      let formattedHotels = await cacheGet(hotelCacheKey);
      if (formattedHotels) {
        console.log('✅ Hotel search served from cache');
        return res.json({ success: true, data: { hotels: formattedHotels } });
      }

      // 1. Directory list -> hotelIds
      const directory = await amadeusService.getHotelsByCity(searchParams.cityCode, searchParams.radius || 20);
      if (!directory || directory.length === 0) {
        return res.json({ success: true, message: 'No hotels found for your search criteria', data: { hotels: [] } });
      }

      // Cap the working set so we don't blow rate limits / URL length
      const working = directory.slice(0, 40);
      const ids = working.map((h) => h.hotelId).filter(Boolean);

      // 2 + 3. Offers (priced) and sentiments (ratings) in parallel
      const [offers, sentiments] = await Promise.all([
        amadeusService.getHotelOffersByIds(ids, {
          checkInDate: searchParams.checkInDate,
          checkOutDate: searchParams.checkOutDate,
          adults: searchParams.adults
        }),
        amadeusService.getHotelSentiments(ids)
      ]);

      // Map hotelId -> best offer
      const offerMap = {};
      (offers || []).forEach((o) => {
        const hid = o.hotel?.hotelId;
        if (hid && o.offers && o.offers.length) {
          offerMap[hid] = { offer: o.offers[0], hotel: o.hotel };
        }
      });

      // Stable pseudo-price (USD) when a live offer isn't returned (test env).
      const estimatePrice = (hotelId) => {
        let h = 0; const s = String(hotelId);
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return 90 + (Math.abs(h) % 360); // $90–$449, stable per hotel
      };

      formattedHotels = working.map((h) => {
        const hid = h.hotelId;
        const cityName = h.address?.cityName || searchParams.cityCode;
        const countryCode = h.address?.countryCode || '';
        const matched = offerMap[hid];
        const sentiment = sentiments[hid];
        const { image, images } = getHotelImages(hid);

        // Real rating from sentiments (0-100 -> 0-5), else neutral default
        const rating = sentiment?.overallRating != null
          ? Math.round((sentiment.overallRating / 20) * 10) / 10
          : null;
        const stars = rating ? Math.max(3, Math.min(5, Math.round(rating))) : 4;

        // Amenities from the offer's room description / hotel amenities when present
        const amenities = Array.isArray(matched?.hotel?.amenities) && matched.hotel.amenities.length
          ? matched.hotel.amenities.slice(0, 4).map(formatAmenity)
          : ['Free WiFi', 'Air Conditioning', '24-hour Front Desk'];

        const priced = !!matched?.offer?.price?.total;
        return {
          id: `amadeus-${hid}`,
          hotelId: hid,
          name: matched?.hotel?.name || h.name,
          cityCode: searchParams.cityCode,
          location: countryCode ? `${cityName}, ${countryCode}` : cityName,
          address: h.address || {},
          geoCode: h.geoCode || {},
          rating,
          reviews: sentiment?.numberOfReviews || 0,
          stars,
          price: priced ? matched.offer.price.total : String(estimatePrice(hid)),
          currency: priced ? matched.offer.price.currency : 'USD',
          estimated: !priced,
          available: priced,
          offerId: priced ? matched.offer.id : null,
          image,
          images,
          amenities
        };
      });

      // Bookable (priced) hotels first, then estimates
      formattedHotels.sort((a, b) => (b.available === a.available ? 0 : b.available ? 1 : -1));

      if (formattedHotels.length) {
        await cacheSet(hotelCacheKey, formattedHotels, TTL.HOTEL_SEARCH);
      }
      return res.json({ success: true, data: { hotels: formattedHotels } });

    } catch (searchError) {
      console.error('❌ Hotel search error:', searchError.response?.data || searchError.message);
      return res.status(502).json({
        success: false,
        message: 'Hotel search is temporarily unavailable. Please try again.',
        data: { hotels: [] }
      });
    }
  } catch (error) {
    console.error('Error in searchHotels controller:', error);
    // Return a helpful error response
    res.status(500).json({
      success: false,
      message: 'Error searching for hotels',
      error: error.message
    });
  }
};

export const getHotelDetails = async (req, res) => {
  try {
    const { hotelId } = req.params;
    
    if (!hotelId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Hotel ID is required' 
      });
    }

    const hotelDetails = await amadeusService.getHotelDetails(hotelId);
    
    res.json({
      success: true,
      data: hotelDetails
    });
  } catch (error) {
    console.error('Error in getHotelDetails:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting hotel details',
      error: error.message
    });
  }
};

export const checkAvailability = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { checkInDate, checkOutDate, adults } = req.query;
    
    if (!hotelId || !checkInDate || !checkOutDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Hotel ID, check-in date, and check-out date are required' 
      });
    }

    const availability = await amadeusService.getHotelAvailability(
      hotelId,
      checkInDate,
      checkOutDate,
      parseInt(adults) || 1
    );
    
    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Error in checkAvailability:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking hotel availability',
      error: error.message
    });
  }
};

export const bookHotel = async (req, res) => {
  try {
    const { offerId, guests, payments } = req.body;
    
    if (!offerId || !guests || !payments) {
      return res.status(400).json({ 
        success: false, 
        message: 'Offer ID, guests, and payment information are required' 
      });
    }

    const booking = await amadeusService.bookHotel(
      offerId,
      guests,
      payments
    );
    
    res.json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Error in bookHotel:', error);
    res.status(500).json({
      success: false,
      message: 'Error booking hotel',
      error: error.message
    });
  }
}; 