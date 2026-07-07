import axios from 'axios';
import API_CONFIG from './config/api.config';

// API URL based on environment (automatically detects localhost vs production)
const API_URL = API_CONFIG.API_URL;

console.log('🔗 API Configuration:', {
  environment: API_CONFIG.IS_DEVELOPMENT ? 'Development' : 'Production',
  apiUrl: API_URL,
  hostname: window.location.hostname
});

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send/receive the httpOnly session cookies
  headers: {
    'Content-Type': 'application/json'
  }
});

// Read a cookie value (readable CSRF double-submit token).
const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
};

// Add a request interceptor: cookie auth + CSRF on mutations (+ legacy Bearer fallback).
api.interceptors.request.use(
  (config) => {
    // Auth is via httpOnly cookies (credentials: 'include'). No localStorage token.
    const method = (config.method || 'get').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = getCookie('jt_csrf');
      if (csrf) config.headers['X-CSRF-Token'] = csrf;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Serialize concurrent refreshes so a burst of 401s triggers a single /refresh.
let refreshInFlight = null;
const refreshSession = () => {
  if (!refreshInFlight) {
    refreshInFlight = api.post('auth/refresh')
      .then(() => true)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
};

// Response interceptor: on 401, refresh the session once and retry the request.
api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || '';
    if (status === 401 && original && !original._retried && !url.includes('auth/refresh') && !url.includes('auth/login')) {
      original._retried = true;
      const refreshed = await refreshSession();
      if (refreshed) return api(original);
    }
    console.error('API Error:', status, error.response?.data);
    return Promise.reject(error);
  }
);

// Auth API endpoints
export const authAPI = {
  register: (userData) => api.post('auth/register', userData),
  login: (credentials) => api.post('auth/login', credentials),
  googleLogin: (tokenData) => api.post('auth/google-login', tokenData),
  getCurrentUser: () => api.get('auth/me'),
  // Exchange a Supabase session for httpOnly cookies (call once right after sign-in).
  createSession: (access_token, refresh_token) => api.post('auth/session', { access_token, refresh_token }),
  refreshSession: () => api.post('auth/refresh'),
  logout: async () => {
    try { await api.post('auth/logout'); } catch (_) { /* clear client state regardless */ }
    localStorage.removeItem('token');
    return Promise.resolve();
  }
};

// User API endpoints
export const userAPI = {
  getAllUsers: () => api.get('users'),
  getUserById: (userId) => api.get(`users/${userId}`),
  updateUser: (userId, userData) => api.put(`users/${userId}`, userData),
  deleteUser: (userId) => api.delete(`users/${userId}`)
};

export default api;
