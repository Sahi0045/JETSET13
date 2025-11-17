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

  // Get inquiries for a user by id, and also include legacy records
  // where user_id is null but customer_email matches the user's email.
  static async findForUser(userId, email) {
    try {
      const selectCols = `
        *,
        assigned_admin:users!inquiries_assigned_admin_fkey(id, name, email),
        quotes(*)
      `;

      const [byUserId, byEmail] = await Promise.all([
        supabase
          .from('inquiries')
          .select(selectCols)
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        email
          ? supabase
              .from('inquiries')
              .select(selectCols)
              .ilike('customer_email', email)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null })
      ]);

      if (byUserId.error) {
        console.error('Supabase error during findForUser(byUserId):', byUserId.error);
        throw new Error(byUserId.error.message);
      }
      if (byEmail.error) {
        console.error('Supabase error during findForUser(byEmail):', byEmail.error);
        throw new Error(byEmail.error.message);
      }

      const map = new Map();
      (byUserId.data || []).forEach(row => map.set(row.id, row));
      (byEmail.data || []).forEach(row => map.set(row.id, row));
      return Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
      console.error('Inquiry findForUser error:', error);
      throw error;
    }
  }

  // Update inquiry
  static async update(id, updateData) {
    try {
      console.log('Updating inquiry:', id, updateData);

      // Remove any undefined or null values that shouldn't be sent
      const cleanedData = {};
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          cleanedData[key] = updateData[key];
        }
      });

      // Ensure we have at least one field to update (besides updated_at)
      const fieldsToUpdate = Object.keys(cleanedData).filter(k => k !== 'updated_at');
      if (fieldsToUpdate.length === 0) {
        throw new Error('No fields to update');
      }

      const { data, error } = await supabase
        .from('inquiries')
        .update(cleanedData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error during inquiry update:', error);
        console.error('Error code:', error.code);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        
        // Provide more specific error messages
        if (error.code === '23505') {
          throw new Error('Duplicate entry: This value already exists');
        } else if (error.code === '23503') {
          throw new Error('Foreign key constraint violation: Referenced record does not exist');
        } else if (error.code === '23514') {
          throw new Error('Check constraint violation: Invalid value for field');
        } else if (error.code === 'PGRST116') {
          throw new Error('Inquiry not found');
        } else {
          throw new Error(error.message || 'Failed to update inquiry');
        }
      }

      if (!data) {
        throw new Error('Inquiry not found');
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
