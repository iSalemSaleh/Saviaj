/**
 * Location Tracking Hook
 * 
 * This hook orchestrates real-time location tracking for rides.
 * It coordinates the WebSocketRideClient and LocationTracker classes
 * to provide a clean interface for ride tracking components.
 * 
 * Architecture:
 * - WebSocketRideClient: Manages real-time WebSocket communication
 * - LocationTracker: Handles GPS tracking with heading estimation
 * 
 * Responsibilities:
 * - Connects to WebSocket for real-time updates
 * - Tracks device location and sends updates
 * - Receives location updates from the other party
 * - Handles chat message delivery
 * 
 * @module useLocationTracking
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  WebSocketRideClient,
  ConnectionState,
  Location,
  ChatMessage,
} from '@/lib/WebSocketRideClient';
import { LocationTracker, TrackedLocation } from '@/lib/LocationTracker';

/**
 * Options for configuring location tracking.
 */
interface UseLocationTrackingOptions {
  /**
   * The ride ID to track.
   */
  rideId: number;
  
  /**
   * Whether the current user is a rider or driver.
   */
  userType: 'rider' | 'driver';
  
  /**
   * The current user's ID.
   */
  userId?: string;
  
  /**
   * Whether to enable tracking (set false to disable).
   * @default true
   */
  enableTracking?: boolean;
  
  /**
   * Callback for incoming chat messages.
   */
  onChatMessage?: (message: ChatMessage) => void;
}

/**
 * Return type of the useLocationTracking hook.
 */
interface UseLocationTrackingResult {
  /**
   * The user's own current location.
   */
  myLocation: TrackedLocation | null;
  
  /**
   * The other party's current location.
   */
  otherLocation: Location | null;
  
  /**
   * Whether WebSocket is connected.
   */
  isConnected: boolean;
  
  /**
   * Error message if something went wrong.
   */
  error: string | null;
  
  /**
   * Driver's location (alias based on user type).
   * For riders: this is the other party (driver)
   * For drivers: this is their own location
   */
  driverLocation: Location | TrackedLocation | null;
  
  /**
   * Rider's location (alias based on user type).
   * For drivers: this is the other party (rider)
   * For riders: this is their own location
   */
  riderLocation: Location | TrackedLocation | null;
  
  /**
   * Function to send a chat message. Returns the generated clientId so the caller
   * can render an optimistic bubble keyed by the same id.
   */
  sendChatMessage: (receiverId: string, message: string) => string | undefined;

  /**
   * Send a location-share chat bubble (renders as a tappable map link in the UI).
   */
  sendLocationMessage: (receiverId: string, lat: number, lng: number, label?: string) => string | undefined;

  /** Notify the other party that we're typing (or have stopped). */
  sendTyping: (typing: boolean) => void;

  /** Mark all unread messages addressed to us as read (server emits read_receipt to sender). */
  sendReadReceipt: () => void;

  /** Add or remove an emoji reaction on a message. */
  sendReaction: (messageId: number, emoji: string, remove?: boolean) => void;

  /** Resend a previously-failed message; reuses the original clientId for dedup safety. */
  resendChatMessage: (clientId: string) => void;

  /** Snapshot of currently queued (unacked) outbound messages — useful for UI restoration. */
  getQueuedMessages: () => Array<{ clientId: string; receiverId: string; message: string; messageType: 'text' | 'location'; locationLat?: number; locationLng?: number; attempts: number }>;

  /**
   * Reference to the WebSocket client (for advanced use cases like direct event subscriptions).
   */
  wsRef: React.MutableRefObject<WebSocketRideClient | null>;
}

/**
 * React hook for real-time ride location tracking.
 * 
 * This hook manages:
 * 1. WebSocket connection for real-time updates
 * 2. GPS location tracking with heading estimation
 * 3. Sending own location to the server
 * 4. Receiving the other party's location
 * 5. Chat message handling
 * 
 * @param options - Configuration options
 * @returns Location tracking state and functions
 * 
 * @example
 * // Basic usage in a ride tracking page
 * function RideTrackingPage({ rideId }) {
 *   const { user } = useAuth();
 *   
 *   const {
 *     driverLocation,
 *     riderLocation,
 *     isConnected,
 *     error,
 *     sendChatMessage,
 *   } = useLocationTracking({
 *     rideId,
 *     userType: 'rider',
 *     userId: user.id,
 *     enableTracking: true,
 *     onChatMessage: (msg) => addMessageToChat(msg),
 *   });
 *   
 *   if (error) {
 *     return <ErrorDisplay message={error} />;
 *   }
 *   
 *   return (
 *     <RideMap
 *       driverLocation={driverLocation}
 *       riderLocation={riderLocation}
 *     />
 *   );
 * }
 */
export function useLocationTracking({
  rideId,
  userType,
  userId,
  enableTracking = true,
  onChatMessage,
}: UseLocationTrackingOptions): UseLocationTrackingResult {
  // ============================================================
  // State Management
  // ============================================================
  
  const [myLocation, setMyLocation] = useState<TrackedLocation | null>(null);
  const [otherLocation, setOtherLocation] = useState<Location | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // ============================================================
  // Refs for Class Instances
  // These persist across renders and hold our service classes
  // ============================================================
  
  const wsClientRef = useRef<WebSocketRideClient | null>(null);
  const locationTrackerRef = useRef<LocationTracker | null>(null);
  
  // Stable ref for chat callback (avoids recreating effects)
  const onChatMessageRef = useRef(onChatMessage);
  onChatMessageRef.current = onChatMessage;
  
  // ============================================================
  // Public Methods
  // ============================================================
  
  /**
   * Sends a chat message to the specified recipient.
   * 
   * The message is sent via WebSocket and will be delivered
   * to the other party in real-time.
   */
  const sendChatMessage = useCallback((receiverId: string, message: string): string | undefined => {
    return wsClientRef.current?.sendChatMessage(receiverId, message);
  }, []);

  const sendLocationMessage = useCallback((receiverId: string, lat: number, lng: number, label?: string): string | undefined => {
    return wsClientRef.current?.sendLocationMessage(receiverId, lat, lng, label);
  }, []);

  const sendTyping = useCallback((typing: boolean) => {
    wsClientRef.current?.sendTyping(typing);
  }, []);

  const sendReadReceipt = useCallback(() => {
    wsClientRef.current?.sendReadReceipt();
  }, []);

  const sendReaction = useCallback((messageId: number, emoji: string, remove = false) => {
    wsClientRef.current?.sendReaction(messageId, emoji, remove);
  }, []);

  const resendChatMessage = useCallback((clientId: string) => {
    wsClientRef.current?.resendChatMessage(clientId);
  }, []);

  const getQueuedMessages = useCallback(() => {
    return wsClientRef.current?.getQueuedMessages() ?? [];
  }, []);
  
  // ============================================================
  // Effect: WebSocket Connection Management
  // ============================================================
  
  useEffect(() => {
    // Skip if tracking is disabled or no user ID
    if (!enableTracking || !userId) {
      return;
    }
    
    // Create WebSocket client with default options
    const wsClient = new WebSocketRideClient();
    wsClientRef.current = wsClient;
    
    // Subscribe to connection state changes
    const unsubConnection = wsClient.onConnectionStateChange((state) => {
      setIsConnected(state === ConnectionState.CONNECTED);
      if (state === ConnectionState.DISCONNECTED) {
        // Clear error on clean disconnect
        setError(null);
      }
    });
    
    // Subscribe to location updates from the other party
    const unsubLocation = wsClient.onLocationUpdate((location) => {
      setOtherLocation(location);
    });
    
    // Subscribe to chat messages
    const unsubChat = wsClient.onChatMessage((message) => {
      onChatMessageRef.current?.(message);
    });
    
    // Subscribe to errors
    const unsubError = wsClient.onError((err) => {
      setError(err);
    });
    
    // Establish connection
    wsClient.connect(rideId, userType, userId).catch((err) => {
      setError(err.message || 'Failed to connect');
    });
    
    // Cleanup function
    return () => {
      unsubConnection();
      unsubLocation();
      unsubChat();
      unsubError();
      wsClient.disconnect();
      wsClientRef.current = null;
    };
  }, [rideId, userType, userId, enableTracking]);
  
  // ============================================================
  // Effect: GPS Location Tracking
  // ============================================================
  
  useEffect(() => {
    // Skip if tracking is disabled
    if (!enableTracking) {
      return;
    }
    
    // Create location tracker with high accuracy
    const tracker = new LocationTracker({
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });
    locationTrackerRef.current = tracker;
    
    // Subscribe to location updates
    const unsubLocation = tracker.onLocationUpdate((location) => {
      setMyLocation(location);
      setError(null); // Clear any previous error
      
      // Send location to server if connected
      if (wsClientRef.current?.isConnected()) {
        wsClientRef.current.sendLocation({
          lat: location.lat,
          lng: location.lng,
          heading: location.heading,
          speed: location.speed,
          timestamp: location.timestamp,
        });
      }
    });
    
    // Subscribe to errors
    const unsubError = tracker.onError((err) => {
      setError(err);
    });
    
    // Start GPS tracking
    tracker.start().catch((err) => {
      setError(err.message || 'Failed to start location tracking');
    });
    
    // Cleanup function
    return () => {
      unsubLocation();
      unsubError();
      tracker.stop();
      locationTrackerRef.current = null;
    };
  }, [enableTracking]);
  
  // ============================================================
  // Computed Values
  // ============================================================
  
  // Determine driver/rider locations based on user type
  // This provides a convenient API for consumers
  const driverLocation = userType === 'rider' ? otherLocation : myLocation;
  const riderLocation = userType === 'driver' ? otherLocation : myLocation;
  
  // ============================================================
  // Return Value
  // ============================================================
  
  return {
    myLocation,
    otherLocation,
    isConnected,
    error,
    driverLocation,
    riderLocation,
    sendChatMessage,
    sendLocationMessage,
    sendTyping,
    sendReadReceipt,
    sendReaction,
    resendChatMessage,
    getQueuedMessages,
    wsRef: wsClientRef,
  };
}
