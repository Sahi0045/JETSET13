import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import supabase from '../lib/supabase';
import { getApiUrl } from '../utils/apiHelper';

// Create Auth Context
const SupabaseAuthContext = createContext({});

// Hand the Supabase tokens to the backend ONCE so it can set httpOnly session
// cookies (jt_access/jt_refresh) + a readable CSRF token. Best-effort: the app
// still works via the Supabase session if this fails, but cookie-auth'd API
// calls depend on it. Deduped per access token to avoid redundant round-trips.
let lastSessionToken = null;
const establishServerSession = async (session) => {
  if (!session?.access_token || session.access_token === lastSessionToken) return;
  lastSessionToken = session.access_token;
  try {
    await fetch(getApiUrl('auth/session'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    });
  } catch (e) {
    console.warn('Failed to establish server session cookie:', e?.message);
  }
};

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
        let { data: { session }, error } = await supabase.auth.getSession();

        // persistSession:false means the SDK has no session after a reload, but
        // the httpOnly refresh cookie may still be valid. Re-hydrate the
        // in-memory Supabase session from the backend so the client works again
        // without any token ever touching localStorage.
        if (!session) {
          try {
            const resp = await fetch(getApiUrl('auth/supabase-session'), { credentials: 'include' });
            if (resp.ok) {
              const payload = await resp.json();
              if (payload.access_token && payload.refresh_token) {
                // Mark as rehydration so onAuthStateChange skips the login email.
                sessionStorage.setItem('_rehydrating', '1');
                const { data: setData } = await supabase.auth.setSession({
                  access_token: payload.access_token,
                  refresh_token: payload.refresh_token,
                });
                sessionStorage.removeItem('_rehydrating');
                session = setData?.session ?? null;
              }
            }
          } catch (e) {
            console.warn('Session re-hydration skipped:', e?.message);
            sessionStorage.removeItem('_rehydrating');
          }
        }

        if (error) {
          console.error('Error getting session:', error);
          setError(error.message);
        } else {
          setSession(session);
          setUser(session?.user ?? null);

          // Establish the httpOnly cookie session on the backend (additive).
          if (session?.access_token) establishServerSession(session);

          // No localStorage writes — auth state lives in context + httpOnly cookies.
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

      // Establish the httpOnly cookie session on the backend (additive).
      if (session?.access_token) establishServerSession(session);

      if (session?.user) {
        // 📧 Send login notification only on a genuine new sign-in (not refresh).
        // Use sessionStorage so it dedupes within a browser session but allows
        // a fresh email after the tab is closed and reopened (real re-login).
        const alreadyNotified = sessionStorage.getItem('loginNotifiedUserId') === session.user.id;
        // Skip email on rehydration (page refresh restoring an existing session)
        const isRehydration = sessionStorage.getItem('_rehydrating') === '1';
        if (event === 'SIGNED_IN' && !alreadyNotified && !isRehydration) {
          sessionStorage.setItem('loginNotifiedUserId', session.user.id);
          try {
            const loginTime = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
            const provider = session.user.app_metadata?.provider || 'email';
            const isOAuth = provider !== 'email';
            const firstName = session.user.user_metadata?.first_name || session.user.user_metadata?.full_name?.split(' ')[0] || '';
            await fetch('/api/email/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'login_notification',
                to: session.user.email,
                data: {
                  customerName: firstName || 'Valued Customer',
                  email: session.user.email,
                  loginTime,
                  ipAddress: 'Your device',
                  deviceInfo: `${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'} - ${isOAuth ? `${provider.charAt(0).toUpperCase() + provider.slice(1)} Sign-In` : 'Email Login'}`
                }
              })
            });
          } catch (emailError) {
            console.warn('Login notification email failed:', emailError);
          }
        }
      } else {
        sessionStorage.removeItem('loginNotifiedUserId');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign up with email and password
  const signUp = useCallback(async (email, password, metadata = {}) => {
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
  }, []);

  // Sign in with email and password
  const signIn = useCallback(async (email, password) => {
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

        // Establish the httpOnly cookie session on the backend (additive).
        establishServerSession(data.session);

        // Auth state is in context + httpOnly cookies — no localStorage.


        // 📧 Send login notification email
        try {
          const loginTime = new Date().toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
          });

          await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'login_notification',
              to: data.session.user.email,
              data: {
                customerName: serializedUser.firstName || 'Valued Customer',
                email: data.session.user.email,
                loginTime,
                ipAddress: 'Your device',
                deviceInfo: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser'
              }
            })
          });
          console.log('📧 Login notification email sent');
        } catch (emailError) {
          console.warn('Failed to send login email:', emailError);
          // Don't fail login if email fails
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
  }, []);

  // Sign in with OAuth provider (Google, GitHub, etc.)
  const signInWithOAuth = useCallback(async (provider, options = {}) => {
    try {
      setLoading(true);
      setError(null);

      // Determine the correct redirect URL based on environment
      const isDevelopment = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      const baseUrl = isDevelopment
        ? window.location.origin
        : (window.location.hostname.includes('jetsetterss.com') ? window.location.origin : 'https://www.jetsetterss.com');

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
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user email before signing out for the logout notification
      const currentUserEmail = user?.email;
      const currentUserName = user?.user_metadata?.first_name || user?.user_metadata?.full_name?.split(' ')[0] || '';

      // Best-effort local Supabase sign-out. With persistSession:false the SDK
      // may report "Auth session missing" — that must NOT abort logout, or the
      // cookie/session cleanup below would be skipped and the user stays signed in.
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (e) {
        console.warn('Supabase signOut warning (ignored):', e?.message);
      }

      // Clear the backend httpOnly cookie session (the real credential). This
      // MUST run so the refresh cookie can't re-hydrate the session on reload.
      lastSessionToken = null;
      try {
        await fetch(getApiUrl('auth/logout'), { method: 'POST', credentials: 'include' });
      } catch (_) { /* clear client state regardless */ }

      // 📧 Send logout notification email
      if (currentUserEmail) {
        try {
          const logoutTime = new Date().toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
          });

          await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'logout_notification',
              to: currentUserEmail,
              data: {
                customerName: currentUserName || 'Valued Customer',
                email: currentUserEmail,
                logoutTime,
                deviceInfo: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser'
              }
            })
          });
          console.log('📧 Logout notification email sent');
        } catch (emailError) {
          console.warn('Failed to send logout email:', emailError);
          // Don't fail logout if email fails
        }
      }

      setUser(null);
      setSession(null);
      sessionStorage.removeItem('loginNotifiedUserId');

      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      setError(error.message);
      return { error };
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Update user profile
  const updateProfile = useCallback(async (updates) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.updateUser({
        data: updates
      });

      if (error) throw error;

      // Persist profile fields to the `users` table (system of record) so the
      // phone number and names are durable and queryable, not just in auth metadata.
      const authUser = data?.user;
      if (authUser?.id) {
        const dbUpdates = { id: authUser.id, updated_at: new Date().toISOString() };
        if (updates.first_name !== undefined) dbUpdates.first_name = updates.first_name;
        if (updates.last_name !== undefined) dbUpdates.last_name = updates.last_name;
        if (updates.full_name !== undefined) dbUpdates.name = updates.full_name;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone;

        const { error: dbError } = await supabase
          .from('users')
          .upsert(dbUpdates, { onConflict: 'id' });

        // Auth metadata is the primary store; don't fail the whole update if the
        // DB write fails, but surface it for debugging.
        if (dbError) {
          console.warn('Profile saved to auth, but users table update failed:', dbError.message);
        }
      }

      return { data, error: null };
    } catch (error) {
      console.error('Update profile error:', error);
      setError(error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset password
  const resetPassword = useCallback(async (email) => {
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
  }, []);

  // Update password
  const updatePassword = useCallback(async (newPassword) => {
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
  }, []);

  const value = useMemo(() => ({
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
  }), [user, session, loading, error, signUp, signIn, signInWithOAuth, signOut, updateProfile, resetPassword, updatePassword]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export default SupabaseAuthContext;
