import { useState, useEffect, useRef, useCallback } from 'react';

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
  const watchIdRef = useRef<number | null>(null);
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
    
    if (!navigator.geolocation) {
      setError('Location services unavailable. Please use a modern browser with HTTPS.');
      return;
    }

    const handlePosition = (position: GeolocationPosition) => {
      setError(null);
      
      // Calculate heading from movement if GPS heading not available
      let heading = position.coords.heading ?? undefined;
      const currentPos = { lat: position.coords.latitude, lng: position.coords.longitude };
      
      if (heading === undefined || heading === null) {
        if (previousLocationRef.current) {
          // Calculate bearing from previous position to current
          const distance = Math.sqrt(
            Math.pow(currentPos.lat - previousLocationRef.current.lat, 2) +
            Math.pow(currentPos.lng - previousLocationRef.current.lng, 2)
          );
          // Only calculate heading if moved a meaningful distance (avoid jitter)
          if (distance > 0.00005) { // ~5 meters
            heading = calculateBearing(previousLocationRef.current, currentPos);
          }
        }
      }
      previousLocationRef.current = currentPos;
      
      const newLocation: Location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: heading, // GPS heading or calculated bearing
        speed: position.coords.speed ?? undefined, // Speed in m/s
        timestamp: position.timestamp,
      };
      setMyLocation(newLocation);
      sendLocation(newLocation);
    };

    const handleError = (err: GeolocationPositionError) => {
      let errorMessage = 'Location error';
      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMessage = 'Location access denied. Please enable location in your browser settings.';
          break;
        case err.POSITION_UNAVAILABLE:
          errorMessage = 'Location unavailable. Please check your GPS or network connection.';
          break;
        case err.TIMEOUT:
          errorMessage = 'Location request timed out. Please try again.';
          break;
        default:
          errorMessage = err.message || 'Unable to get location';
      }
      setError(errorMessage);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
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
