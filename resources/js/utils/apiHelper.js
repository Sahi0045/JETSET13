/**
 * API Helper Utilities
 * Provides helper functions for making API calls that work in both localhost and production
 */

import API_CONFIG from '../config/api.config';

/**
 * Get the full API URL for an endpoint
 * @param {string} endpoint - The endpoint path (e.g., '/inquiries', '/users', etc.)
 * @returns {string} - Full URL that works in both development and production
 */
export const getApiUrl = (endpoint) => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_CONFIG.API_URL}/${cleanEndpoint}`;
};

/**
 * Make an authenticated API request
 * @param {string} endpoint - The endpoint path
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Response>} - Fetch response
 */
export const apiRequest = async (endpoint, options = {}) => {
  const url = getApiUrl(endpoint);
  
  // Default headers
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers
  };

  // Add auth token if available
  const token = localStorage.getItem('token') || 
                localStorage.getItem('adminToken') || 
                localStorage.getItem('supabase_token');
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Make the request
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  return response;
};

/**
 * Make a GET request
 */
export const apiGet = (endpoint, options = {}) => {
  return apiRequest(endpoint, { ...options, method: 'GET' });
};

/**
 * Make a POST request
 */
export const apiPost = (endpoint, data, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data)
  });
};

/**
 * Make a PUT request
 */
export const apiPut = (endpoint, data, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data)
  });
};

/**
 * Make a DELETE request
 */
export const apiDelete = (endpoint, options = {}) => {
  return apiRequest(endpoint, { ...options, method: 'DELETE' });
};

export default {
  getApiUrl,
  apiRequest,
  apiGet,
  apiPost,
  apiPut,
  apiDelete
};
