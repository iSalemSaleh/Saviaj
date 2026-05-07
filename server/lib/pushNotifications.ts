/**
 * Push notification dispatcher. Wraps `firebase-admin` (FCM HTTP v1) which covers BOTH:
 *   - Web Push (browser) via FCM Web SDK tokens
 *   - Android via Capacitor + FCM
 *   - iOS    via Capacitor + APNs (FCM bridges)
 *
 * Required env (no-op when absent):
 *   - `FIREBASE_SERVICE_ACCOUNT`  full service-account JSON (stringified) OR a path to a JSON file.
 *
 * Dispatch is fire-and-forget: failures are logged but never throw — chat must keep working
 * even when Firebase is misconfigured. Stale tokens (UNREGISTERED / INVALID_ARGUMENT) are
 * pruned from the DB so the next dispatch doesn't keep retrying them.
 */

import { storage } from "../storage";

let adminApp: any = null;
let initAttempted = false;

async function ensureAdmin(): Promise<any | null> {
  if (adminApp) return adminApp;
  if (initAttempted) return null;
  initAttempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.log("[push] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled.");
    return null;
  }

  try {
    const admin = await import("firebase-admin");
    let serviceAccount: any;
    if (raw.trim().startsWith("{")) {
      serviceAccount = JSON.parse(raw);
    } else {
      // Treat as a path on disk (eg. /run/secrets/firebase.json on Azure)
      const fs = await import("fs/promises");
      serviceAccount = JSON.parse(await fs.readFile(raw, "utf8"));
    }
    if (admin.apps.length === 0) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      adminApp = admin.app();
    }
    console.log(`[push] firebase-admin initialised (project=${serviceAccount.project_id})`);
    return adminApp;
  } catch (err) {
    console.error("[push] Failed to initialise firebase-admin:", err);
    return null;
  }
}

export interface ChatPushPayload {
  receiverId: string;
  senderName: string;
  senderId: string;
  rideId: number;
  preview: string;       // first ~120 chars of the message body / "📷 Photo" / "🎤 Voice note"
  messageId: number;
}

/**
 * Send a chat-message push to every registered device of `receiverId`.
 * Resolves once dispatch is queued; never throws.
 */
export async function dispatchChatPush(payload: ChatPushPayload): Promise<void> {
  const app = await ensureAdmin();
  if (!app) return; // disabled — silently skip.

  const tokens = await storage.getPushTokensForUser(payload.receiverId).catch(() => []);
  if (tokens.length === 0) return;

  try {
    const admin = await import("firebase-admin");
    const messaging = admin.messaging(app);

    const message = {
      notification: {
        title: payload.senderName || "New message",
        body: payload.preview,
      },
      data: {
        type: "chat_message",
        rideId: String(payload.rideId),
        messageId: String(payload.messageId),
        senderId: payload.senderId,
      },
      android: {
        priority: "high" as const,
        notification: { channelId: "chat", sound: "default", tag: `ride-${payload.rideId}` },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            "thread-id": `ride-${payload.rideId}`,
            badge: 1,
          },
        },
      },
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: `ride-${payload.rideId}`,
          renotify: true,
          data: { url: `/ride-tracking/${payload.rideId}` },
        },
      },
      tokens: tokens.map((t) => t.token),
    };

    const res = await messaging.sendEachForMulticast(message);

    // Prune dead tokens so we don't keep paying FCM rate-limit hits on them.
    if (res.failureCount > 0) {
      const dead: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error) {
          const code = (r.error as any).errorInfo?.code || (r.error as any).code;
          if (code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-argument" ||
              code === "messaging/invalid-registration-token") {
            dead.push(tokens[i].token);
          }
        }
      });
      if (dead.length > 0) {
        await storage.deletePushTokens(dead).catch(() => { /* ignore */ });
        console.log(`[push] pruned ${dead.length} dead token(s) for user=${payload.receiverId}`);
      }
    }
  } catch (err) {
    console.error("[push] dispatch failed:", err);
  }
}

export async function getStatus(): Promise<{ ready: boolean }> {
  const app = await ensureAdmin();
  return { ready: !!app };
}
