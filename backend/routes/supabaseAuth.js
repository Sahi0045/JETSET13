import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * OAuth Callback Handler
 * Handles the redirect from OAuth providers (Google, GitHub, etc.)
 */
router.get('/auth/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, error_description);
      return res.redirect(`/login?error=${encodeURIComponent(error_description || error)}`);
    }

    // Exchange code for session
    if (code) {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('Error exchanging code for session:', exchangeError);
        return res.redirect(`/login?error=${encodeURIComponent(exchangeError.message)}`);
      }

      if (data.session) {
        // Successfully authenticated
        console.log('User authenticated via OAuth:', data.session.user.email);
        
        // You can set cookies here if needed
        // res.cookie('supabase-auth-token', data.session.access_token, {
        //   httpOnly: true,
        //   secure: process.env.NODE_ENV === 'production',
        //   maxAge: data.session.expires_in * 1000
        // });

        // Redirect to the intended page
        const redirectTo = req.query.redirect_to || '/my-trips';
        return res.redirect(redirectTo);
      }
    }

    // If no code and no error, redirect to login
    res.redirect('/login');
  } catch (err) {
    console.error('Callback handler error:', err);
    res.redirect(`/login?error=${encodeURIComponent('Authentication failed. Please try again.')}`);
  }
});

/**
 * OAuth Sign In Endpoint
 * Initiates OAuth flow with proper redirect URLs
 */
router.post('/auth/oauth/signin', async (req, res) => {
  try {
    const { provider, redirectTo } = req.body;

    // Validate provider
    const validProviders = ['google', 'github', 'facebook', 'twitter'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Invalid OAuth provider' });
    }

    // Get the base URL (production or development)
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://www.jetsetterss.com'
      : `http://localhost:${process.env.PORT || 3000}`;

    // Initiate OAuth flow
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${baseUrl}${redirectTo || '/auth/callback'}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Return the OAuth URL for client-side redirect
    res.json({ url: data.url });
  } catch (err) {
    console.error('OAuth signin error:', err);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

/**
 * Verify Session Endpoint
 * Verifies if a session token is valid
 */
router.get('/auth/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        role: user.user_metadata?.role || 'user'
      }
    });
  } catch (err) {
    console.error('Verify session error:', err);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

/**
 * Session Refresh Endpoint
 * Refreshes an expired session using refresh token
 */
router.post('/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ error: 'Failed to refresh session' });
  }
});

export default router;
