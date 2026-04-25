import { API_BASE_URL } from '@/config/api';
import supabase from '../lib/supabase';

/**
 * Service for handling rentals/hotels callback request operations with Supabase
 */
const rentalsCallbackService = {
  /**
   * Create a new rental callback request in Supabase
   * @param {Object} rentalData - The rental callback request data
   * @returns {Promise} - The response from Supabase
   */
  createRentalCallbackRequest: async (rentalData) => {
    try {
      console.log('Submitting rental callback request');
      
      // Define the data structure
      const requestData = {
        name: rentalData.name,
        phone: rentalData.phone,
        preferred_time: rentalData.preferredTime || null,
        message: rentalData.message || null,
        hotel_name: rentalData.hotelName || null,
        check_in: rentalData.checkIn || null,
        check_out: rentalData.checkOut || null,
        guests: rentalData.guests || null,
        room_type: rentalData.roomType || null,
        total_price: rentalData.totalPrice || null,
        status: 'pending'
      };
      
      console.log('Request data:', requestData);
      
      // Use the REST API directly with proper headers
      const response = await fetch(`${supabase.supabaseUrl}/rest/v1/packages_callback`, {
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
      
      console.log('Rental callback request successfully created!');
      
      // Send confirmation email using direct endpoint
      try {
        console.log('Sending rental confirmation email via direct endpoint');
        
        const emailResponse = await fetch(`${API_BASE_URL}/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            name: rentalData.name, 
            phone: rentalData.phone,
            email: rentalData.email || `${rentalData.phone.replace(/\D/g, '')}@example.com`,
            type: 'rental',
            details: {
              hotelName: rentalData.hotelName,
              checkIn: rentalData.checkIn,
              checkOut: rentalData.checkOut,
              guests: rentalData.guests,
              roomType: rentalData.roomType,
              totalPrice: rentalData.totalPrice,
              preferredTime: rentalData.preferredTime,
              message: rentalData.message
            }
          })
        });
        
        if (!emailResponse.ok) {
          const emailError = await emailResponse.text();
          console.warn('Rental email confirmation issue:', emailError);
        } else {
          const emailResult = await emailResponse.json();
          console.log('Rental email sent successfully:', emailResult);
        }
      } catch (emailError) {
        console.error('Error sending rental confirmation email:', emailError);
        // Continue despite email error - we don't want to fail the callback submission
      }
      
      return { success: true };
    } catch (error) {
      console.error('Unexpected error in createRentalCallbackRequest:', error);
      throw error;
    }
  },
  
  /**
   * Get all rental callback requests from Supabase
   * @returns {Promise} - The response from Supabase
   */
  getAllRentalCallbackRequests: async () => {
    try {
      const { data, error } = await supabase
        .from('packages_callback')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching rental callback requests:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Unexpected error in getAllRentalCallbackRequests:', error);
      throw error;
    }
  }
};

export default rentalsCallbackService;
