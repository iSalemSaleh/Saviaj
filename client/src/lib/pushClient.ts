/**
 * Push notification registration — gracefully no-ops when Firebase env is absent.
 *
 * Web (FCM Web Push):
 *   - Reads VITE_FIREBASE_API_KEY/.../VITE_FIREBASE_VAPID_KEY at build time.
 *   - Registers `/firebase-messaging-sw.js` as the service worker.
 *   - Asks for Notification permission, retrieves a token, posts to /api/push-tokens.
 *
 * Native (Capacitor):
 *   - If `@capacitor/push-notifications` is available we use it; APNs/FCM tokens come back
 *     from the platform plugin and we POST them with platform='android'|'ios'.
 *
 * Call `registerPushTokens()` on every authenticated app boot — the server upsert is
 * idempotent on the token string.
 */

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

function isFirebaseConfigured(): boolean {
  return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId && VAPID_KEY);
}

async function postToken(token: string, platform: 'web' | 'android' | 'ios'): Promise<void> {
  try {
    await fetch('/api/push-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        token,
        platform,
        deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : platform,
      }),
    });
  } catch (err) {
    console.warn('[push] failed to register token:', err);
  }
}

async function registerWebPush(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) return;

  // Lazy import — Firebase SDK is large; only pull it when actually configured.
  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');

  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  const app = getApps().length ? getApps()[0]! : initializeApp(FIREBASE_CONFIG as any);
  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return;

  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY!, serviceWorkerRegistration: swReg });
  if (!token) return;
  await postToken(token, 'web');

  // Foreground messages: defer to whatever in-app handler the chat installed
  // via `window.__onForegroundChatPush` (set by Chat component).
  onMessage(messaging, (payload) => {
    try {
      (window as any).__onForegroundChatPush?.(payload);
    } catch { /* ignore */ }
  });
}

async function registerCapacitorPush(): Promise<void> {
  // Optional dynamic import — keeps the web bundle from pulling Capacitor types.
  try {
    const cap = await import(/* @vite-ignore */ '@capacitor/core').catch(() => null as any);
    if (!cap?.Capacitor?.isNativePlatform?.()) return;
    const platform = cap.Capacitor.getPlatform() as 'ios' | 'android';
    const PN = await import(/* @vite-ignore */ '@capacitor/push-notifications').catch(() => null as any);
    if (!PN?.PushNotifications) return;
    const perm = await PN.PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PN.PushNotifications.register();
    PN.PushNotifications.addListener('registration', (t: { value: string }) => {
      postToken(t.value, platform);
    });
  } catch (err) {
    console.warn('[push] Capacitor registration failed:', err);
  }
}

/**
 * Public entry point. Safe to call multiple times — service worker registration
 * and FCM token retrieval are themselves idempotent.
 */
export async function registerPushTokens(): Promise<void> {
  await Promise.allSettled([registerWebPush(), registerCapacitorPush()]);
}
