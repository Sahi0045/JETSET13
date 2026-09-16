import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClientProvider } from '@tanstack/react-query';

// Import CSS files
import './styles/app.css';
import './styles/fonts.css';

// Import App component
import App from './src/app.jsx';
import { SupabaseAuthProvider } from './src/contexts/SupabaseAuthContext.jsx';
import { queryClient } from './src/lib/queryClient.js';
import { initMonitoring } from './src/lib/monitoring.js';
import { installFetchTimeout } from './src/utils/fetchTimeout.js';
import { pruneStoredProfile } from './src/utils/bookingStorage.js';

// Initialize error monitoring (no-op unless VITE_SENTRY_DSN is set)
initMonitoring();

// Every request settles. Before this, not one fetch on the flight journey
// carried a deadline, and a stalled socket - not a failed one, a stalled one -
// left the customer on a spinner with no error, no retry and no way out. Worst
// of all after the card was charged. Installed here rather than at each call
// site because forty-three call sites had already forgotten.
installFetchTimeout();

// Remove identity documents left in this browser by an older build. `userData`
// held passport number, passport expiry, issuing country, PAN and date of birth
// with no expiry and no clear but a click on Logout; the profile page no longer
// writes them, and this reaches everyone who already has them.
pruneStoredProfile();

// Initialize the app when DOM is loaded
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <HelmetProvider>
            <SupabaseAuthProvider>
              <App />
            </SupabaseAuthProvider>
          </HelmetProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}
