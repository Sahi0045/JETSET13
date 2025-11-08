import supabase from '../config/supabase.js';

class Payment {
  // Create a new payment record
  static async create(paymentData) {
    try {
      console.log('Creating payment with data:', paymentData);

      const { data, error } = await supabase
        .from('payments')
        .insert([paymentData])
        .select()
        .single();

      if (error) {
        console.error('Supabase error during payment creation:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Payment creation error:', error);
      throw error;
    }
  }

  // Find payment by ID
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          quote:quotes(*),
          inquiry:inquiries(*)
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Supabase error during payment fetch:', error);
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Payment findById error:', error);
      throw error;
    }
  }

  // Find payment by quote ID
  static async findByQuoteId(quoteId) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error during payment fetch by quote:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Payment findByQuoteId error:', error);
      throw error;
    }
  }

  // Find payment by ARC session ID
  static async findBySessionId(sessionId) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          quote:quotes(*),
          inquiry:inquiries(*)
        `)
        .eq('arc_session_id', sessionId)
        .single();

      if (error) {
        console.error('Supabase error during payment fetch by session:', error);
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Payment findBySessionId error:', error);
      throw error;
    }
  }

  // Find payment by ARC order ID
  static async findByArcOrderId(arcOrderId) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          quote:quotes(*),
          inquiry:inquiries(*)
        `)
        .eq('arc_order_id', arcOrderId)
        .single();

      if (error) {
        console.error('Supabase error during payment fetch by order ID:', error);
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Payment findByArcOrderId error:', error);
      throw error;
    }
  }

  // Update payment record
  static async update(id, updateData) {
    try {
      console.log('Updating payment:', id, updateData);

      const { data, error } = await supabase
        .from('payments')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error during payment update:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Payment update error:', error);
      throw error;
    }
  }

  // Update payment status with transaction details
  static async updateStatus(id, statusData) {
    try {
      const updateData = {
        payment_status: statusData.payment_status,
        updated_at: new Date().toISOString()
      };

      if (statusData.completed_at) {
        updateData.completed_at = statusData.completed_at;
      }

      if (statusData.arc_transaction_id) {
        updateData.arc_transaction_id = statusData.arc_transaction_id;
      }

      if (statusData.payment_method) {
        updateData.payment_method = statusData.payment_method;
      }

      if (statusData.metadata) {
        updateData.metadata = statusData.metadata;
      }

      console.log('Updating payment status:', id, updateData);

      const { data, error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error during payment status update:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Payment updateStatus error:', error);
      throw error;
    }
  }

  // Get all payments (admin only)
  static async findAll(filters = {}, options = {}) {
    try {
      let query = supabase
        .from('payments')
        .select(`
          *,
          quote:quotes(quote_number, title, total_amount),
          inquiry:inquiries(customer_name, customer_email, inquiry_type)
        `);

      // Apply filters
      if (filters.payment_status) {
        query = query.eq('payment_status', filters.payment_status);
      }

      if (filters.quote_id) {
        query = query.eq('quote_id', filters.quote_id);
      }

      if (filters.inquiry_id) {
        query = query.eq('inquiry_id', filters.inquiry_id);
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
        console.error('Supabase error during payments fetch:', error);
        throw new Error(error.message);
      }

      return { payments: data, total: count };
    } catch (error) {
      console.error('Payment findAll error:', error);
      throw error;
    }
  }

  // Get payment statistics
  static async getStatistics() {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('payment_status, amount, currency');

      if (error) {
        console.error('Supabase error during payment statistics fetch:', error);
        throw new Error(error.message);
      }

      const stats = {
        total: data.length,
        completed: data.filter(p => p.payment_status === 'completed').length,
        pending: data.filter(p => p.payment_status === 'pending').length,
        failed: data.filter(p => p.payment_status === 'failed').length,
        totalAmount: data
          .filter(p => p.payment_status === 'completed')
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
      };

      return stats;
    } catch (error) {
      console.error('Payment statistics error:', error);
      throw error;
    }
  }
}

export default Payment;
