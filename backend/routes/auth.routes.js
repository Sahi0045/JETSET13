import express from 'express';
import { register, login, getMe, searchFlights, googleLogin, forgotPassword, resetPassword } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

// const { searchFlights } = require('../controllers/flights.controller');
const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Auth server is running' });
});

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.post('/google-login', googleLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/search', searchFlights);
router.get('/me', protect, getMe);

export default router;
