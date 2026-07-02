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
 * Read a cookie value by name (used for the readable CSRF double-submit token).
 */
export const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
};

// Serialize concurrent refresh attempts so a burst of 401s triggers a single /refresh.
let refreshInFlight = null;
const refreshSession = async () => {
  if (!refreshInFlight) {
    refreshInFlight = fetch(getApiUrl('auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
};

/**
 * Make an authenticated API request.
 * Auth is cookie-based (httpOnly jt_access) with a CSRF double-submit token on
 * mutations. A legacy Bearer token is attached only if one still exists in
 * storage (mobile / transition); once cookie-only, this is a no-op.
 * On a 401 we transparently refresh the session once and retry.
 * @param {string} endpoint - The endpoint path
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Response>} - Fetch response
 */
export const apiRequest = async (endpoint, options = {}, _retried = false) => {
  const url = getApiUrl(endpoint);
  const method = (options.method || 'GET').toUpperCase();

  // Default headers
  const headers = {
    'Accept': 'application/json',
    ...options.headers
  };

  // Only set Content-Type if not FormData (browser sets boundary for FormData)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Legacy Bearer token fallback (transition/mobile). No-op once cookie-only.
  const token = localStorage.getItem('token') ||
                localStorage.getItem('adminToken') ||
                localStorage.getItem('supabase_token');
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // CSRF double-submit: echo the readable jt_csrf cookie on state-changing requests.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCookie('jt_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  // Make the request (cookies always sent)
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  // Transparent one-time refresh + retry on unauthorized (expired access cookie).
  if (response.status === 401 && !_retried && !endpoint.includes('auth/refresh') && !endpoint.includes('auth/login')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiRequest(endpoint, options, true);
    }
  }

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
    body: (data instanceof FormData) ? data : JSON.stringify(data)
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
