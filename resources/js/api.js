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
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add a request interceptor for authentication
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log('API Request to:', config.url);
    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

// Auth API endpoints
export const authAPI = {
  register: (userData) => api.post('auth/register', userData),
  login: (credentials) => api.post('auth/login', credentials),
  googleLogin: (tokenData) => api.post('auth/google-login', tokenData),
  getCurrentUser: () => api.get('auth/me'),
  logout: () => {
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
