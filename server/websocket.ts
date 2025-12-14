import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { storage } from './storage';

interface Location {
  lat: number;
  lng: number;
  timestamp: number;
}

interface LocationMessage {
  type: 'location_update' | 'join_ride' | 'leave_ride';
  rideId: number;
  userType: 'rider' | 'driver';
  location?: Location;
}

interface ChatMessage {
  type: 'chat_message';
  rideId: number;
  senderId: string;
  receiverId: string;
  message: string;
}

type WebSocketMessage = LocationMessage | ChatMessage;

interface RideRoom {
  rider: WebSocket | null;
  driver: WebSocket | null;
  riderUserId?: string;
  driverUserId?: string;
}

const rideRooms = new Map<number, RideRoom>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let currentRideId: number | null = null;
    let currentUserType: 'rider' | 'driver' | null = null;
    let currentUserId: string | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'join_ride': {
            const locMessage = message as LocationMessage & { userId?: string };
            currentRideId = locMessage.rideId;
            currentUserType = locMessage.userType;
            currentUserId = locMessage.userId || null;

            if (!rideRooms.has(locMessage.rideId)) {
              rideRooms.set(locMessage.rideId, { rider: null, driver: null });
            }

            const room = rideRooms.get(locMessage.rideId)!;
            if (locMessage.userType === 'rider') {
              room.rider = ws;
              room.riderUserId = locMessage.userId;
            } else {
              room.driver = ws;
              room.driverUserId = locMessage.userId;
            }

            console.log(`[WebSocket] ${locMessage.userType} joined ride ${locMessage.rideId}`);
            break;
          }

          case 'location_update': {
            const locMessage = message as LocationMessage;
            const room = rideRooms.get(locMessage.rideId);
            if (!room) return;

            const targetWs = locMessage.userType === 'rider' ? room.driver : room.rider;
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: 'location_update',
                userType: locMessage.userType,
                location: locMessage.location,
              }));
            }
            break;
          }

          case 'chat_message': {
            const chatMsg = message as ChatMessage;
            const room = rideRooms.get(chatMsg.rideId);
            
            // Save message to database
            const savedMessage = await storage.createChatMessage({
              rideId: chatMsg.rideId,
              senderId: chatMsg.senderId,
              receiverId: chatMsg.receiverId,
              message: chatMsg.message,
            });

            // Send to both participants
            const outgoingMessage = {
              type: 'chat_message',
              id: savedMessage.id,
              rideId: savedMessage.rideId,
              senderId: savedMessage.senderId,
              receiverId: savedMessage.receiverId,
              message: savedMessage.message,
              createdAt: savedMessage.createdAt,
              read: savedMessage.read,
            };

            // Send to receiver if connected
            if (room) {
              const receiverWs = chatMsg.senderId === room.riderUserId ? room.driver : room.rider;
              if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
                receiverWs.send(JSON.stringify(outgoingMessage));
              }
            }

            // Confirm to sender
            ws.send(JSON.stringify({
              ...outgoingMessage,
              type: 'chat_message_sent',
            }));

            console.log(`[WebSocket] Chat message sent in ride ${chatMsg.rideId}`);
            break;
          }

          case 'leave_ride': {
            const locMessage = message as LocationMessage;
            const room = rideRooms.get(locMessage.rideId);
            if (room) {
              if (locMessage.userType === 'rider') {
                room.rider = null;
                room.riderUserId = undefined;
              } else {
                room.driver = null;
                room.driverUserId = undefined;
              }

              if (!room.rider && !room.driver) {
                rideRooms.delete(locMessage.rideId);
              }
            }
            console.log(`[WebSocket] ${locMessage.userType} left ride ${locMessage.rideId}`);
            break;
          }
        }
      } catch (error) {
        console.error('[WebSocket] Error processing message:', error);
      }
    });

    ws.on('close', () => {
      if (currentRideId !== null && currentUserType) {
        const room = rideRooms.get(currentRideId);
        if (room) {
          if (currentUserType === 'rider') {
            room.rider = null;
            room.riderUserId = undefined;
          } else {
            room.driver = null;
            room.driverUserId = undefined;
          }

          if (!room.rider && !room.driver) {
            rideRooms.delete(currentRideId);
          }
        }
        console.log(`[WebSocket] ${currentUserType} disconnected from ride ${currentRideId}`);
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  console.log('[WebSocket] Server initialized');
  return wss;
}
