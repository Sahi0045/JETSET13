import supabase from '../config/supabase.js';

class BookingInfo {
  // Helper to clean date fields (convert empty strings to null)
  static cleanDateFields(data) {
    const dateFields = ['date_of_birth', 'passport_expiry_date', 'passport_issue_date'];
    const cleaned = { ...data };
    dateFields.forEach(field => {
      if (cleaned[field] === '' || cleaned[field] === undefined) {
        cleaned[field] = null;
      }
    });
    return cleaned;
  }

  // Create new booking information
  static async create(bookingData) {
    try {
      // Clean date fields before inserting
      const cleanedData = this.cleanDateFields(bookingData);
      console.log('Creating booking info with data:', cleanedData);

      const { data, error } = await supabase
        .from('booking_info')
        .insert([cleanedData])
        .select()
        .single();

      if (error) {
        console.error('Supabase error during booking info creation:', error);
        throw new Error(error.message);
      }

      console.log('✅ Booking info created successfully:', {
        id: data.id,
        status: data.status,
        expectedStatus: cleanedData.status,
        quoteId: data.quote_id
      });

      return data;
    } catch (error) {
      console.error('Booking info creation error:', error);
      throw error;
    }
  }

  // Get booking info by quote ID
  static async findByQuoteId(quoteId) {
    try {
      const { data, error } = await supabase
        .from('booking_info')
        .select('*')
        .eq('quote_id', quoteId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        console.error('Supabase error during booking info fetch:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Booking info findByQuoteId error:', error);
      throw error;
    }
  }

  // Get booking info by ID
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from('booking_info')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Supabase error during booking info fetch:', error);
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Booking info findById error:', error);
      throw error;
    }
  }

  // Update booking information
  static async update(id, updateData) {
    try {
      // Clean date fields before updating
      const cleanedUpdateData = this.cleanDateFields(updateData);
      console.log('Updating booking info:', id, cleanedUpdateData);

      // Set terms acceptance timestamps if terms are being accepted
      if (cleanedUpdateData.terms_accepted && !cleanedUpdateData.terms_accepted_at) {
        cleanedUpdateData.terms_accepted_at = new Date().toISOString();
      }
      if (cleanedUpdateData.privacy_policy_accepted && !cleanedUpdateData.privacy_policy_accepted_at) {
        cleanedUpdateData.privacy_policy_accepted_at = new Date().toISOString();
      }

      // Set submitted timestamp if status is being changed to completed
      if (cleanedUpdateData.status === 'completed' && !cleanedUpdateData.submitted_at) {
        cleanedUpdateData.submitted_at = new Date().toISOString();
      }

      cleanedUpdateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('booking_info')
        .update(cleanedUpdateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error during booking info update:', error);
        throw new Error(error.message);
      }

      console.log('✅ Booking info updated successfully:', {
        id: data.id,
        status: data.status,
        expectedStatus: cleanedUpdateData.status,
        quoteId: data.quote_id
      });

      // Update quote status if booking info is completed
      if (data && data.status === 'completed') {
        try {
          await supabase
            .from('quotes')
            .update({
              booking_info_submitted: true,
              booking_info_submitted_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', data.quote_id);
          console.log(`✅ Updated quote ${data.quote_id} booking_info_submitted status`);
        } catch (quoteError) {
          console.error('Failed to update quote booking info status:', quoteError);
        }
      }

      return data;
    } catch (error) {
      console.error('Booking info update error:', error);
      throw error;
    }
  }

  // Delete booking information
  static async delete(id) {
    try {
      const { error } = await supabase
        .from('booking_info')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase error during booking info deletion:', error);
        throw new Error(error.message);
      }

      return true;
    } catch (error) {
      console.error('Booking info delete error:', error);
      throw error;
    }
  }

  // Check if booking info is complete for a quote
  static async isCompleteForQuote(quoteId) {
    try {
      const bookingInfo = await this.findByQuoteId(quoteId);
      return bookingInfo && bookingInfo.status === 'completed';
    } catch (error) {
      console.error('Error checking booking info completion:', error);
      return false;
    }
  }

  // Get all booking info for admin review
  static async findAll(filters = {}, options = {}) {
    try {
      let query = supabase
        .from('booking_info')
        .select(`
          *,
          quote:quotes(id, quote_number, total_amount, currency, status),
          inquiry:inquiries(id, customer_name, customer_email, inquiry_type),
          user:users(id, name, email)
        `);

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.quote_id) {
        query = query.eq('quote_id', filters.quote_id);
      }

      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }

      // Apply sorting
      if (options.orderBy) {
        const [column, direction] = options.orderBy.split(':');
        query = query.order(column, { ascending: direction === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Supabase error during booking info fetch:', error);
        throw new Error(error.message);
      }

      return { bookingInfos: data, total: count };
    } catch (error) {
      console.error('Booking info findAll error:', error);
      throw error;
    }
  }
}

export default BookingInfo;

