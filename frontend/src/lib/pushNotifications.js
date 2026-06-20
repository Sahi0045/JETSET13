import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import supabase from './supabase';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

function getFirebaseApp() {
  if (!firebaseConfig.apiKey) return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/**
 * Register the service worker, passing the public web config as query params so
 * the SW can initialize Firebase without hardcoded project values.
 */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey || '',
    authDomain: firebaseConfig.authDomain || '',
    projectId: firebaseConfig.projectId || '',
    storageBucket: firebaseConfig.storageBucket || '',
    messagingSenderId: firebaseConfig.messagingSenderId || '',
    appId: firebaseConfig.appId || '',
  });
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
}

async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || localStorage.getItem('supabase_token') || localStorage.getItem('token');
}

/**
 * Request notification permission, obtain an FCM token, and register it with the
 * backend. MUST be called from a user gesture (e.g. a button click) so the
 * browser shows the permission prompt.
 *
 * @returns {Promise<{success: boolean, token?: string, reason?: string}>}
 */
export async function registerForPushNotifications() {
  try {
    if (!firebaseConfig.apiKey) {
      return { success: false, reason: 'Firebase not configured (missing VITE_FIREBASE_* env)' };
    }
    if (!VAPID_KEY) {
      return { success: false, reason: 'Missing VITE_FIREBASE_VAPID_KEY' };
    }
    if (!(await isSupported())) {
      return { success: false, reason: 'Push messaging not supported in this browser' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, reason: 'Notification permission not granted' };
    }

    const swRegistration = await registerServiceWorker();
    const messaging = getMessaging(getFirebaseApp());

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration || undefined,
    });

    if (!token) {
      return { success: false, reason: 'Failed to obtain FCM token' };
    }

    const authToken = await getAuthToken();
    const response = await fetch('/api/push/register-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ token, platform: 'web' }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, reason: err.message || 'Backend rejected token registration' };
    }

    return { success: true, token };
  } catch (error) {
    console.error('[Push] Registration failed:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * Subscribe to foreground messages (when the app/tab is active).
 * Returns an unsubscribe function, or null if unsupported.
 */
export async function onForegroundMessage(handler) {
  if (!firebaseConfig.apiKey || !(await isSupported())) return null;
  const messaging = getMessaging(getFirebaseApp());
  return onMessage(messaging, handler);
}
