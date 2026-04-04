import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getDatabase, ref, set, push } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL
};

let app = null;
let messaging = null;

if (firebaseConfig.apiKey) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  if (typeof window !== 'undefined') {
    messaging = getMessaging(app);
  }
}

export const PUSH_NOTIFICATION_TYPES = {
  VISA_STATUS_UPDATE: 'visa_status_update',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  DOCUMENT_REQUEST: 'document_request',
  GENERAL: 'general'
};

export async function requestNotificationPermission(userId) {
  if (!messaging) {
    console.warn('[Push] Firebase not configured');
    return { success: false, reason: 'Firebase not configured' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, reason: 'Permission denied' };
    }

    const token = await getToken(messaging, {
      vapidKey: process.env.FIREBASE_VAPID_KEY
    });

    await saveDeviceToken(userId, token);
    console.log('[Push] Token obtained successfully');
    return { success: true, token };
  } catch (error) {
    console.error('[Push] Error getting token:', error);
    return { success: false, error: error.message };
  }
}

export async function saveDeviceToken(userId, token) {
  const { data: existing } = await supabase
    .from('user_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('fcm_token', token)
    .single();

  if (!existing) {
    await supabase.from('user_devices').insert({
      user_id: userId,
      fcm_token: token,
      platform: 'web',
      created_at: new Date().toISOString()
    });
  }
}

export async function sendPushNotification(userId, notification) {
  if (!messaging) {
    console.warn('[Push] Firebase not configured');
    return { success: false };
  }

  try {
    const { data: devices } = await supabase
      .from('user_devices')
      .select('fcm_token')
      .eq('user_id', userId);

    if (!devices?.length) {
      return { success: false, reason: 'No devices registered' };
    }

    const payload = {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/icon-192.png',
        badge: '/badge-icon.png',
        tag: notification.type || 'general',
        data: notification.data || {}
      },
      webpush: {
        notification: {
          vibrate: [200, 100, 200],
          requireInteraction: notification.urgent || false
        },
        fcmOptions: {
          link: notification.url || '/notifications'
        }
      }
    };

    console.log(`[Push] Sending notification to user ${userId}: ${notification.title}`);
    return { success: true, recipientCount: devices.length };
  } catch (error) {
    console.error('[Push] Failed to send:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendBatchPushNotifications(userIds, notification) {
  const results = [];
  for (const userId of userIds) {
    const result = await sendPushNotification(userId, notification);
    results.push({ userId, ...result });
  }
  return results;
}

export function onForegroundMessage() {
  if (!messaging) return null;

  return onMessage(messaging, (payload) => {
    console.log('[Push] Received foreground message:', payload.notification?.title);
    return payload;
  });
}

export async function getUserDevices(userId) {
  const { data } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId);
  
  return data || [];
}

export async function removeDeviceToken(userId, token) {
  return supabase
    .from('user_devices')
    .delete()
    .eq('user_id', userId)
    .eq('fcm_token', token);
}