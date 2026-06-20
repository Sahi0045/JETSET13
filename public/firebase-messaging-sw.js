/* Firebase Cloud Messaging service worker (handles background notifications).
 *
 * The Firebase *web* config (apiKey, projectId, etc.) is public client config,
 * not a secret. It is passed in via query params at registration time so we
 * don't hardcode project values here:
 *   navigator.serviceWorker.register('/firebase-messaging-sw.js?apiKey=...&...')
 */
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'Jetsetters';
    const options = {
      body: payload.notification?.body || '',
      icon: payload.notification?.icon || '/icon-192.png',
      badge: '/badge-icon.png',
      data: payload.data || {},
    };
    self.registration.showNotification(title, options);
  });
}

// Focus or open the app when a notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.link || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
