/* Firebase Cloud Messaging service worker.
 * The Firebase SDK requires this file at the root of the site so it can register
 * itself for background push delivery.
 *
 * The config below MUST match VITE_FIREBASE_* on the client. Because service workers
 * cannot read Vite env vars at runtime, the values are hard-coded here as
 * placeholders — replace at deploy time (eg. via an envsubst step) or leave as-is
 * when push is intentionally disabled.
 */
self.importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
self.importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCE8XVR8iS2ymizst6BhUE8PGSn00tIxj8',
  authDomain: 'saviaj-ce538.firebaseapp.com',
  projectId: 'saviaj-ce538',
  messagingSenderId: '113438282917',
  appId: '1:113438282917:web:e103502d6a7bf011c3694c',
};

try {
  if (FIREBASE_CONFIG.apiKey !== 'REPLACE_AT_DEPLOY') {
    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = (payload.notification && payload.notification.title) || 'New message';
      const body = (payload.notification && payload.notification.body) || '';
      const tag = (payload.data && payload.data.rideId) ? `ride-${payload.data.rideId}` : 'chat';
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag,
        renotify: true,
        data: payload.data || {},
      });
    });
  }
} catch (err) {
  console.warn('[fcm-sw] init failed:', err);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.rideId ? `/ride-tracking/${data.rideId}` : '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(url) && 'focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
