import supabase from '../config/supabase.js';

class Quote {
  // Create a new quote
  static async create(quoteData) {
    try {
      console.log('Creating quote with data:', quoteData);

      const { data, error } = await supabase
        .from('quotes')
        .insert([quoteData])
        .select()
        .single();

      if (error) {
        console.error('Supabase error during quote creation:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Quote creation error:', error);
      throw error;
    }
  }

  // Get all quotes (admin only)
  static async findAll(filters = {}, options = {}) {
    try {
      let query = supabase
        .from('quotes')
        .select(`
          *,
          inquiry:inquiries(id, customer_name, customer_email, inquiry_type),
          admin:users!quotes_admin_id_fkey(id, name, email),
          attachments:quote_attachments(*)
        `);

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.inquiry_id) {
        query = query.eq('inquiry_id', filters.inquiry_id);
      }

      if (filters.admin_id) {
        query = query.eq('admin_id', filters.admin_id);
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
        console.error('Supabase error during quote fetch:', error);
        throw new Error(error.message);
      }

      return { quotes: data, total: count };
    } catch (error) {
      console.error('Quote findAll error:', error);
      throw error;
    }
  }

  // Get quote by ID
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          inquiry:inquiries(*),
          admin:users!quotes_admin_id_fkey(id, name, email),
          attachments:quote_attachments(*)
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Supabase error during quote fetch:', error);
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Quote findById error:', error);
      throw error;
    }
  }

  // Get quotes by inquiry ID
  static async findByInquiryId(inquiryId) {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          admin:users!quotes_admin_id_fkey(id, name, email),
          attachments:quote_attachments(*)
        `)
        .eq('inquiry_id', inquiryId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error during inquiry quote fetch:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Quote findByInquiryId error:', error);
      throw error;
    }
  }

  // Update quote
  static async update(id, updateData) {
    try {
      console.log('Updating quote:', id, updateData);

      const { data, error } = await supabase
        .from('quotes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error during quote update:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Quote update error:', error);
      throw error;
    }
  }

  // Delete quote
  static async delete(id) {
    try {
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase error during quote deletion:', error);
        throw new Error(error.message);
      }

      return true;
    } catch (error) {
      console.error('Quote delete error:', error);
      throw error;
    }
  }

  // Send quote (mark as sent and set expiration)
  static async sendQuote(id, adminId) {
    try {
      // First, get the quote to check validity_days
      const existingQuote = await this.findById(id);
      if (!existingQuote) {
        throw new Error('Quote not found');
      }

      // Use existing validity_days or default to 30
      const validityDays = existingQuote.validity_days || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validityDays);

      // Don't update admin_id - it should already be set
      const updateData = {
        status: 'sent',
        sent_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString()
      };

      console.log('Sending quote with update data:', updateData);
      const updatedQuote = await this.update(id, updateData);

      // Update inquiry status to 'quoted'
      if (updatedQuote && updatedQuote.inquiry_id) {
        try {
          const { data: inquiryData, error: inquiryError } = await supabase
            .from('inquiries')
            .update({ 
              status: 'quoted',
              updated_at: new Date().toISOString()
            })
            .eq('id', updatedQuote.inquiry_id)
            .select()
            .single();

          if (inquiryError) {
            console.error('Failed to update inquiry status:', inquiryError);
            // Don't throw - quote was sent successfully, inquiry update is secondary
          } else {
            console.log(`✅ Updated inquiry ${updatedQuote.inquiry_id} status to 'quoted'`);
          }
        } catch (inquiryError) {
          console.error('Exception updating inquiry status:', inquiryError);
          // Don't throw - quote was sent successfully
        }
      }

      return updatedQuote;
    } catch (error) {
      console.error('Quote send error:', error);
      throw error;
    }
  }

  // Accept quote
  static async acceptQuote(id) {
    try {
      const updateData = {
        status: 'accepted',
        accepted_at: new Date().toISOString()
      };

      const updatedQuote = await this.update(id, updateData);

      // Update inquiry status to 'booked'
      if (updatedQuote && updatedQuote.inquiry_id) {
        try {
          await supabase
            .from('inquiries')
            .update({ 
              status: 'booked',
              updated_at: new Date().toISOString()
            })
            .eq('id', updatedQuote.inquiry_id);
          console.log(`✅ Updated inquiry ${updatedQuote.inquiry_id} status to 'booked'`);
        } catch (inquiryError) {
          console.error('Failed to update inquiry status:', inquiryError);
        }
      }

      return updatedQuote;
    } catch (error) {
      console.error('Quote accept error:', error);
      throw error;
    }
  }

  // Generate unique quote number
  static generateQuoteNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `Q-${timestamp}-${random}`;
  }

  // Get expired quotes
  static async getExpiredQuotes() {
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          inquiry:inquiries(customer_name, customer_email)
        `)
        .eq('status', 'sent')
        .lt('expires_at', now);

      if (error) {
        console.error('Supabase error during expired quotes fetch:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Expired quotes fetch error:', error);
      throw error;
    }
  }

  // Get expiring soon quotes (next 7 days)
  static async getExpiringSoonQuotes() {
    try {
      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(now.getDate() + 7);

      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          inquiry:inquiries(customer_name, customer_email)
        `)
        .eq('status', 'sent')
        .gte('expires_at', now.toISOString())
        .lte('expires_at', sevenDaysFromNow.toISOString());

      if (error) {
        console.error('Supabase error during expiring soon quotes fetch:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Expiring soon quotes fetch error:', error);
      throw error;
    }
  }
}

export default Quote;
