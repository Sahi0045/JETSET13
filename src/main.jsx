import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

// Import CSS files
import '../resources/css/app.css';
import '../resources/css/fonts.css';
import 'bootstrap/dist/css/bootstrap.min.css';

// Import App component
import App from '../resources/js/app.jsx';
import { SupabaseAuthProvider } from '../resources/js/contexts/SupabaseAuthContext.jsx';

// Initialize the app when DOM is loaded
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <HelmetProvider>
          <SupabaseAuthProvider>
            <App />
          </SupabaseAuthProvider>
        </HelmetProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}
