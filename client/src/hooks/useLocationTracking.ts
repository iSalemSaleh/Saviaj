import { useState, useEffect, useRef, useCallback } from 'react';
import { watchPosition, isNativePlatform, requestPermissions, GeolocationResult } from '@/lib/nativeGeolocation';

interface Location {
  lat: number;
  lng: number;
  heading?: number; // Direction in degrees (0-360, 0 = North)
  speed?: number; // Speed in m/s
  timestamp: number;
}

interface ChatMessage {
  id?: number;
  rideId: number;
  senderId: string;
  receiverId: string;
  message: string;
  createdAt?: Date;
  read?: boolean;
}

interface UseLocationTrackingOptions {
  rideId: number;
  userType: 'rider' | 'driver';
  userId?: string;
  enableTracking?: boolean;
  onChatMessage?: (message: ChatMessage) => void;
}

interface LocationMessage {
  type: 'location_update' | 'join_ride' | 'leave_ride' | 'chat_message';
  rideId: number;
  userType: 'rider' | 'driver';
  userId?: string;
  location?: Location;
}

// Calculate bearing between two points (returns degrees 0-360, 0 = North)
function calculateBearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360; // Normalize to 0-360
  return bearing;
}

export function useLocationTracking({
  rideId,
  userType,
  userId,
  enableTracking = true,
  onChatMessage,
}: UseLocationTrackingOptions) {
  const [myLocation, setMyLocation] = useState<Location | null>(null);
  const [otherLocation, setOtherLocation] = useState<Location | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const previousLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const sendLocation = useCallback((location: Location) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: LocationMessage = {
        type: 'location_update',
        rideId,
        userType,
        location,
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, [rideId, userType]);

  const sendChatMessage = useCallback((receiverId: string, message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && userId) {
      const chatMessage = {
        type: 'chat_message',
        rideId,
        senderId: userId,
        receiverId,
        message,
      };
      wsRef.current.send(JSON.stringify(chatMessage));
    }
  }, [rideId, userId]);

  useEffect(() => {
    if (!enableTracking) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      setError(null);
      
      const joinMessage: LocationMessage & { userId?: string } = {
        type: 'join_ride',
        rideId,
        userType,
        userId,
      };
      wsRef.current?.send(JSON.stringify(joinMessage));
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'location_update' && data.userType !== userType) {
          setOtherLocation(data.location);
        } else if (data.type === 'chat_message' || data.type === 'chat_message_sent') {
          if (onChatMessage) {
            onChatMessage(data);
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
    };

    wsRef.current.onerror = () => {
      setError('Connection error');
      setIsConnected(false);
    };

    return () => {
      if (wsRef.current) {
        const leaveMessage: LocationMessage = {
          type: 'leave_ride',
          rideId,
          userType,
        };
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(leaveMessage));
        }
        wsRef.current.close();
      }
    };
  }, [rideId, userType, userId, enableTracking, onChatMessage]);

  useEffect(() => {
    if (!enableTracking) {
      return;
    }
    
    if (!isNativePlatform() && !navigator.geolocation) {
      setError('Location services unavailable. Please use a modern browser with HTTPS.');
      return;
    }

    let watchHandle: { clearWatch: () => void } | null = null;

    const handlePosition = (position: GeolocationResult) => {
      setError(null);
      
      let heading = position.coords.heading ?? undefined;
      const currentPos = { lat: position.coords.latitude, lng: position.coords.longitude };
      
      if (heading === undefined || heading === null) {
        if (previousLocationRef.current) {
          const distance = Math.sqrt(
            Math.pow(currentPos.lat - previousLocationRef.current.lat, 2) +
            Math.pow(currentPos.lng - previousLocationRef.current.lng, 2)
          );
          if (distance > 0.00005) {
            heading = calculateBearing(previousLocationRef.current, currentPos);
          }
        }
      }
      previousLocationRef.current = currentPos;
      
      const newLocation: Location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: heading,
        speed: position.coords.speed ?? undefined,
        timestamp: position.timestamp,
      };
      setMyLocation(newLocation);
      sendLocation(newLocation);
    };

    const handleError = (err: any) => {
      let errorMessage = 'Location error';
      if (err?.code !== undefined) {
        switch (err.code) {
          case 1:
            errorMessage = 'Location access denied. Please enable location in your device settings.';
            break;
          case 2:
            errorMessage = 'Location unavailable. Please check your GPS or network connection.';
            break;
          case 3:
            errorMessage = 'Location request timed out. Please try again.';
            break;
          default:
            errorMessage = err.message || 'Unable to get location';
        }
      } else {
        errorMessage = err?.message || 'Unable to get location';
      }
      setError(errorMessage);
    };

    const startWatching = async () => {
      if (isNativePlatform()) {
        try {
          await requestPermissions();
        } catch (e) {
          setError('Location permission denied');
          return;
        }
      }
      
      watchHandle = watchPosition(
        handlePosition,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        }
      );
    };

    startWatching();

    return () => {
      if (watchHandle) {
        watchHandle.clearWatch();
      }
    };
  }, [enableTracking, sendLocation]);

  return {
    myLocation,
    otherLocation,
    isConnected,
    error,
    driverLocation: userType === 'rider' ? otherLocation : myLocation,
    riderLocation: userType === 'driver' ? otherLocation : myLocation,
    sendChatMessage,
    wsRef,
  };
}
