/**
 * Service for handling email API calls
 */
import axios from 'axios';
import apiConfig from '@/config/api';

const emailAPIService = {
  /**
   * Sends an email via the API
   * @param {Object} emailData - Email data object
   * @returns {Promise<Object>} - Response from the API
   */
  sendEmail: async (emailData) => {
    try {
      const baseUrl = apiConfig.baseUrl;
      const apiUrl = `${baseUrl}/email/send`;
      
      const response = await axios.post(apiUrl, emailData);
      return response.data;
    } catch (error) {
      console.error('Error sending email:', error);
      // We don't want to block the main flow if email fails
      return { success: false, error: error.message };
    }
  },

  /**
   * Tests API connection
   * @returns {Promise<Object>} - Result of API test
   */
  testConnection: async () => {
    try {
      // This is a simple endpoint that should work if the API is accessible
      try {
        const baseUrl = apiConfig.baseUrl;
        // Ensure URL is properly constructed with slash
        const testUrl = `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}test`;
        
        const response = await axios.get(testUrl, {
          timeout: 5000 // 5 seconds timeout
        });
        
        return { success: true, data: response.data };
      } catch (connectionError) {
        console.warn('API connection test failed:', connectionError);
        return { success: false, error: connectionError.message };
      }
    } catch (error) {
      console.error('Unexpected error in testConnection:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send a callback confirmation email
   * @param {Object} data - The callback data
   * @param {string} type - Type of callback ('cruise', 'package', 'rental')
   * @returns {Promise} - The response from the API
   */
  sendCallbackConfirmation: async (data, type) => {
    try {
      console.log('Sending callback confirmation email', { data, type });
      
      // First, try a direct API call to the test endpoint to verify connectivity
      // This is a simple endpoint that should work if the API is accessible
      try {
        const baseUrl = apiConfig.baseUrl;
        // Ensure URL is properly constructed with slash
        const testUrl = `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}test`;
        
        console.log('Testing API connectivity at:', testUrl);
        await fetch(testUrl, { method: 'GET' })
          .then(res => console.log('API connectivity test:', res.ok ? 'Success' : 'Failed'));
      } catch (e) {
        console.log('API connectivity test failed:', e.message);
      }
      
      // Try a relative URL approach which avoids CORS issues
      // If the app is served from the same origin as the API
      const apiUrl = '/api/email/send-callback-confirmation';
      console.log('Using API URL:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data, type }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error sending confirmation email:', errorText);
        throw new Error(`Email API error: ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log('Email confirmation sent successfully:', responseData);
      return responseData;
    } catch (error) {
      console.error('Unexpected error in sendCallbackConfirmation:', error);
      // We don't want to block the main flow if email fails
      return { success: false, error: error.message };
    }
  }
};

export default emailAPIService;
