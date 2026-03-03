import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SignupForm from './components/SignupForm';
import GoogleAuthTest from './components/GoogleAuthTest';
import ChatBot from './components/ChatBot';
import { Container } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

function App() {
  return (
    <Router>
      <Container fluid className="p-0">
        <Routes>
          <Route path="/" element={<Navigate to="/google-auth-test" replace />} />
          <Route path="/signup" element={<SignupForm />} />
          <Route path="/google-auth-test" element={<GoogleAuthTest />} />
          {/* Add other routes here */}
        </Routes>
        
        {/* Global ChatBot Widget - persists across all pages */}
        <ChatBot />
      </Container>
    </Router>
  );
}

export default App; 