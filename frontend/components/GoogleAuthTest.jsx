import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Container, Card, Button, Alert, Spinner } from 'react-bootstrap';
import { FaGoogle, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

function GoogleAuthTest() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/google-auth-test`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error logging in with Google:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('Error logging out:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <Spinner animation="border" role="status" variant="primary">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  return (
    <Container className="py-5">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-6">
          <Card className="shadow-lg">
            <Card.Header className="bg-primary text-white text-center py-3">
              <h3 className="mb-0">
                <FaGoogle className="me-2" />
                Google Auth Test Page
              </h3>
            </Card.Header>
            <Card.Body className="p-4">
              {error && (
                <Alert variant="danger" dismissible onClose={() => setError(null)}>
                  <FaTimesCircle className="me-2" />
                  {error}
                </Alert>
              )}

              {!user ? (
                <div className="text-center">
                  <h5 className="mb-4">Test Google OAuth Integration</h5>
                  <p className="text-muted mb-4">
                    Click the button below to sign in with your Google account
                  </p>
                  <Button
                    variant="danger"
                    size="lg"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-100"
                  >
                    <FaGoogle className="me-2" />
                    {loading ? 'Signing in...' : 'Sign in with Google'}
                  </Button>
                  
                  <div className="mt-4 pt-4 border-top">
                    <h6 className="text-muted">Setup Instructions:</h6>
                    <ol className="text-start small text-muted">
                      <li>Go to your Supabase Dashboard</li>
                      <li>Navigate to Authentication → Providers</li>
                      <li>Enable Google provider</li>
                      <li>Add your Google OAuth Client ID and Secret</li>
                      <li>Add authorized redirect URIs in Google Cloud Console</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div>
                  <Alert variant="success" className="mb-4">
                    <FaCheckCircle className="me-2" />
                    Successfully authenticated!
                  </Alert>

                  <h5 className="mb-3">User Information:</h5>
                  <div className="bg-light p-3 rounded mb-3">
                    <p className="mb-2">
                      <strong>Email:</strong> {user.email}
                    </p>
                    <p className="mb-2">
                      <strong>User ID:</strong> {user.id}
                    </p>
                    <p className="mb-2">
                      <strong>Provider:</strong> {user.app_metadata.provider}
                    </p>
                    {user.user_metadata?.full_name && (
                      <p className="mb-2">
                        <strong>Name:</strong> {user.user_metadata.full_name}
                      </p>
                    )}
                    {user.user_metadata?.avatar_url && (
                      <div className="mt-3">
                        <img
                          src={user.user_metadata.avatar_url}
                          alt="Profile"
                          className="rounded-circle"
                          width="80"
                          height="80"
                        />
                      </div>
                    )}
                  </div>

                  <h6 className="mb-2">Session Details:</h6>
                  <div className="bg-light p-3 rounded mb-3">
                    <pre className="mb-0 small" style={{ maxHeight: '200px', overflow: 'auto' }}>
                      {JSON.stringify(session, null, 2)}
                    </pre>
                  </div>

                  <Button
                    variant="outline-danger"
                    onClick={handleLogout}
                    disabled={loading}
                    className="w-100"
                  >
                    Sign Out
                  </Button>
                </div>
              )}
            </Card.Body>
            <Card.Footer className="text-muted text-center py-3">
              <small>Powered by Supabase Auth</small>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </Container>
  );
}

export default GoogleAuthTest;
