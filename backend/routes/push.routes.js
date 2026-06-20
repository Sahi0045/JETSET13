import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import {
  saveDeviceToken,
  removeDeviceToken,
  sendPushNotification,
  getUserDevices,
} from '../services/push-notification.service.js';

const router = express.Router();

/**
 * Resolve the Supabase auth user id for the authenticated request.
 * `authUserId` is the auth.users UUID set by the auth middleware; fall back to
 * the local users-table id if it isn't present.
 */
function resolveUserId(req) {
  return req.user?.authUserId || req.user?.id;
}

// POST /api/push/register-token — store an FCM device token for the current user
router.post('/register-token', protect, async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { token, platform } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }

    const result = await saveDeviceToken(userId, token, platform || 'web');
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json({ success: true, message: 'Device token registered' });
  } catch (error) {
    console.error('[Push] register-token error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to register token' });
  }
});

// DELETE /api/push/token — remove a device token (e.g. on logout / permission revoked)
router.delete('/token', protect, async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }

    await removeDeviceToken(userId, token);
    return res.json({ success: true, message: 'Device token removed' });
  } catch (error) {
    console.error('[Push] remove-token error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to remove token' });
  }
});

// GET /api/push/devices — list the current user's registered devices
router.get('/devices', protect, async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const devices = await getUserDevices(userId);
    return res.json({ success: true, devices });
  } catch (error) {
    console.error('[Push] devices error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch devices' });
  }
});

// POST /api/push/test — send a test notification to the current user's devices
router.post('/test', protect, async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const result = await sendPushNotification(userId, {
      title: req.body.title || 'Test notification',
      body: req.body.body || 'Push notifications are working 🎉',
      type: 'general',
    });

    return res.json(result);
  } catch (error) {
    console.error('[Push] test error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to send test notification' });
  }
});

export default router;
