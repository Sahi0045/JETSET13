import supabase from '../config/supabase.js';

class Inquiry {
  // Create a new inquiry
  static async create(inquiryData) {
    try {
      console.log('Creating inquiry with data:', inquiryData);

      const { data, error } = await supabase
        .from('inquiries')
        .insert([inquiryData])
        .select()
        .single();

      if (error) {
        console.error('Supabase error during inquiry creation:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Inquiry creation error:', error);
      throw error;
    }
  }

  // Get all inquiries (admin only)
  static async findAll(filters = {}, options = {}) {
    try {
      let query = supabase
        .from('inquiries')
        .select(`
          *,
          assigned_admin:users!inquiries_assigned_admin_fkey(id, name, email)
        `);

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.inquiry_type) {
        query = query.eq('inquiry_type', filters.inquiry_type);
      }

      if (filters.assigned_admin) {
        query = query.eq('assigned_admin', filters.assigned_admin);
      }

      if (filters.priority) {
        query = query.eq('priority', filters.priority);
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
        console.error('Supabase error during inquiry fetch:', error);
        throw new Error(error.message);
      }

      return { inquiries: data, total: count };
    } catch (error) {
      console.error('Inquiry findAll error:', error);
      throw error;
    }
  }

  // Get inquiry by ID
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from('inquiries')
        .select(`
          *,
          assigned_admin:users!inquiries_assigned_admin_fkey(id, name, email),
          quotes(*)
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Supabase error during inquiry fetch:', error);
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Inquiry findById error:', error);
      throw error;
    }
  }

  // Get inquiries by user ID
  static async findByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from('inquiries')
        .select(`
          *,
          assigned_admin:users!inquiries_assigned_admin_fkey(id, name, email),
          quotes(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error during user inquiry fetch:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Inquiry findByUserId error:', error);
      throw error;
    }
  }

  // Update inquiry
  static async update(id, updateData) {
    try {
      console.log('Updating inquiry:', id, updateData);

      const { data, error } = await supabase
        .from('inquiries')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error during inquiry update:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('Inquiry update error:', error);
      throw error;
    }
  }

  // Delete inquiry
  static async delete(id) {
    try {
      const { error } = await supabase
        .from('inquiries')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase error during inquiry deletion:', error);
        throw new Error(error.message);
      }

      return true;
    } catch (error) {
      console.error('Inquiry delete error:', error);
      throw error;
    }
  }

  // Get inquiry statistics
  static async getStats() {
    try {
      const { data, error } = await supabase
        .from('inquiries')
        .select('status, inquiry_type, created_at');

      if (error) {
        console.error('Supabase error during stats fetch:', error);
        throw new Error(error.message);
      }

      // Calculate statistics
      const stats = {
        total: data.length,
        byStatus: {},
        byType: {},
        recentCount: data.filter(item =>
          new Date(item.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ).length
      };

      // Group by status
      data.forEach(item => {
        stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
      });

      // Group by type
      data.forEach(item => {
        stats.byType[item.inquiry_type] = (stats.byType[item.inquiry_type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Inquiry stats error:', error);
      throw error;
    }
  }
}

export default Inquiry;
