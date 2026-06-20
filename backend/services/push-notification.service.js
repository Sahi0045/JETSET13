import admin from 'firebase-admin';
import supabase from '../config/supabase.js';

/**
 * Server-side push notification service (Firebase Cloud Messaging via firebase-admin).
 *
 * This runs on the backend, so it uses the Admin SDK + a service account — NOT the
 * browser `firebase/messaging` SDK. Client-side token registration (getToken /
 * requestPermission / onMessage) belongs in the frontend, not here.
 *
 * Required env (one of):
 *   - FIREBASE_SERVICE_ACCOUNT  : full service-account JSON as a single-line string
 *   - or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *   - or GOOGLE_APPLICATION_CREDENTIALS : path to a service-account JSON file
 */

let messaging = null;

function loadServiceAccount() {
  // 1) Full JSON blob in a single env var (preferred for serverless/Vercel)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
      console.error('[Push] FIREBASE_SERVICE_ACCOUNT is not valid JSON:', error.message);
      return null;
    }
  }

  // 2) Individual fields
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Env vars escape newlines; restore them for the PEM key.
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }

  return null;
}

function initMessaging() {
  if (messaging) return messaging;

  try {
    if (!admin.apps.length) {
      const serviceAccount = loadServiceAccount();

      if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Application Default Credentials (file path env var)
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      } else {
        console.warn('[Push] Firebase Admin not configured — set FIREBASE_SERVICE_ACCOUNT');
        return null;
      }
    }

    messaging = admin.messaging();
    return messaging;
  } catch (error) {
    console.error('[Push] Failed to initialize Firebase Admin:', error.message);
    return null;
  }
}

export const PUSH_NOTIFICATION_TYPES = {
  VISA_STATUS_UPDATE: 'visa_status_update',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  DOCUMENT_REQUEST: 'document_request',
  GENERAL: 'general'
};

/**
 * Persist an FCM device token for a user (idempotent).
 */
export async function saveDeviceToken(userId, token, platform = 'web') {
  if (!userId || !token) {
    return { success: false, reason: 'Missing userId or token' };
  }

  const { data: existing, error: selectError } = await supabase
    .from('user_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('fcm_token', token)
    .maybeSingle();

  if (selectError) {
    console.error('[Push] Failed to look up device token:', selectError.message);
    return { success: false, error: selectError.message };
  }

  if (!existing) {
    const { error: insertError } = await supabase.from('user_devices').insert({
      user_id: userId,
      fcm_token: token,
      platform,
      created_at: new Date().toISOString()
    });

    if (insertError) {
      console.error('[Push] Failed to save device token:', insertError.message);
      return { success: false, error: insertError.message };
    }
  }

  return { success: true };
}

/**
 * Send a push notification to all of a user's registered devices.
 * Returns delivery counts and prunes any tokens FCM reports as invalid.
 */
export async function sendPushNotification(userId, notification) {
  const fcm = initMessaging();
  if (!fcm) {
    return { success: false, reason: 'Firebase Admin not configured' };
  }

  const { data: devices, error } = await supabase
    .from('user_devices')
    .select('fcm_token')
    .eq('user_id', userId);

  if (error) {
    console.error('[Push] Failed to fetch devices:', error.message);
    return { success: false, error: error.message };
  }

  const tokens = (devices || []).map((device) => device.fcm_token).filter(Boolean);
  if (!tokens.length) {
    return { success: false, reason: 'No devices registered' };
  }

  const message = {
    tokens,
    notification: {
      title: notification.title,
      body: notification.body
    },
    data: normalizeData(notification.data),
    webpush: {
      notification: {
        icon: notification.icon || '/icon-192.png',
        badge: '/badge-icon.png',
        tag: notification.type || PUSH_NOTIFICATION_TYPES.GENERAL,
        vibrate: [200, 100, 200],
        requireInteraction: Boolean(notification.urgent)
      },
      fcmOptions: {
        link: notification.url || '/notifications'
      }
    }
  };

  try {
    const response = await fcm.sendEachForMulticast(message);
    await pruneInvalidTokens(tokens, response.responses);

    console.log(
      `[Push] user=${userId} sent=${response.successCount} failed=${response.failureCount}`
    );

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      recipientCount: tokens.length
    };
  } catch (sendError) {
    console.error('[Push] Failed to send:', sendError.message);
    return { success: false, error: sendError.message };
  }
}

export async function sendBatchPushNotifications(userIds, notification) {
  const results = [];
  for (const userId of userIds) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendPushNotification(userId, notification);
    results.push({ userId, ...result });
  }
  return results;
}

export async function getUserDevices(userId) {
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('[Push] Failed to fetch user devices:', error.message);
    return [];
  }

  return data || [];
}

export async function removeDeviceToken(userId, token) {
  return supabase
    .from('user_devices')
    .delete()
    .eq('user_id', userId)
    .eq('fcm_token', token);
}

/**
 * FCM data payloads must be a flat string→string map.
 */
function normalizeData(data) {
  if (!data || typeof data !== 'object') return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value)
    ])
  );
}

/**
 * Remove tokens that FCM reports as unregistered/invalid so they aren't retried.
 */
async function pruneInvalidTokens(tokens, responses) {
  const invalidTokens = [];
  responses.forEach((res, index) => {
    if (res.success) return;
    const code = res.error?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      invalidTokens.push(tokens[index]);
    }
  });

  if (!invalidTokens.length) return;

  const { error } = await supabase
    .from('user_devices')
    .delete()
    .in('fcm_token', invalidTokens);

  if (error) {
    console.error('[Push] Failed to prune invalid tokens:', error.message);
  } else {
    console.log(`[Push] Pruned ${invalidTokens.length} invalid token(s)`);
  }
}
