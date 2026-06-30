import express from 'express';
import { register, login, getMe, searchFlights, googleLogin, forgotPassword, resetPassword, listAdmins, makeAdmin, removeAdmin, listAuditLogs, changePassword } from '../controllers/auth.controller.js';
import { protect, admin, superAdmin } from '../middleware/auth.middleware.js';

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

// Admin management — super admin only.
router.get('/admins', protect, superAdmin, listAdmins);
router.post('/admins', protect, superAdmin, makeAdmin);
router.delete('/admins/:id', protect, superAdmin, removeAdmin);

// Activity log (admin + super admin) + self password change.
router.get('/audit-logs', protect, admin, listAuditLogs);
router.post('/change-password', protect, changePassword);

export default router;
