import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import passport from 'passport';
import { storage } from './storage';
import { getSession } from './replitAuth';

// Re-use a single session middleware instance so we share connect-pg-simple's PG pool.
const sessionMiddleware = getSession();
const passportInit = passport.initialize();
const passportSession = passport.session();

/**
 * Extract the authenticated userId from an upgrade request by manually running
 * the express-session + passport middleware chain on it. Returns null if the
 * cookie is missing/invalid or no user is logged in.
 *
 * Both auth flows are handled:
 *   - Replit OIDC (passport): session.passport.user.claims.sub
 *   - Local email/password:    session.userId
 */
function authenticateUpgrade(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const reqAny = req as any;
    const fakeRes: any = { setHeader() {}, getHeader() {}, end() {}, on() {} };
    sessionMiddleware(reqAny, fakeRes, () => {
      passportInit(reqAny, fakeRes, () => {
        passportSession(reqAny, fakeRes, () => {
          const sess = reqAny.session ?? {};
          const userId: string | null =
            sess?.passport?.user?.claims?.sub ??
            reqAny.user?.claims?.sub ??
            sess?.userId ??
            null;
          resolve(userId);
        });
      });
    });
  });
}

interface Location {
  lat: number;
  lng: number;
  heading?: number; // Direction in degrees (0-360, 0 = North)
  speed?: number; // Speed in m/s
  timestamp: number;
}

// Augment WebSocket with the per-connection state we need.
interface RideSocket extends WebSocket {
  isAlive?: boolean;
  rideId?: number | null;
  userType?: 'rider' | 'driver' | null;
  userId?: string | null;
  verifiedRide?: { riderId: string; driverId: string } | null;
}

interface RideRoom {
  rider: RideSocket | null;
  driver: RideSocket | null;
  riderUserId: string;
  driverUserId: string;
  // Last-seen timestamps for the offline-presence indicator.
  riderLastSeen: number | null;
  driverLastSeen: number | null;
}

const rideRooms = new Map<number, RideRoom>();
const userConnections = new Map<string, RideSocket>();

// Heartbeat constants.
// We ping at 25s; allow up to 35s (ping cycle + jitter) before declaring the socket dead.
const HEARTBEAT_INTERVAL_MS = 25_000;

// Broadcast a one-off message to a specific user by their userId. Used by other modules
// (notifications etc.) to push to whichever ride socket the user currently holds.
export function broadcast(message: any, userId: string) {
  const ws = userConnections.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function safeSend(ws: RideSocket | null | undefined, payload: any): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

function getRoomCounterpart(room: RideRoom, userType: 'rider' | 'driver'): RideSocket | null {
  return userType === 'rider' ? room.driver : room.rider;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Heartbeat: every HEARTBEAT_INTERVAL_MS, ping every connection. Any socket that
  // didn't pong since the previous tick is terminated, which triggers `close` and
  // the client's exponential-backoff reconnect.
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as RideSocket;
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch { /* noop */ }
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* noop */ }
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => clearInterval(heartbeatTimer));

  wss.on('connection', async (raw: WebSocket, req: IncomingMessage) => {
    const ws = raw as RideSocket;

    // SECURITY: bind the connection to the authenticated session before doing anything else.
    // Without this, a client could impersonate any participant by claiming their userId.
    const authenticatedUserId = await authenticateUpgrade(req).catch(() => null);
    if (!authenticatedUserId) {
      try { ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' })); } catch { /* noop */ }
      try { ws.close(1008, 'unauthorized'); } catch { /* noop */ }
      return;
    }

    ws.isAlive = true;
    ws.rideId = null;
    ws.userType = null;
    // userId is now sourced from the session, NOT from the join_ride payload.
    ws.userId = authenticatedUserId;
    ws.verifiedRide = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (data: Buffer) => {
      try {
        const message: any = JSON.parse(data.toString());

        switch (message.type) {
          case 'join_ride': {
            const { rideId, userType } = message;
            // SECURITY: never trust message.userId — always use the session-bound id.
            const userId = ws.userId;
            if (!userId) {
              safeSend(ws, { type: 'error', message: 'Unauthorized' });
              return;
            }

            const ride = await storage.getRideById(rideId);
            if (!ride) {
              safeSend(ws, { type: 'error', message: 'Ride not found' });
              return;
            }

            const isRider = ride.riderId === userId;
            const isDriver = ride.driverId === userId;
            if (!isRider && !isDriver) {
              safeSend(ws, { type: 'error', message: 'Unauthorized: not a participant' });
              return;
            }

            const actualUserType: 'rider' | 'driver' = isRider ? 'rider' : 'driver';
            if (userType !== actualUserType) {
              safeSend(ws, { type: 'error', message: 'Unauthorized: role mismatch' });
              return;
            }

            ws.rideId = rideId;
            ws.userType = actualUserType;
            // ws.userId is already set from the session at connection time.
            ws.verifiedRide = { riderId: ride.riderId, driverId: ride.driverId };

            userConnections.set(userId, ws);

            if (!rideRooms.has(rideId)) {
              rideRooms.set(rideId, {
                rider: null,
                driver: null,
                riderUserId: ride.riderId,
                driverUserId: ride.driverId,
                riderLastSeen: null,
                driverLastSeen: null,
              });
            }
            const room = rideRooms.get(rideId)!;
            if (actualUserType === 'rider') room.rider = ws; else room.driver = ws;

            // Tell the joiner whether the other party is currently online.
            const counterpart = getRoomCounterpart(room, actualUserType);
            const otherLastSeen = actualUserType === 'rider' ? room.driverLastSeen : room.riderLastSeen;
            safeSend(ws, {
              type: 'joined',
              rideId,
              userType: actualUserType,
              presence: {
                online: !!counterpart && counterpart.readyState === WebSocket.OPEN,
                lastSeen: otherLastSeen,
              },
            });

            // Tell the other party we're online.
            safeSend(counterpart, { type: 'presence', online: true, lastSeen: null });
            break;
          }

          case 'location_update': {
            if (!ws.rideId || !ws.userId || !ws.userType) {
              safeSend(ws, { type: 'error', message: 'Must join ride first' });
              return;
            }
            if (message.rideId !== ws.rideId) {
              safeSend(ws, { type: 'error', message: 'Cannot update different ride' });
              return;
            }
            const room = rideRooms.get(ws.rideId);
            if (!room) return;
            safeSend(getRoomCounterpart(room, ws.userType), {
              type: 'location_update',
              userType: ws.userType,
              location: message.location,
            });
            break;
          }

          case 'chat_message': {
            if (!ws.rideId || !ws.userId || !ws.userType || !ws.verifiedRide) {
              safeSend(ws, { type: 'error', message: 'Must join ride first' });
              return;
            }
            if (message.rideId !== ws.rideId) {
              safeSend(ws, { type: 'error', message: 'Cannot send to different ride' });
              return;
            }

            const senderId = ws.userId;
            const receiverId = ws.userType === 'rider' ? ws.verifiedRide.driverId : ws.verifiedRide.riderId;
            const messageType: string = message.messageType === 'location' ? 'location' : 'text';
            const text = String(message.message ?? '');
            const clientId: string | undefined = typeof message.clientId === 'string' ? message.clientId : undefined;

            // Persist (idempotent on (rideId, senderId, clientId))
            const saved = await storage.createChatMessage({
              rideId: ws.rideId,
              senderId,
              receiverId,
              message: text,
              clientId,
              messageType,
              locationLat: messageType === 'location' && message.locationLat != null ? String(message.locationLat) : null,
              locationLng: messageType === 'location' && message.locationLng != null ? String(message.locationLng) : null,
            } as any);

            const room = rideRooms.get(ws.rideId);
            const receiverWs = room ? getRoomCounterpart(room, ws.userType) : null;

            // If the receiver is currently online, mark delivered immediately so the sender
            // can render a double-tick. We do this BEFORE composing the outgoing payload so
            // the status field is correct for both sides.
            let finalStatus = saved.status;
            let deliveredAt = saved.deliveredAt;
            if (receiverWs && receiverWs.readyState === WebSocket.OPEN && saved.status === 'sent') {
              await storage.markMessageDelivered(saved.id);
              finalStatus = 'delivered';
              deliveredAt = new Date();
            }

            const outgoingForReceiver = {
              type: 'chat_message',
              id: saved.id,
              clientId: saved.clientId,
              rideId: saved.rideId,
              senderId: saved.senderId,
              receiverId: saved.receiverId,
              message: saved.message,
              messageType: saved.messageType,
              locationLat: saved.locationLat,
              locationLng: saved.locationLng,
              status: finalStatus,
              read: saved.read,
              createdAt: saved.createdAt,
              deliveredAt,
              readAt: saved.readAt,
              reactions: saved.reactions,
            };

            // Send to receiver (if online).
            safeSend(receiverWs, outgoingForReceiver);

            // Ack to sender. Includes clientId so the sender can reconcile optimistic UI.
            safeSend(ws, { ...outgoingForReceiver, type: 'chat_message_sent' });

            // If the receiver got it, also push a delivery_receipt to the sender so the
            // single tick can flip to a double tick without waiting for re-fetch.
            if (finalStatus === 'delivered') {
              safeSend(ws, {
                type: 'delivery_receipt',
                id: saved.id,
                clientId: saved.clientId,
                deliveredAt,
              });
            }
            break;
          }

          case 'typing':
          case 'typing_stop': {
            if (!ws.rideId || !ws.userType) return;
            const room = rideRooms.get(ws.rideId);
            if (!room) return;
            safeSend(getRoomCounterpart(room, ws.userType), {
              type: message.type,
              senderId: ws.userId,
            });
            break;
          }

          case 'read_receipt': {
            if (!ws.rideId || !ws.userId || !ws.userType || !ws.verifiedRide) return;
            // Marks all unread messages addressed to this user as read.
            const updated = await storage.markMessagesAsRead(ws.rideId, ws.userId);
            if (updated.length === 0) return;
            const ids = updated.map((m) => m.id);
            const room = rideRooms.get(ws.rideId);
            if (!room) return;
            const senderWs = getRoomCounterpart(room, ws.userType);
            // Tell the original sender their messages were read.
            safeSend(senderWs, {
              type: 'read_receipt',
              messageIds: ids,
              readAt: new Date(),
            });
            break;
          }

          case 'reaction_add':
          case 'reaction_remove': {
            if (!ws.rideId || !ws.userId || !ws.userType) return;
            const messageId: number = message.messageId;
            const emoji: string = String(message.emoji || '');
            if (!messageId || !emoji) return;

            // Verify the target message belongs to this ride.
            const target = await storage.getChatMessageById(messageId);
            if (!target || target.rideId !== ws.rideId) return;

            const updated = message.type === 'reaction_add'
              ? await storage.addReaction(messageId, ws.userId, emoji)
              : await storage.removeReaction(messageId, ws.userId, emoji);
            if (!updated) return;

            const room = rideRooms.get(ws.rideId);
            if (!room) return;
            const payload = {
              type: 'reaction_update',
              messageId,
              reactions: updated.reactions,
            };
            // Broadcast to BOTH parties so each side sees their own + counterpart's reactions.
            safeSend(room.rider, payload);
            safeSend(room.driver, payload);
            break;
          }

          case 'leave_ride': {
            if (!ws.rideId || !ws.userType) return;
            handleDisconnect(ws);
            break;
          }
        }
      } catch (error) {
        console.error('[WebSocket] Error processing message:', error);
      }
    });

    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', (error) => console.error('[WebSocket] Error:', error));
  });

  function handleDisconnect(ws: RideSocket) {
    if (ws.userId) userConnections.delete(ws.userId);

    if (ws.rideId !== null && ws.rideId !== undefined && ws.userType) {
      const room = rideRooms.get(ws.rideId);
      if (room) {
        const now = Date.now();
        if (ws.userType === 'rider') {
          if (room.rider === ws) room.rider = null;
          room.riderLastSeen = now;
        } else {
          if (room.driver === ws) room.driver = null;
          room.driverLastSeen = now;
        }
        // Notify the counterpart that we just went offline.
        const counterpart = getRoomCounterpart(room, ws.userType);
        safeSend(counterpart, { type: 'presence', online: false, lastSeen: now });

        if (!room.rider && !room.driver) {
          rideRooms.delete(ws.rideId);
        }
      }
    }

    ws.rideId = null;
    ws.userType = null;
    ws.userId = null;
    ws.verifiedRide = null;
  }

  console.log('[WebSocket] Server initialized');
  return wss;
}
