// Amadeus API Utilities

// API credentials and URLs
export const AMADEUS_API_KEY = 'ZsgV43XBz0GbNk85zQuzvWnhARwXX4IE';
export const AMADEUS_API_SECRET = '2uFgpTVo5GA4ytwq';
export const API_URL = 'https://prod-r8ncjf76l-shubhams-projects-4a867368.vercel.app/api';

// API version URLs - used for direct API calls if needed
export const API_VERSIONS = {
  v1: 'https://api.amadeus.com/v1',
  v2: 'https://api.amadeus.com/v2',
  v3: 'https://api.amadeus.com/v3'
};

// Default parameters for hotel search that were successful in tests
export const DEFAULT_SEARCH_PARAMS = {
  radius: 50,
  radiusUnit: 'KM',
  hotelSource: 'ALL',
  roomQuantity: 1,
  currency: 'USD',
  bestRateOnly: true
};

// Format date as YYYY-MM-DD
export const formatDate = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Create future dates for hotel search
export const createDefaultDates = () => {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + 30); // 30 days in future
  
  const checkOutDate = new Date(futureDate);
  checkOutDate.setDate(futureDate.getDate() + 3); // 3-day stay
  
  return {
    checkInDate: formatDate(futureDate),
    checkOutDate: formatDate(checkOutDate)
  };
};

// Helper function to filter out test hotels and prioritize real hotels
export const prioritizeHotels = (hotels) => {
  if (!hotels || !Array.isArray(hotels) || hotels.length === 0) return [];
  
  // Define priority scoring function
  const getPriority = (hotel) => {
    const name = (hotel.name || '').toUpperCase();
    
    // Skip test properties
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
    .sort((a, b) => b.priority - a.priority);
};

// Format hotel data from API response
export const formatHotelData = (hotel, cityCode) => {
  if (!hotel) return null;
  
  // Log the hotel object structure to debug
  console.log('Processing hotel data:', hotel);
  
  // Extract price
  let hotelPrice = '150'; // Default price
  let currency = 'USD';
  
  // Try to get real price if available
  if (hotel.offers && hotel.offers.length > 0 && hotel.offers[0].price) {
    hotelPrice = hotel.offers[0].price.total || hotel.offers[0].price.base || hotelPrice;
    currency = hotel.offers[0].price.currency || currency;
  } else if (hotel.price) {
    hotelPrice = typeof hotel.price === 'object' ? hotel.price.total || hotel.price.base : hotel.price;
  } else if (hotel.rates && hotel.rates.length > 0) {
    const rate = hotel.rates[0];
    hotelPrice = rate.total || rate.base || rate.price;
  }

  // If no price found, generate a random price between 100 and 500
  if (hotelPrice === '0' || hotelPrice === 0 || hotelPrice === '150') {
    hotelPrice = (Math.random() * 400 + 100).toFixed(2);
  }

  // Ensure price is a valid number and format it
  const numericPrice = parseFloat(hotelPrice);
  hotelPrice = isNaN(numericPrice) ? '150.00' : numericPrice.toFixed(2);
  
  // Extract amenities with fallback
  let amenities = ['WiFi', 'Room Service', 'Restaurant'];
  if (hotel.amenities && hotel.amenities.length > 0) {
    amenities = hotel.amenities.slice(0, 5);
  }
  
  // Handle different property structures
  const hotelId = hotel.hotelId || hotel.id || Math.random().toString(36).substr(2, 9);
  let hotelName = hotel.name || 'Hotel Name Not Available';
  let hotelLocation = cityCode || 'Unknown Location';
  
  // Try to extract better location information
  if (hotel.address) {
    hotelLocation = hotel.address.cityName || hotel.address.countryCode || hotelLocation;
  } else if (hotel.cityName) {
    hotelLocation = hotel.cityName;
  } else if (hotel.cityCode) {
    hotelLocation = hotel.cityCode;
  }
  
  // Generate placeholder image if none available
  let imageUrl = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80';
  
  if (hotel.media && hotel.media.images && hotel.media.images.length > 0) {
    imageUrl = hotel.media.images[0].uri || imageUrl;
  } else if (hotel.images && hotel.images.length > 0) {
    imageUrl = hotel.images[0] || imageUrl;
  } else if (hotel.image) {
    imageUrl = hotel.image;
  }
  
  console.log(`Processed hotel: ${hotelName}, Price: $${hotelPrice}`);
  
  return {
    id: hotelId,
    name: hotelName,
    location: hotelLocation,
    price: hotelPrice,
    currency: currency,
    rating: hotel.rating || ((Math.random() * 2 + 3).toFixed(1)),
    image: imageUrl,
    amenities: amenities,
    originalData: hotel
  };
};

// Validate search parameters
export const validateSearchParams = (params) => {
  const errors = [];
  
  if (!params.cityCode) {
    errors.push('Please select a destination');
  }
  
  if (!params.checkInDate || !params.checkOutDate) {
    errors.push('Please select both check-in and check-out dates');
  } else {
    const checkIn = new Date(params.checkInDate);
    const checkOut = new Date(params.checkOutDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (checkIn < today) {
      errors.push('Check-in date cannot be in the past');
    }
    
    if (checkOut <= checkIn) {
      errors.push('Check-out date must be after check-in date');
    }
    
    // Don't allow stays longer than 30 days
    const maxStayDate = new Date(checkIn);
    maxStayDate.setDate(maxStayDate.getDate() + 30);
    if (checkOut > maxStayDate) {
      errors.push('Maximum stay is 30 days');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

// Format date range for display
export const formatDateRange = (startDate, endDate) => {
  if (!startDate) return 'Select dates';
  
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const start = new Date(startDate).toLocaleDateString('en-US', options);
  
  if (!endDate) return `${start} - Select checkout`;
  
  const end = new Date(endDate).toLocaleDateString('en-US', options);
  return `${start} - ${end}`;
};

// Build complete search parameters with defaults
export const buildSearchParams = (baseParams) => {
  return {
    ...DEFAULT_SEARCH_PARAMS,
    ...baseParams,
    destination: baseParams.cityCode
  };
};

export default {
  AMADEUS_API_KEY,
  AMADEUS_API_SECRET,
  API_URL,
  API_VERSIONS,
  DEFAULT_SEARCH_PARAMS,
  formatDate,
  createDefaultDates,
  formatHotelData,
  validateSearchParams,
  formatDateRange,
  prioritizeHotels,
  buildSearchParams
}; 