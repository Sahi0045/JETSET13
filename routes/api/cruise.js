const express = require('express');
const router = express.Router();
const axios = require('axios');

// Cache to store cruise data
const cache = {
  data: null,
  timestamp: null,
  ttl: 3600000 // 1 hour in milliseconds
};

async function getAmadeusToken() {
  try {
    const response = await axios.post('https://api.amadeus.com/v1/security/oauth2/token', 
      `grant_type=client_credentials&client_id=${process.env.REACT_APP_AMADEUS_API_KEY}&client_secret=${process.env.REACT_APP_AMADEUS_API_SECRET}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting Amadeus token:', error);
    throw error;
  }
}

async function fetchAmadeusCruiseData() {
  try {
    const token = await getAmadeusToken();
    
    // Get cruise offers
    const response = await axios.get('https://api.amadeus.com/v1/shopping/cruise-offers', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        // Add any specific parameters you want to filter by
        // For example: departurePort, destination, date range, etc.
      }
    });

    // Transform Amadeus data to match our structure
    return response.data.data.map(cruise => ({
      name: cruise.cruiseLine,
      duration: `${cruise.duration} nights`,
      price: `$${cruise.price.amount}`,
      departurePort: cruise.departurePort,
      destinations: cruise.destinations,
      image: cruise.image || '/images/default-cruise.jpg',
      cruiseLine: cruise.cruiseLine,
      departureDate: cruise.departureDate
    }));
  } catch (error) {
    console.error('Error fetching Amadeus cruise data:', error);
    throw error;
  }
}

router.get('/cruises', async (req, res) => {
  try {
    // Check if we have valid cached data
    const now = Date.now();
    if (cache.data && cache.timestamp && (now - cache.timestamp) < cache.ttl) {
      return res.json(cache.data);
    }

    // If no valid cache, fetch new data from Amadeus
    const cruises = await fetchAmadeusCruiseData();
    
    // Update cache
    cache.data = cruises;
    cache.timestamp = now;

    res.json(cruises);
  } catch (error) {
    console.error('Error in cruise API:', error);
    res.status(500).json({ error: 'Failed to fetch cruise data' });
  }
});

module.exports = router; 