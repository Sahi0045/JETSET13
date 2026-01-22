import React, { createContext, useContext, useState, useEffect } from 'react';
import supabase from '../lib/supabase';

// Create Auth Context
const SupabaseAuthContext = createContext({});

// Custom hook to use the auth context
export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext);
  if (!context) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
};

// Supabase Auth Provider Component
export const SupabaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setError(error.message);
        } else {
          setSession(session);
          setUser(session?.user ?? null);

          // Sync with localStorage
          if (session?.user) {
            const role = session.user.user_metadata?.role || 'user';
            const serializedUser = {
              id: session.user.id,
              email: session.user.email,
              firstName: session.user.user_metadata?.first_name || session.user.user_metadata?.full_name?.split(' ')[0] || '',
              lastName: session.user.user_metadata?.last_name || session.user.user_metadata?.full_name?.split(' ')[1] || '',
              photoURL: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
              role
            };

            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('user', JSON.stringify(serializedUser));

            if (session.access_token) {
              localStorage.setItem('token', session.access_token);
              localStorage.setItem('supabase_token', session.access_token);

              if (role === 'admin') {
                localStorage.setItem('adminToken', session.access_token);
              } else {
                localStorage.removeItem('adminToken');
              }
            }
          } else {
            localStorage.removeItem('isAuthenticated');
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            localStorage.removeItem('adminToken');
            localStorage.removeItem('supabase_token');
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      
      setSession(session);
      setUser(session?.user ?? null);
      setError(null);

      // Sync with localStorage
      if (session?.user) {
        const role = session.user.user_metadata?.role || 'user';
        const serializedUser = {
          id: session.user.id,
          email: session.user.email,
          firstName: session.user.user_metadata?.first_name || session.user.user_metadata?.full_name?.split(' ')[0] || '',
          lastName: session.user.user_metadata?.last_name || session.user.user_metadata?.full_name?.split(' ')[1] || '',
          photoURL: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
          role
        };

        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('user', JSON.stringify(serializedUser));

        if (session.access_token) {
          localStorage.setItem('token', session.access_token);
          localStorage.setItem('supabase_token', session.access_token);

          if (role === 'admin') {
            localStorage.setItem('adminToken', session.access_token);
          } else {
            localStorage.removeItem('adminToken');
          }
        }
      } else {
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('supabase_token');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign up with email and password
  const signUp = async (email, password, metadata = {}) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      setError(error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  // Sign in with email and password
  const signIn = async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Immediately update the auth state
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        
        // Sync with localStorage immediately
        const role = data.session.user.user_metadata?.role || 'user';
        const serializedUser = {
          id: data.session.user.id,
          email: data.session.user.email,
          firstName: data.session.user.user_metadata?.first_name || data.session.user.user_metadata?.full_name?.split(' ')[0] || '',
          lastName: data.session.user.user_metadata?.last_name || data.session.user.user_metadata?.full_name?.split(' ')[1] || '',
          photoURL: data.session.user.user_metadata?.avatar_url || data.session.user.user_metadata?.picture,
          role
        };

        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('user', JSON.stringify(serializedUser));

        if (data.session.access_token) {
          localStorage.setItem('token', data.session.access_token);
          localStorage.setItem('supabase_token', data.session.access_token);

          if (role === 'admin') {
            localStorage.setItem('adminToken', data.session.access_token);
          } else {
            localStorage.removeItem('adminToken');
          }
        }
      }

      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      setError(error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  // Sign in with OAuth provider (Google, GitHub, etc.)
  const signInWithOAuth = async (provider, options = {}) => {
    try {
      setLoading(true);
      setError(null);

      // Determine the correct redirect URL based on environment
      const isDevelopment = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1';
      
      const baseUrl = isDevelopment 
        ? window.location.origin 
        : 'https://www.jetsetterss.com';
      
      const redirectUrl = options.redirectTo || `${baseUrl}/auth/callback`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
          ...options
        }
      });

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('OAuth sign in error:', error);
      setError(error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      // Clear localStorage
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('supabase_token');

      setUser(null);
      setSession(null);

      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      setError(error.message);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  // Update user profile
  const updateProfile = async (updates) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.updateUser({
        data: updates
      });

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('Update profile error:', error);
      setError(error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  // Reset password
  const resetPassword = async (email) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      setError(error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  // Update password
  const updatePassword = async (newPassword) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('Update password error:', error);
      setError(error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    session,
    loading,
    error,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signInWithOAuth,
    signOut,
    updateProfile,
    resetPassword,
    updatePassword,
    supabase // Expose supabase client for advanced usage
  };

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export default SupabaseAuthContext;
