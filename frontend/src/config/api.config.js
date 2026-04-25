/**
 * API Configuration
 * Automatically detects environment and returns correct API URL
 */

const getApiUrl = () => {
  // Check if we're in development or production
  const hostname = window.location.hostname;
  const isDevelopment = 
    hostname === 'localhost' || 
    hostname === '127.0.0.1' ||
    hostname.includes('local');

  if (isDevelopment) {
    // Development: Use Vite proxy
    return '/api';
  } else {
    // Production: Use relative path if on the target domain, 
    // or hardcoded domain if accessed elsewhere
    if (hostname.includes('jetsetterss.com')) {
      return '/api';
    }
    return 'https://www.jetsetterss.com/api';
  }
};

const getBaseUrl = () => {
  const hostname = window.location.hostname;
  const isDevelopment = 
    hostname === 'localhost' || 
    hostname === '127.0.0.1' ||
    hostname.includes('local');

  if (isDevelopment) {
    return 'http://localhost:5173';
  } else {
    // If we're on jetsetterss.com or www.jetsetterss.com, use current origin
    if (hostname.includes('jetsetterss.com')) {
      return window.location.origin;
    }
    return 'https://www.jetsetterss.com';
  }
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
