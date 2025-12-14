import { useState, useEffect, useRef, useCallback } from 'react';

interface Location {
  lat: number;
  lng: number;
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
    if (!enableTracking || !navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    const handlePosition = (position: GeolocationPosition) => {
      const newLocation: Location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: position.timestamp,
      };
      setMyLocation(newLocation);
      sendLocation(newLocation);
    };

    const handleError = (err: GeolocationPositionError) => {
      setError(err.message);
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
