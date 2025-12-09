import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

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

interface RideRoom {
  rider: WebSocket | null;
  driver: WebSocket | null;
}

const rideRooms = new Map<number, RideRoom>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let currentRideId: number | null = null;
    let currentUserType: 'rider' | 'driver' | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const message: LocationMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'join_ride': {
            currentRideId = message.rideId;
            currentUserType = message.userType;

            if (!rideRooms.has(message.rideId)) {
              rideRooms.set(message.rideId, { rider: null, driver: null });
            }

            const room = rideRooms.get(message.rideId)!;
            if (message.userType === 'rider') {
              room.rider = ws;
            } else {
              room.driver = ws;
            }

            console.log(`[WebSocket] ${message.userType} joined ride ${message.rideId}`);
            break;
          }

          case 'location_update': {
            const room = rideRooms.get(message.rideId);
            if (!room) return;

            const targetWs = message.userType === 'rider' ? room.driver : room.rider;
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: 'location_update',
                userType: message.userType,
                location: message.location,
              }));
            }
            break;
          }

          case 'leave_ride': {
            const room = rideRooms.get(message.rideId);
            if (room) {
              if (message.userType === 'rider') {
                room.rider = null;
              } else {
                room.driver = null;
              }

              if (!room.rider && !room.driver) {
                rideRooms.delete(message.rideId);
              }
            }
            console.log(`[WebSocket] ${message.userType} left ride ${message.rideId}`);
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
