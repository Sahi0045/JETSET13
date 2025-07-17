import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

// Import CSS files
import '../resources/css/app.css';
import '../resources/css/fonts.css';
import 'bootstrap/dist/css/bootstrap.min.css';

// Import Firebase Auth Provider
import { FirebaseAuthProvider } from '../resources/js/contexts/FirebaseAuthContext';

// Import App component
import App from '../resources/js/app.jsx';

// Initialize the app when DOM is loaded
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <HelmetProvider>
          <FirebaseAuthProvider>
            <App />
          </FirebaseAuthProvider>
        </HelmetProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}
