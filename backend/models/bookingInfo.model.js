import supabase from '../config/supabase.js';

class BookingInfo {
  // Create new booking information
  static async create(bookingData) {
    try {
      console.log('Creating booking info with data:', bookingData);

      const { data, error } = await supabase
        .from('booking_info')
        .insert([bookingData])
        .select()
        .single();

      if (error) {
        console.error('Supabase error during booking info creation:', error);
        throw new Error(error.message);
      }

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
      console.log('Updating booking info:', id, updateData);

      // Set terms acceptance timestamps if terms are being accepted
      if (updateData.terms_accepted && !updateData.terms_accepted_at) {
        updateData.terms_accepted_at = new Date().toISOString();
      }
      if (updateData.privacy_policy_accepted && !updateData.privacy_policy_accepted_at) {
        updateData.privacy_policy_accepted_at = new Date().toISOString();
      }

      // Set submitted timestamp if status is being changed to completed
      if (updateData.status === 'completed' && !updateData.submitted_at) {
        updateData.submitted_at = new Date().toISOString();
      }

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('booking_info')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error during booking info update:', error);
        throw new Error(error.message);
      }

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

