/**
 * Google Authentication Utility
 * 
 * Handles the initialization and management of Google authentication 
 */

// The Google client ID from environment variables or fallback to hardcoded value
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "463609792474-nr70b2jrphprah8d4ene5aubrofv484j.apps.googleusercontent.com";

// Function to load the Google API script
export const loadGoogleScript = () => {
  return new Promise((resolve, reject) => {
    // Check if script already exists
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      console.log('Google API script already loaded');
      return resolve();
    }
    
    // Create script element
    const script = document.createElement('script');
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    
    // Set up callbacks
    script.onload = () => {
      console.log('Google API script loaded successfully');
      resolve();
    };
    
    script.onerror = (error) => {
      console.error('Error loading Google API script:', error);
      reject(new Error('Failed to load Google authentication'));
    };
    
    // Add script to document
    document.body.appendChild(script);
  });
};

// Initialize Google Sign-In with callback
export const initializeGoogleSignIn = (callback) => {
  if (!window.google || !window.google.accounts) {
    console.error('Google API not available. Try reloading the page.');
    return false;
  }
  
  try {
    // Get the current origin for proper configuration
    const origin = window.location.origin;
    console.log('Initializing Google Sign-In on origin:', origin);
    
    // Initialize Google Sign-In with current origin
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        console.log('Google auth response received, forwarding to handler');
        // Wrap callback to better handle errors
        try {
          callback(response);
        } catch (err) {
          console.error('Error in Google auth callback handler:', err);
        }
      },
      scope: "email profile",
      ux_mode: "popup", 
      context: "signin"
    });
    
    console.log('Google Sign-In initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Google Sign-In:', error);
    return false;
  }
};

// Render a Google Sign-In button in the specified container
export const renderGoogleButton = (containerId, theme = "outline", size = "large") => {
  if (!window.google || !window.google.accounts) {
    console.error('Google API not available for button rendering');
    return false;
  }
  
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with ID "${containerId}" not found`);
    return false;
  }
  
  try {
    console.log('Rendering Google Sign-In button in container:', containerId);
    window.google.accounts.id.renderButton(container, { 
      theme, 
      size, 
      text: "signin_with",
      logo_alignment: "center",
      width: container.offsetWidth
    });
    return true;
  } catch (error) {
    console.error('Error rendering Google button:', error);
    return false;
  }
};

// Show the Google One Tap prompt
export const promptGoogleSignIn = () => {
  if (!window.google || !window.google.accounts) {
    console.error('Google API not available for sign-in prompt');
    return false;
  }
  
  try {
    console.log('Prompting Google Sign-In');
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        console.log('Google Sign-In prompt not displayed:', notification.getNotDisplayedReason() || notification.getSkippedReason());
      }
    });
    return true;
  } catch (error) {
    console.error('Error showing Google sign-in prompt:', error);
    return false;
  }
};

// Clean up Google API elements
export const cleanupGoogleAuth = () => {
  try {
    if (window.google && window.google.accounts) {
      window.google.accounts.id.cancel();
      console.log('Google Sign-In state canceled');
    }
    return true;
  } catch (error) {
    console.error('Error cleaning up Google Auth:', error);
    return false;
  }
};

// Verify that Google token is valid
export const verifyGoogleToken = async (token) => {
  try {
    console.log('Verifying Google token locally');
    // This just checks if the token is properly formatted
    // The actual verification happens on the server
    if (!token || typeof token !== 'string' || token.length < 50) {
      console.error('Invalid Google token format');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error verifying Google token:', error);
    return false;
  }
};

export default {
  loadGoogleScript,
  initializeGoogleSignIn,
  renderGoogleButton,
  promptGoogleSignIn,
  cleanupGoogleAuth,
  verifyGoogleToken
}; 