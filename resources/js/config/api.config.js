/**
 * API Configuration
 * Automatically detects environment and returns correct API URL
 */

const getApiUrl = () => {
  // Check if we're in development or production
  const isDevelopment = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('local');

  if (isDevelopment) {
    // Development: Use Vite proxy
    return '/api';
  } else {
    // Production: Use production domain API
    return 'https://www.jetsetterss.com/api';
  }
};

const getBaseUrl = () => {
  const isDevelopment = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('local');

  return isDevelopment ? 'http://localhost:5173' : 'https://www.jetsetterss.com';
};

export const API_CONFIG = {
  API_URL: getApiUrl(),
  BASE_URL: getBaseUrl(),
  IS_DEVELOPMENT: window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' ||
                  window.location.hostname.includes('local'),
  IS_PRODUCTION: !(window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.includes('local'))
};

// Log current environment for debugging
console.log('🌍 Environment Config:', {
  hostname: window.location.hostname,
  isDevelopment: API_CONFIG.IS_DEVELOPMENT,
  apiUrl: API_CONFIG.API_URL,
  baseUrl: API_CONFIG.BASE_URL
});

export default API_CONFIG;
