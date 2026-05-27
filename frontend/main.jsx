import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

// Import CSS files
import './styles/app.css';
import './styles/fonts.css';

// Import App component
import App from './src/app.jsx';
import { SupabaseAuthProvider } from './src/contexts/SupabaseAuthContext.jsx';

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
