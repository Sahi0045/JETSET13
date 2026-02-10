// API URL Configuration

// Default production and development URLs
const DEFAULT_PROD_URL = 'https://www.jetsetterss.com/api';
const DEFAULT_DEV_PORT = 5004;

// Get the base API URL from environment variables - prioritize frontend-safe variables
const getApiBaseUrl = () => {
  // Check for local development environment first
  const isLocalDevelopment = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  console.log('Environment detection:', {
    hostname: window.location.hostname,
    isLocal: isLocalDevelopment,
    viteApiUrl: import.meta.env?.VITE_API_URL,
    viteProdUrl: import.meta.env?.VITE_PROD_API_URL
  });

  // In local development, use the local API server
  if (isLocalDevelopment) {
    // For local development, check if we have a specific port
    const localApiUrl = import.meta.env?.VITE_API_URL;
    if (localApiUrl && localApiUrl.includes('localhost')) {
      console.log('Using local API URL from env:', localApiUrl);
      // Ensure the URL includes /api
      if (localApiUrl.endsWith('/api')) {
        return localApiUrl.endsWith('/') ? localApiUrl.slice(0, -1) : localApiUrl;
      } else {
        const cleanUrl = localApiUrl.endsWith('/') ? localApiUrl.slice(0, -1) : localApiUrl;
        return `${cleanUrl}/api`;
      }
    }

    // Fall back to default port
    const defaultLocal = `http://localhost:${DEFAULT_DEV_PORT}/api`;
    console.log('Using default local API URL:', defaultLocal);
    return defaultLocal;
  }

  // For production deployment
  // First try production-specific environment variable
  let apiUrl = import.meta.env?.VITE_PROD_API_URL || import.meta.env?.VITE_API_URL;

  // Special handling for Vercel deployment
  if (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('vercel')) {
    // Extract the deployment URL and append /api
    const deploymentUrl = `${window.location.protocol}//${window.location.hostname}`;
    apiUrl = `${deploymentUrl}/api`;
    console.log('Detected Vercel deployment, using:', apiUrl);
  }

  // Handle jetsetterss.com domain
  if (window.location.hostname.includes('jetsetterss.com')) {
    // Use the same domain for API calls
    apiUrl = 'https://www.jetsetterss.com/api';
    console.log('Detected jetsetterss.com domain, using production API:', apiUrl);
  }

  // If still no URL, fall back to default production URL
  if (!apiUrl) {
    apiUrl = DEFAULT_PROD_URL;
    console.log('Using default production API URL:', apiUrl);
  }

  // Handle cases where API URL doesn't have protocol
  if (apiUrl && !apiUrl.startsWith('http') && !apiUrl.startsWith('/')) {
    apiUrl = 'https://' + apiUrl;
  }

  // Ensure URL has no trailing slash conflicts
  const finalUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  console.log('Final API URL:', finalUrl);
  return finalUrl;
};

const API_BASE_URL = getApiBaseUrl();

// Create endpoint URLs
const createEndpoint = (path) => {
  // Ensure path starts with slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Remove trailing slash from base URL if present
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

  return `${baseUrl}${normalizedPath}`;
};

// Export the base URL directly for components to use
export { API_BASE_URL };

// API endpoints
export const endpoints = {
  // Auth endpoints
  auth: {
    register: createEndpoint('/auth/register'),
    login: createEndpoint('/auth/login'),
    me: createEndpoint('/auth/me')
  },

  // User endpoints
  user: {
    profile: createEndpoint('/users/profile'),
    update: createEndpoint('/users/update')
  },

  // Flight endpoints
  flights: {
    search: createEndpoint('/flights/search'),
    booking: createEndpoint('/flights/order'),
    analytics: createEndpoint('/flights/analytics'),
    cheapestDates: createEndpoint('/flights/cheapest-dates'),
    status: createEndpoint('/flights/status'),
    availabilities: createEndpoint('/flights/availabilities')
  },

  // Hotel endpoints
  hotels: {
    search: createEndpoint('/hotels/search'),
    booking: createEndpoint('/hotels/details'),
    offers: createEndpoint('/hotels/offers')
  },

  // Email endpoints
  email: {
    send: createEndpoint('/email/send'),
    callback: createEndpoint('/email/callback')
  },

  // Airport endpoints
  airports: {
    search: createEndpoint('/airports/search')
  },

  // Geo endpoints
  geo: {
    location: createEndpoint('/geo/location')
  }
};

export default {
  baseUrl: API_BASE_URL,
  endpoints
}; 