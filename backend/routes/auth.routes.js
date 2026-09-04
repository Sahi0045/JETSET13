import express from 'express';
import { register, login, getMe, updateMe, deleteMe, googleLogin, forgotPassword, resetPassword, listAdmins, makeAdmin, removeAdmin, listAuditLogs, changePassword, createSession, refreshSession, logoutSession, getSupabaseSession } from '../controllers/auth.controller.js';
import { protect, admin, superAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Auth server is running' });
});

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.post('/google-login', googleLogin);
// httpOnly cookie session (web): exchange Supabase tokens → cookies, rotate, clear.
router.post('/session', createSession);
router.post('/refresh', refreshSession);
router.get('/supabase-session', getSupabaseSession);
router.post('/logout', logoutSession);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.delete('/me', protect, deleteMe);

// Admin management — super admin only.
router.get('/admins', protect, superAdmin, listAdmins);
router.post('/admins', protect, superAdmin, makeAdmin);
router.delete('/admins/:id', protect, superAdmin, removeAdmin);

// Activity log (admin + super admin) + self password change.
router.get('/audit-logs', protect, admin, listAuditLogs);
router.post('/change-password', protect, changePassword);

export default router;
