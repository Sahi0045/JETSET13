import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import axios from 'axios';
// Environment variable for JWT secret (should be in .env file)
const JWT_SECRET = process.env.JWT_SECRET || 'jetset-app-secret-key';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE
  });
};

// @desc    Google Login/Register
// @route   POST /api/auth/google-login
// @access  Public
export const googleLogin = async (req, res) => {
  try {
    console.log('Google login request received');
    
    const { token } = req.body;
    
    if (!token) {
      console.error('Missing token in request body');
      return res.status(400).json({ 
        success: false,
        message: 'Google token is required' 
      });
    }
    
    try {
      console.log('Verifying token with Google');
      // Verify the token with Google
      const googleResponse = await axios.get(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`
      );
      
      console.log('Google verification successful:', {
        email: googleResponse.data.email,
        name: `${googleResponse.data.given_name} ${googleResponse.data.family_name}`,
      });
      
      const { email, given_name, family_name, sub: googleId } = googleResponse.data;
      
      if (!email) {
        console.error('Google response missing email');
        return res.status(400).json({ 
          success: false,
          message: 'Google authentication failed: Missing email in response' 
        });
      }
      
      // Check if user exists
      console.log('Looking for existing user with email:', email);
      let user = await User.findByEmail(email);
      
      if (!user) {
        console.log('User not found, creating new account');
        // Create a new user if doesn't exist
        user = await User.create({
          firstName: given_name || 'User',
          lastName: family_name || '',
          email,
          googleId,
          password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8),
          isGoogleAccount: true
        });
        console.log('New Google user created:', { id: user.id, email });
      } else {
        console.log('Existing user found:', { id: user.id, email });
        // Update Google ID if not set
        if (!user.googleId) {
          console.log('Updating existing user with Google ID');
          await User.update(user.id, { googleId, isGoogleAccount: true });
          console.log('Updated existing user with Google ID:', { id: user.id });
        }
      }
      
      // Generate JWT
      console.log('Generating JWT token for user:', { id: user.id });
      const jwtToken = jwt.sign(
        { id: user.id },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRE }
      );
      
      console.log('Google user authenticated successfully:', { id: user.id, email });
      
      // Return user data and token
      return res.status(200).json({
        success: true,
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        token: jwtToken,
        isGoogleAccount: true
      });
      
    } catch (error) {
      console.error('Google token verification error details:', error);
      
      // Handle different error scenarios
      if (error.response) {
        console.error('Google API response error:', {
          status: error.response.status,
          data: error.response.data
        });
        
        return res.status(401).json({ 
          success: false,
          message: 'Invalid Google token: ' + (error.response.data.error_description || error.response.statusText),
          details: error.response.data
        });
      }
      
      console.error('Google token verification failed:', error.message);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid Google token: ' + error.message 
      });
    }
  } catch (error) {
    console.error('Error in Google login controller:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during Google authentication', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    console.log('Registration request received:', {
      ...req.body,
      password: req.body.password ? '***' : undefined
    });
    
    const { firstName, lastName, email, password } = req.body;

    // Validate input
    if (!firstName || !lastName || !email || !password) {
      console.error('Missing required fields');
      return res.status(400).json({
        message: 'All fields are required',
        details: {
          firstName: !firstName ? 'First name is required' : null,
          lastName: !lastName ? 'Last name is required' : null,
          email: !email ? 'Email is required' : null,
          password: !password ? 'Password is required' : null
        }
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: 'Invalid email format'
      });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long'
      });
    }

    try {
      const user = await User.create({
        firstName,
        lastName,
        email,
        password
      });

      const token = jwt.sign(
        { id: user.id },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRE }
      );

      console.log('User registered successfully:', {
        id: user.id,
        email: user.email
      });

      res.status(201).json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        token
      });
    } catch (error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          message: 'User with this email already exists'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error in register controller:', error);
    res.status(500).json({
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    console.log('Login request received:', { email: req.body.email });
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.error('Missing login credentials');
      return res.status(400).json({ message: 'All fields are required' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      console.error('User not found:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await User.matchPassword(password, user.password);
    if (!isMatch) {
      console.error('Password mismatch for user:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    console.log('User logged in successfully:', { id: user.id, email: user.email });

    res.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      token
    });
  } catch (error) {
    console.error('Error in login controller:', error);
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

let accessToken = null;
let tokenExpiryTime = null;

async function getAccessToken() {
  try {
    // Check if token is still valid
    if (accessToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
      return accessToken;
    }

    const response = await axios.post('https://api.amadeus.com/v1/security/oauth2/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.REACT_APP_AMADEUS_API_KEY,
        client_secret: process.env.REACT_APP_AMADEUS_API_SECRET,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    console.log("✅ Got access token:", response.data);
    accessToken = response.data.access_token;
    // Set token expiry time (usually 30 minutes before actual expiry)
    tokenExpiryTime = Date.now() + (response.data.expires_in - 1800) * 1000;
    return accessToken;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    throw error;
  }
}

export const searchFlights = async (req, res) => {
  console.log('🔍 Flight search request received');
  try {
    console.log('Request body:', req.body);
    
    const { from, to, departDate, returnDate, tripType, travelers } = req.body;

    // Validate required fields
    if (!from || !to || !departDate) {
      console.log('❌ Missing required fields:', { from, to, departDate });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Validate IATA codes
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid airport codes',
        details: {
          from: !/^[A-Z]{3}$/.test(from) ? 'Invalid origin airport code' : null,
          to: !/^[A-Z]{3}$/.test(to) ? 'Invalid destination airport code' : null
        }
      });
    }

    // Get fresh access token
    console.log('🔑 Getting access token...');
    const token = await getAccessToken();
    console.log('✅ Got access token');

    // Get flights for multiple dates (±3 days)
    const dates = [];
    for (let i = -3; i <= 3; i++) {
      const date = new Date(departDate);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    // Fetch flights for all dates in parallel
    const flightPromises = dates.map(async (date) => {
      const searchParams = {
        originLocationCode: from,
        destinationLocationCode: to,
        departureDate: date,
        adults: parseInt(travelers) || 1,
        max: 20,
        currencyCode: 'USD'
      };

      if (tripType === 'roundTrip' && returnDate) {
        searchParams.returnDate = returnDate;
      }

      try {
        console.log(`Searching flights for date: ${date}`);
        const response = await axios.get('https://api.amadeus.com/v2/shopping/flight-offers', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: searchParams
        });

        return {
          date,
          flights: response.data.data || [],
          dictionaries: response.data.dictionaries
        };
      } catch (error) {
        if (error.response?.status === 401) {
          // Token expired, get a new one and retry
          console.log('🔄 Token expired, retrying...');
          accessToken = null;
          tokenExpiryTime = null;
          const newToken = await getAccessToken();
          
          // Retry with new token
          const retryResponse = await axios.get('https://api.amadeus.com/v2/shopping/flight-offers', {
            headers: {
              Authorization: `Bearer ${newToken}`,
              'Content-Type': 'application/json'
            },
            params: searchParams
          });

          return {
            date,
            flights: retryResponse.data.data || [],
            dictionaries: retryResponse.data.dictionaries
          };
        }

        console.error(`Error fetching flights for date ${date}:`, error.response?.data || error.message);
        return {
          date,
          flights: [],
          error: error.response?.data?.errors?.[0]?.detail || error.message
        };
      }
    });

    const results = await Promise.all(flightPromises);

    // Process results to get lowest prices per date
    const dateWisePrices = {};
    let lowestOverallPrice = Infinity;
    let selectedDateFlights = [];
    let selectedDateDictionaries = {};

    results.forEach(result => {
      const { date, flights, dictionaries } = result;
      if (flights.length > 0) {
        // Get lowest price for this date
        const prices = flights.map(f => parseFloat(f.price.total));
        const lowestPrice = Math.min(...prices);
        dateWisePrices[date] = lowestPrice;

        if (lowestPrice < lowestOverallPrice) {
          lowestOverallPrice = lowestPrice;
        }

        // Store flights for the requested date
        if (date === departDate) {
          selectedDateFlights = flights;
          selectedDateDictionaries = dictionaries;
        }
      } else {
        dateWisePrices[date] = null;
      }
    });

    // If no flights found for any date
    if (selectedDateFlights.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No flights found for the given criteria'
      });
    }

    console.log('✅ Found flights:', selectedDateFlights.length);
    return res.json({
      success: true,
      data: {
        flights: selectedDateFlights,
        dictionaries: selectedDateDictionaries,
        dateWisePrices,
        lowestPrice: lowestOverallPrice
      }
    });
  } catch (error) {
    console.error('Error in flight search:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.errors?.[0]?.detail || 'Failed to fetch flights'
    });
  }
};


// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    console.log('GetMe request received for user:', req.user.id);
    
    const user = await User.findById(req.user.id);
    if (!user) {
      console.error('User not found in getMe:', req.user.id);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('GetMe successful for user:', { id: user.id, email: user.email });

    res.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    });
  } catch (error) {
    console.error('Error in getMe controller:', error);
    res.status(500).json({ message: 'Server error while fetching user data', error: error.message });
  }
};
