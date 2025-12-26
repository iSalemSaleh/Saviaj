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
  riderUserId: string;
  driverUserId: string;
}

const rideRooms = new Map<number, RideRoom>();
const userConnections = new Map<string, WebSocket>();

// Broadcast a message to a specific user by their userId
export function broadcast(message: any, userId: string) {
  const ws = userConnections.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    console.log(`[WebSocket] Broadcasted message to user ${userId}:`, message.type);
  } else {
    console.log(`[WebSocket] User ${userId} not connected, message not delivered`);
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let currentRideId: number | null = null;
    let currentUserType: 'rider' | 'driver' | null = null;
    let currentUserId: string | null = null;
    let verifiedRide: { riderId: string; driverId: string } | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'join_ride': {
            const locMessage = message as LocationMessage & { userId?: string };
            const userId = locMessage.userId;

            if (!userId) {
              ws.send(JSON.stringify({ type: 'error', message: 'User ID required' }));
              return;
            }

            // Verify ride exists and user is a participant
            const ride = await storage.getRideById(locMessage.rideId);
            if (!ride) {
              ws.send(JSON.stringify({ type: 'error', message: 'Ride not found' }));
              return;
            }

            // Verify user is actually a participant in this ride
            const isRider = ride.riderId === userId;
            const isDriver = ride.driverId === userId;

            if (!isRider && !isDriver) {
              ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: not a participant' }));
              return;
            }

            // Verify claimed userType matches actual role
            const actualUserType = isRider ? 'rider' : 'driver';
            if (locMessage.userType !== actualUserType) {
              ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: role mismatch' }));
              return;
            }

            currentRideId = locMessage.rideId;
            currentUserType = actualUserType;
            currentUserId = userId;
            verifiedRide = { riderId: ride.riderId, driverId: ride.driverId };

            // Store user connection for broadcast functionality
            userConnections.set(userId, ws);

            if (!rideRooms.has(locMessage.rideId)) {
              rideRooms.set(locMessage.rideId, { 
                rider: null, 
                driver: null,
                riderUserId: ride.riderId,
                driverUserId: ride.driverId,
              });
            }

            const room = rideRooms.get(locMessage.rideId)!;
            if (actualUserType === 'rider') {
              room.rider = ws;
            } else {
              room.driver = ws;
            }

            ws.send(JSON.stringify({ type: 'joined', rideId: locMessage.rideId, userType: actualUserType }));
            console.log(`[WebSocket] ${actualUserType} (${userId}) joined ride ${locMessage.rideId}`);
            break;
          }

          case 'location_update': {
            // Must be in a verified ride room
            if (!currentRideId || !currentUserId || !currentUserType) {
              ws.send(JSON.stringify({ type: 'error', message: 'Must join ride first' }));
              return;
            }

            const locMessage = message as LocationMessage;
            
            // Verify the update is for the current ride
            if (locMessage.rideId !== currentRideId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Cannot update different ride' }));
              return;
            }

            const room = rideRooms.get(currentRideId);
            if (!room) return;

            const targetWs = currentUserType === 'rider' ? room.driver : room.rider;
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: 'location_update',
                userType: currentUserType,
                location: locMessage.location,
              }));
            }
            break;
          }

          case 'chat_message': {
            const chatMsg = message as ChatMessage;
            
            // Must be in a verified ride room
            if (!currentRideId || !currentUserId || !verifiedRide) {
              ws.send(JSON.stringify({ type: 'error', message: 'Must join ride first' }));
              return;
            }

            // Verify the message is for the current ride
            if (chatMsg.rideId !== currentRideId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Cannot send to different ride' }));
              return;
            }

            // Derive sender and receiver from verified data - don't trust client
            const senderId = currentUserId;
            const receiverId = currentUserType === 'rider' ? verifiedRide.driverId : verifiedRide.riderId;

            const room = rideRooms.get(currentRideId);
            
            // Save message to database with server-derived IDs
            const savedMessage = await storage.createChatMessage({
              rideId: currentRideId,
              senderId,
              receiverId,
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
              const receiverWs = currentUserType === 'rider' ? room.driver : room.rider;
              if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
                receiverWs.send(JSON.stringify(outgoingMessage));
              }
            }

            // Confirm to sender
            ws.send(JSON.stringify({
              ...outgoingMessage,
              type: 'chat_message_sent',
            }));

            console.log(`[WebSocket] Chat message sent in ride ${currentRideId} from ${senderId}`);
            break;
          }

          case 'leave_ride': {
            // Use verified session data, not client data
            if (!currentRideId || !currentUserType) {
              return;
            }

            const room = rideRooms.get(currentRideId);
            if (room) {
              if (currentUserType === 'rider') {
                room.rider = null;
              } else {
                room.driver = null;
              }

              if (!room.rider && !room.driver) {
                rideRooms.delete(currentRideId);
              }
            }
            console.log(`[WebSocket] ${currentUserType} left ride ${currentRideId}`);
            
            // Clear session state
            currentRideId = null;
            currentUserType = null;
            currentUserId = null;
            verifiedRide = null;
            break;
          }
        }
      } catch (error) {
        console.error('[WebSocket] Error processing message:', error);
      }
    });

    ws.on('close', () => {
      // Remove from user connections
      if (currentUserId) {
        userConnections.delete(currentUserId);
      }
      
      if (currentRideId !== null && currentUserType) {
        const room = rideRooms.get(currentRideId);
        if (room) {
          if (currentUserType === 'rider') {
            room.rider = null;
          } else {
            room.driver = null;
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
