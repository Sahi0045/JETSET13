import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const apiKey = process.env.AMADEUS_API_KEY;
  const apiSecret = process.env.AMADEUS_API_SECRET;
  
  const debug = {
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
    keyPrefix: apiKey?.substring(0, 8) || 'NOT SET',
    secretLength: apiSecret?.length || 0
  };
  
  // Test authentication with TEST endpoint
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', apiKey);
    params.append('client_secret', apiSecret);
    
    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    debug.testEndpoint = 'SUCCESS';
    debug.tokenReceived = !!response.data.access_token;
  } catch (e) {
    debug.testEndpoint = 'FAILED';
    debug.testError = e.response?.data?.error_description || e.message;
  }
  
  // Test authentication with PRODUCTION endpoint
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', apiKey);
    params.append('client_secret', apiSecret);
    
    const response = await axios.post(
      'https://api.amadeus.com/v1/security/oauth2/token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    debug.productionEndpoint = 'SUCCESS';
    debug.prodTokenReceived = !!response.data.access_token;
  } catch (e) {
    debug.productionEndpoint = 'FAILED';
    debug.productionError = e.response?.data?.error_description || e.message;
  }
  
  return res.status(200).json(debug);
}
