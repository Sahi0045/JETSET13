import bcrypt from 'bcryptjs';
import supabase from '../config/supabase.js';

class User {
  /**
   * `id` is the row's primary key, and it must be the caller's Supabase auth
   * uid whenever there is one.
   *
   * This used to insert with no `id` at all, so the row took the table default -
   * a fresh uuid unrelated to `auth.users`. `bookings.user_id` REFERENCES
   * auth.users(id), so a user provisioned this way (auth.middleware.js
   * autoProvisionSupabaseUser, which runs whenever a valid Supabase token has no
   * public.users row) got an id that fails that foreign key. The checkout upsert
   * then failed as a whole and was caught as non-blocking: the customer paid at
   * ARC, no booking row existed, POST /order answered PAYMENT_NOT_FOUND, and the
   * abandoned-checkout job could not see it because it reads `bookings`.
   */
  static async create({ id = null, firstName, lastName, email, password, googleId = null, isGoogleAccount = false }) {
    try {
      console.log('Creating user with data:', { firstName, lastName, email, hasGoogleId: !!googleId });
      
      // Check if user already exists using a simple query
      const { data: users, error: queryError } = await supabase
        .from('users')
        .select('email')
        .eq('email', email);

      if (queryError) {
        console.error('Error checking existing user:', queryError);
      } else if (users && users.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Generate a full name from firstName and lastName
      const fullName = `${firstName} ${lastName}`.trim();
      
      // Insert user with basic fields first
      const { data, error } = await supabase
        .from('users')
        .insert([{
          ...(id ? { id } : {}),
          email: email,
          password: hashedPassword,
          name: fullName,
          first_name: firstName,
          last_name: lastName,
          ...(googleId ? { google_id: googleId, is_google_account: isGoogleAccount } : {})
        }])
        .select();

      if (error) {
        console.error('Supabase error during user creation:', error);
        throw new Error(error.message);
      }
      
      if (!data || data.length === 0) {
        throw new Error('Failed to create user');
      }

      const createdUser = data[0];
      console.log('User created successfully:', { 
        id: createdUser.id, 
        email: createdUser.email, 
        name: createdUser.name
      });
      
      // Transform the response to match our API format
      return {
        id: createdUser.id,
        firstName: firstName,
        lastName: lastName,
        name: createdUser.name,
        email: createdUser.email,
        role: 'user' // Default role
      };
    } catch (error) {
      console.error('Error in User.create:', error);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      console.log('Finding user by email:', email);
      
      // Remove .single() to avoid error when no user found
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email);

      if (error) {
        console.error('Supabase error during findByEmail:', error);
        throw error;
      }
      
      // If we have data and at least one user record
      if (data && data.length > 0) {
        // Not the row: it holds the password hash and the profile's passport number.
        console.log('Found user:', { id: data[0].id, role: data[0].role });
        
        return {
          ...data[0],
          firstName: data[0].first_name,
          lastName: data[0].last_name,
          role: data[0].role || 'user' // Include role field
        };
      }
      
      console.log('No user found with email:', email);
      return null;
    } catch (error) {
      console.error('Error in User.findByEmail:', error);
      // Return null instead of throwing error when not found
      if (error.code === 'PGRST116') {
        console.log('No user found with email (caught error):', email);
        return null;
      }
      throw error;
    }
  }

  static async findById(id) {
    try {
      console.log('Finding user by id:', id);
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Supabase error during findById:', error);
        throw error;
      }
      
      console.log('Found user:', data ? { id: data.id, role: data.role } : null);
      
      if (data) {
        return {
          ...data,
          firstName: data.first_name,
          lastName: data.last_name,
          role: data.role || 'user' // Include role field
        };
      }
      return null;
    } catch (error) {
      console.error('Error in User.findById:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    try {
      console.log('Updating user:', id, 'with data:', updates);
      
      const supabaseUpdates = { ...updates };
      
      if (updates.password) {
        const salt = await bcrypt.genSalt(10);
        supabaseUpdates.password = await bcrypt.hash(updates.password, salt);
      }
      
      if (updates.firstName) {
        supabaseUpdates.first_name = updates.firstName;
        delete supabaseUpdates.firstName;
      }
      
      if (updates.lastName) {
        supabaseUpdates.last_name = updates.lastName;
        delete supabaseUpdates.lastName;
      }

      // Map Google linkage fields to their snake_case columns.
      if (updates.googleId !== undefined) {
        supabaseUpdates.google_id = updates.googleId;
        delete supabaseUpdates.googleId;
      }
      if (updates.isGoogleAccount !== undefined) {
        supabaseUpdates.is_google_account = updates.isGoogleAccount;
        delete supabaseUpdates.isGoogleAccount;
      }

      const { data, error } = await supabase
        .from('users')
        .update(supabaseUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error during update:', error);
        throw error;
      }
      
      console.log('User updated successfully:', data);
      
      return {
        ...data,
        firstName: data.first_name,
        lastName: data.last_name
      };
    } catch (error) {
      console.error('Error in User.update:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      console.log('Deleting user:', id);
      
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase error during delete:', error);
        throw error;
      }
      
      console.log('User deleted successfully');
      return true;
    } catch (error) {
      console.error('Error in User.delete:', error);
      throw error;
    }
  }

  static async matchPassword(enteredPassword, hashedPassword) {
    try {
      const isMatch = await bcrypt.compare(enteredPassword, hashedPassword);
      console.log('Password match result:', isMatch);
      return isMatch;
    } catch (error) {
      console.error('Error in User.matchPassword:', error);
      throw error;
    }
  }
}

export default User;
