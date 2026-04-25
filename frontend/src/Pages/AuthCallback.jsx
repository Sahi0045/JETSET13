import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { supabase } = useSupabaseAuth();
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse hash fragment for tokens (implicit flow)
        const hashParams = new URLSearchParams(location.hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        
        // Get the code from URL params (PKCE flow)
        const code = searchParams.get('code');
        const error_description = searchParams.get('error_description') || hashParams.get('error_description');
        
        if (error_description) {
          setError(error_description);
          setProcessing(false);
          setTimeout(() => navigate('/supabase-login'), 3000);
          return;
        }

        // Handle hash-based token flow (implicit grant)
        if (access_token && refresh_token) {
          console.log('Processing hash-based OAuth tokens');
          
          // Set the session with the tokens
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token
          });
          
          if (error) {
            console.error('Error setting session from hash:', error);
            setError(error.message);
            setProcessing(false);
            setTimeout(() => navigate('/supabase-login'), 3000);
            return;
          }

          if (data.session) {
            console.log('Session established from hash:', data.session);
            
            // Store in localStorage
            const role = data.session.user.user_metadata?.role || 'user';
            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('user', JSON.stringify({
              id: data.session.user.id,
              email: data.session.user.email,
              firstName: data.session.user.user_metadata?.first_name || data.session.user.user_metadata?.full_name?.split(' ')[0] || data.session.user.user_metadata?.name || '',
              lastName: data.session.user.user_metadata?.last_name || data.session.user.user_metadata?.full_name?.split(' ')[1] || '',
              photoURL: data.session.user.user_metadata?.avatar_url || data.session.user.user_metadata?.picture,
              role
            }));

            if (data.session.access_token) {
              localStorage.setItem('token', data.session.access_token);
            localStorage.setItem('supabase_token', data.session.access_token);

              if (role === 'admin') {
                localStorage.setItem('adminToken', data.session.access_token);
              }
              // Don't remove adminToken — it may have been set by custom admin login
            }

            // Check if profile is complete
            const userMetadata = data.session.user.user_metadata || {};
            const profileCompleted = userMetadata.profile_completed;
            
            // Check database for complete profile
            const { data: dbUser } = await supabase.from('users')
              .select('first_name, last_name')
              .eq('id', data.session.user.id)
              .single();
            
            const hasCompleteProfile = dbUser && dbUser.first_name && dbUser.last_name;

            // Redirect to intended destination or complete-profile
            let intendedPath = sessionStorage.getItem('auth_redirect') || '/my-trips';
            
            if (!profileCompleted && !hasCompleteProfile) {
              intendedPath = '/complete-profile';
            }
            
            sessionStorage.removeItem('auth_redirect');
            
            // Clean the URL by removing hash
            window.history.replaceState({}, document.title, window.location.pathname);
            
            navigate(intendedPath, { replace: true });
            return;
          }
        }

        // Handle PKCE flow with code
        if (code) {
          console.log('Processing PKCE OAuth code');
          
          // Exchange the code for a session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error('Error exchanging code for session:', error);
            setError(error.message);
            setProcessing(false);
            setTimeout(() => navigate('/supabase-login'), 3000);
            return;
          }

          if (data.session) {
            console.log('Session established from code:', data.session);
            
            // Store in localStorage
            const role = data.session.user.user_metadata?.role || 'user';
            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('user', JSON.stringify({
              id: data.session.user.id,
              email: data.session.user.email,
              firstName: data.session.user.user_metadata?.first_name || data.session.user.user_metadata?.full_name?.split(' ')[0] || data.session.user.user_metadata?.name || '',
              lastName: data.session.user.user_metadata?.last_name || data.session.user.user_metadata?.full_name?.split(' ')[1] || '',
              photoURL: data.session.user.user_metadata?.avatar_url || data.session.user.user_metadata?.picture,
              role
            }));

            if (data.session.access_token) {
              localStorage.setItem('token', data.session.access_token);
            localStorage.setItem('supabase_token', data.session.access_token);

              if (role === 'admin') {
                localStorage.setItem('adminToken', data.session.access_token);
              }
              // Don't remove adminToken — it may have been set by custom admin login
            }

            // Check if profile is complete
            const userMetadata = data.session.user.user_metadata || {};
            const profileCompleted = userMetadata.profile_completed;
            
            // Check database for complete profile
            const { data: dbUser } = await supabase.from('users')
              .select('first_name, last_name')
              .eq('id', data.session.user.id)
              .single();
            
            const hasCompleteProfile = dbUser && dbUser.first_name && dbUser.last_name;

            // Redirect to intended destination or complete-profile
            let intendedPath = sessionStorage.getItem('auth_redirect') || '/my-trips';
            
            if (!profileCompleted && !hasCompleteProfile) {
              intendedPath = '/complete-profile';
            }
            
            sessionStorage.removeItem('auth_redirect');
            
            navigate(intendedPath, { replace: true });
            return;
          }
        }
        
        // No code or tokens found
        console.log('No auth data found, redirecting to login');
        navigate('/supabase-login', { replace: true });
      } catch (err) {
        console.error('Callback error:', err);
        setError(err.message);
        setProcessing(false);
        setTimeout(() => navigate('/supabase-login'), 3000);
      }
    };

    // Add a small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      handleCallback();
    }, 100);

    return () => clearTimeout(timer);
  }, [searchParams, location, navigate, supabase]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Error</h3>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <p className="text-xs text-gray-400">Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {processing ? 'Completing sign in...' : 'Signed in successfully!'}
          </h3>
          <p className="text-sm text-gray-500">Please wait while we redirect you.</p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
