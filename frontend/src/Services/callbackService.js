import { API_BASE_URL } from '@/config/api';
import supabase from '../lib/supabase';

/**
 * Service for handling callback request operations with Supabase
 */
const callbackService = {
  /**
   * Create a new callback request in Supabase
   * @param {Object} callbackData - The callback request data
   * @returns {Promise} - The response from Supabase
   */
  createCallbackRequest: async (callbackData) => {
    try {
      console.log('Submitting callback request with simplified approach');
      
      // Define the data structure - setting preferred_time to null to avoid timestamp issues
      const requestData = {
        name: callbackData.name,
        email: callbackData.email,
        phone: callbackData.phone,
        preferred_time: null,  // Setting to null to avoid timestamp format issues
        message: callbackData.message || null,
        status: 'pending'
      };
      
      // Store the preferred time as part of the message if provided
      if (callbackData.preferredTime && callbackData.preferredTime.trim() !== '') {
        requestData.message = `Preferred time: ${callbackData.preferredTime}. ${requestData.message || ''}`.trim();
      }
      
      console.log('Request data:', requestData);
      
      // Use the REST API directly with proper headers
      const response = await fetch(`${supabase.supabaseUrl}/rest/v1/callback_requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabase.supabaseKey,
          'Authorization': `Bearer ${supabase.supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Error with direct API call:', response.status, errorData);
        throw new Error(`API error: ${response.status} - ${errorData}`);
      }
      
      console.log('Callback request successfully created!');
      
      // Send confirmation email using direct endpoint
      try {
        console.log('Sending confirmation email via direct endpoint');
        
        const emailResponse = await fetch(`${API_BASE_URL}/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            name: callbackData.name, 
            phone: callbackData.phone,
            email: callbackData.email,
            type: 'cruise',
            // Include cruise-specific details
            details: {
              preferredTime: callbackData.preferredTime,
              message: callbackData.message
            }
          })
        });
        
        if (!emailResponse.ok) {
          const emailError = await emailResponse.text();
          console.warn('Email confirmation issue:', emailError);
        } else {
          const emailResult = await emailResponse.json();
          console.log('Email sent successfully:', emailResult);
        }
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Continue despite email error - we don't want to fail the callback submission
      }
      
      return { success: true };
    } catch (error) {
      console.error('Unexpected error in createCallbackRequest:', error);
      throw error;
    }
  },
  
  /**
   * Get all callback requests from Supabase
   * @returns {Promise} - The response from Supabase
   */
  getAllCallbackRequests: async () => {
    try {
      const { data, error } = await supabase
        .from('callback_requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching callback requests:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Unexpected error in getAllCallbackRequests:', error);
      throw error;
    }
  }
};

export default callbackService;
