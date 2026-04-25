// Amadeus API Proxy Server
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Initialize dotenv
config();

// Get current file directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PROXY_PORT || 3030;

// Get credentials from environment variables
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;

// Amadeus API endpoints
const AMADEUS_API = 'https://api.amadeus.com';
const ENDPOINTS = {
  TOKEN: '/v1/security/oauth2/token',
  HOTELS_BY_CITY: '/v1/reference-data/locations/hotels/by-city',
  HOTEL_OFFERS: '/v3/shopping/hotel-offers'
};

// Enable CORS for your frontend
app.use(cors({
  origin: '*',  // In production, specify your actual frontend URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON request body
app.use(express.json());

// Token cache to avoid requesting a new token for every request
let tokenCache = {
  access_token: null,
  expires_at: 0
};

// Get Amadeus access token
async function getAccessToken() {
  // Return cached token if still valid
  if (tokenCache.access_token && tokenCache.expires_at > Date.now()) {
    return tokenCache.access_token;
  }

  try {
    console.log('Getting new Amadeus access token...');
    const response = await axios.post(
      `${AMADEUS_API}${ENDPOINTS.TOKEN}`,
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: AMADEUS_API_KEY,
          password: AMADEUS_API_SECRET,
        }
      }
    );

    // Cache the token with expiration
    tokenCache = {
      access_token: response.data.access_token,
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };

    return tokenCache.access_token;
  } catch (error) {
    console.error('Failed to get Amadeus access token:', error.response?.data || error.message);
    throw new Error('Could not authenticate with Amadeus API');
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Proxy endpoint for hotel search
app.get('/hotels/search', async (req, res) => {
  try {
    const { destination, checkInDate, checkOutDate, travelers, radius = 20, radiusUnit = 'KM' } = req.query;
    
    // Validate required parameters
    if (!destination) {
      return res.status(400).json({ 
        success: false, 
        message: 'Destination is required' 
      });
    }

    // Get access token
    const accessToken = await getAccessToken();
    
    // Get hotels in the city
    const hotelsResponse = await axios.get(`${AMADEUS_API}${ENDPOINTS.HOTELS_BY_CITY}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        cityCode: destination,
        radius,
        radiusUnit,
        hotelSource: 'ALL'
      }
    });
    
    const hotels = hotelsResponse.data.data || [];
    console.log(`Found ${hotels.length} hotels in ${destination}`);
    
    // Return formatted response
    return res.json({
      success: true,
      data: {
        data: hotels
      }
    });
  } catch (error) {
    console.error('Error searching hotels:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Error searching hotels',
      error: error.response?.data?.errors?.[0]?.title || error.message
    });
  }
});

// Proxy endpoint for hotel offers (availability and pricing)
app.get('/hotels/offers/:hotelId', async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { checkInDate, checkOutDate, adults, roomQuantity = 1, currency = 'USD' } = req.query;
    
    // Validate required parameters
    if (!hotelId || !checkInDate || !checkOutDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Hotel ID, check-in date, and check-out date are required' 
      });
    }

    // Get access token
    const accessToken = await getAccessToken();
    
    // Get hotel offers
    const response = await axios.get(`${AMADEUS_API}${ENDPOINTS.HOTEL_OFFERS}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        hotelIds: hotelId,
        checkInDate,
        checkOutDate,
        adults: adults || 2,
        roomQuantity,
        currency,
        bestRateOnly: true
      }
    });
    
    const offers = response.data.data || [];
    
    // Return formatted response
    return res.json({
      success: true,
      data: offers[0] || {} // Return the first offer data
    });
  } catch (error) {
    console.error('Error getting hotel offers:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Error checking hotel availability',
      error: error.response?.data?.errors?.[0]?.title || error.message
    });
  }
});

// For local development, start the server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Amadeus Proxy Server running on port ${PORT}`);
    console.log(`Test the server at: http://localhost:${PORT}/health`);
  });
}

// For Vercel deployment - export the Express app as a module
export default app;
