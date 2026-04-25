// Re-export everything from the main API config
export { API_BASE_URL, endpoints } from './api-src.js';
import apiSrcConfig from './api-src.js';

// API configuration
const config = {
  ...apiSrcConfig,
  baseURL: apiSrcConfig.baseUrl || apiSrcConfig.baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
};

export default config;
