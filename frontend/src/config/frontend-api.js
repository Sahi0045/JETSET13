// API URL Configuration based on the environment
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Authentication endpoints
export const AUTH_ENDPOINTS = {
  REGISTER: `${API_URL}/auth/register`,
  LOGIN: `${API_URL}/auth/login`,
  GET_ME: `${API_URL}/auth/me`,
  TEST: `${API_URL}/auth/test`
};

// User endpoints
export const USER_ENDPOINTS = {
  UPDATE_PROFILE: `${API_URL}/users/update`,
  GET_PROFILE: `${API_URL}/users/profile`
};

// Email endpoints
export const EMAIL_ENDPOINTS = {
  SEND_EMAIL: `${API_URL}/email/send`,
  SEND_CALLBACK: `${API_URL}/email/callback`
};

export default {
  BASE_URL: API_URL,
  AUTH: AUTH_ENDPOINTS,
  USER: USER_ENDPOINTS,
  EMAIL: EMAIL_ENDPOINTS
}; 