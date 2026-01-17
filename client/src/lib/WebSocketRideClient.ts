/**
 * WebSocket Ride Client
 * 
 * This class manages WebSocket connections for real-time ride tracking.
 * It handles connection lifecycle, message parsing, and provides a clean
 * interface for sending location updates and chat messages.
 * 
 * @class WebSocketRideClient
 * 
 * @example
 * // Create client and connect
 * const client = new WebSocketRideClient();
 * 
 * client.onLocationUpdate((location, userType) => {
 *   console.log(`${userType} moved to`, location);
 * });
 * 
 * client.onChatMessage((message) => {
 *   console.log('New message:', message);
 * });
 * 
 * await client.connect(rideId, 'rider', userId);
 * 
 * // Send updates
 * client.sendLocation({ lat: 51.5, lng: -0.1, heading: 90 });
 * client.sendChatMessage('recipientId', 'Hello!');
 * 
 * // Cleanup
 * client.disconnect();
 */

/**
 * Location data structure for tracking.
 */
export interface Location {
  /**
   * Latitude in decimal degrees.
   */
  lat: number;
  
  /**
   * Longitude in decimal degrees.
   */
  lng: number;
  
  /**
   * Heading in degrees (0-360, 0 = North).
   * Optional, may not be available from all GPS sources.
   */
  heading?: number;
  
  /**
   * Speed in meters per second.
   * Optional, may not be available from all GPS sources.
   */
  speed?: number;
  
  /**
   * Timestamp of the location reading.
   */
  timestamp: number;
}

/**
 * Chat message structure.
 */
export interface ChatMessage {
  /**
   * Unique message ID (assigned by server).
   */
  id?: number;
  
  /**
   * Ride ID this message belongs to.
   */
  rideId: number;
  
  /**
   * User ID of the sender.
   */
  senderId: string;
  
  /**
   * User ID of the recipient.
   */
  receiverId: string;
  
  /**
   * Message content.
   */
  message: string;
  
  /**
   * When the message was created.
   */
  createdAt?: Date;
  
  /**
   * Whether the message has been read.
   */
  read?: boolean;
}

/**
 * WebSocket message types supported by the server.
 */
type MessageType =
  | 'location_update'
  | 'join_ride'
  | 'leave_ride'
  | 'chat_message'
  | 'chat_message_sent';

/**
 * Outbound message structure.
 */
interface OutboundMessage {
  type: MessageType;
  rideId: number;
  userType: 'rider' | 'driver';
  userId?: string;
  location?: Location;
  senderId?: string;
  receiverId?: string;
  message?: string;
}

/**
 * Connection state enum.
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

/**
 * Configuration options for the WebSocket client.
 */
export interface WebSocketClientOptions {
  /**
   * Maximum number of reconnection attempts.
   * @default 5
   */
  maxReconnectAttempts?: number;
  
  /**
   * Base delay between reconnection attempts (ms).
   * Uses exponential backoff.
   * @default 1000
   */
  reconnectBaseDelayMs?: number;
}

/**
 * Event callback types.
 */
type LocationCallback = (location: Location, userType: 'rider' | 'driver') => void;
type ChatCallback = (message: ChatMessage) => void;
type ConnectionCallback = (state: ConnectionState) => void;
type ErrorCallback = (error: string) => void;

/**
 * WebSocket client for real-time ride tracking and chat.
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Clean event-based API for location and chat updates
 * - Proper cleanup on disconnect
 * - Type-safe message handling
 */
export class WebSocketRideClient {
  /**
   * The WebSocket connection instance.
   */
  private ws: WebSocket | null = null;
  
  /**
   * Current connection state.
   */
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  
  /**
   * Current ride ID (set after joining).
   */
  private rideId: number | null = null;
  
  /**
   * Current user type (rider or driver).
   */
  private userType: 'rider' | 'driver' | null = null;
  
  /**
   * Current user ID.
   */
  private userId: string | null = null;
  
  /**
   * Configuration options.
   */
  private options: Required<WebSocketClientOptions>;
  
  /**
   * Number of reconnection attempts made.
   */
  private reconnectAttempts: number = 0;
  
  /**
   * Timeout ID for reconnection delay.
   */
  private reconnectTimeout: NodeJS.Timeout | null = null;
  
  /**
   * Event callbacks.
   */
  private locationCallbacks: LocationCallback[] = [];
  private chatCallbacks: ChatCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  
  /**
   * Creates a new WebSocketRideClient.
   * 
   * @param options - Configuration options
   */
  constructor(options: WebSocketClientOptions = {}) {
    this.options = {
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 1000,
    };
  }
  
  /**
   * Connects to the WebSocket server and joins a ride.
   * 
   * @param rideId - The ride ID to join
   * @param userType - Whether the user is a 'rider' or 'driver'
   * @param userId - The user's unique identifier
   * @returns Promise that resolves when connected
   */
  public async connect(
    rideId: number,
    userType: 'rider' | 'driver',
    userId: string
  ): Promise<void> {
    this.rideId = rideId;
    this.userType = userType;
    this.userId = userId;
    this.reconnectAttempts = 0;
    
    return this.createConnection();
  }
  
  /**
   * Creates the WebSocket connection.
   */
  private createConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.updateState(ConnectionState.CONNECTING);
      
      // Build WebSocket URL based on current page protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.ws = new WebSocket(wsUrl);
      
      /**
       * Handle successful connection.
       */
      this.ws.onopen = () => {
        this.updateState(ConnectionState.CONNECTED);
        this.reconnectAttempts = 0;
        
        // Send join message
        this.sendMessage({
          type: 'join_ride',
          rideId: this.rideId!,
          userType: this.userType!,
          userId: this.userId!,
        });
        
        resolve();
      };
      
      /**
       * Handle incoming messages.
       */
      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
      
      /**
       * Handle connection close.
       */
      this.ws.onclose = () => {
        this.updateState(ConnectionState.DISCONNECTED);
        
        // Attempt reconnection if not intentionally disconnected
        if (this.rideId !== null) {
          this.attemptReconnect();
        }
      };
      
      /**
       * Handle connection errors.
       */
      this.ws.onerror = () => {
        this.notifyError('WebSocket connection error');
        reject(new Error('WebSocket connection failed'));
      };
    });
  }
  
  /**
   * Attempts to reconnect with exponential backoff.
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.notifyError('Max reconnection attempts reached');
      return;
    }
    
    this.updateState(ConnectionState.RECONNECTING);
    this.reconnectAttempts++;
    
    // Calculate delay with exponential backoff
    const delay = this.options.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    
    this.reconnectTimeout = setTimeout(() => {
      this.createConnection().catch(() => {
        // Error will trigger another reconnect attempt
      });
    }, delay);
  }
  
  /**
   * Parses and routes incoming messages.
   * 
   * @param data - Raw message data from WebSocket
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'location_update':
          // Only process updates from the other party
          if (message.userType !== this.userType) {
            this.notifyLocationUpdate(message.location, message.userType);
          }
          break;
          
        case 'chat_message':
        case 'chat_message_sent':
          this.notifyChatMessage(message);
          break;
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }
  
  /**
   * Sends a message through the WebSocket.
   * 
   * @param message - Message to send
   */
  private sendMessage(message: OutboundMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  /**
   * Sends a location update to the server.
   * 
   * @param location - Current location data
   */
  public sendLocation(location: Location): void {
    if (!this.rideId || !this.userType) return;
    
    this.sendMessage({
      type: 'location_update',
      rideId: this.rideId,
      userType: this.userType,
      location,
    });
  }
  
  /**
   * Sends a chat message.
   * 
   * @param receiverId - ID of the message recipient
   * @param message - Message content
   */
  public sendChatMessage(receiverId: string, message: string): void {
    if (!this.rideId || !this.userId) return;
    
    this.sendMessage({
      type: 'chat_message',
      rideId: this.rideId,
      userType: this.userType!,
      senderId: this.userId,
      receiverId,
      message,
    });
  }
  
  /**
   * Disconnects from the WebSocket server.
   * 
   * Sends a leave message and cleanly closes the connection.
   */
  public disconnect(): void {
    // Cancel any pending reconnection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Send leave message if connected
    if (this.ws?.readyState === WebSocket.OPEN && this.rideId && this.userType) {
      this.sendMessage({
        type: 'leave_ride',
        rideId: this.rideId,
        userType: this.userType,
      });
    }
    
    // Close connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Clear state
    this.rideId = null;
    this.userType = null;
    this.userId = null;
    this.updateState(ConnectionState.DISCONNECTED);
  }
  
  /**
   * Updates connection state and notifies listeners.
   */
  private updateState(state: ConnectionState): void {
    this.state = state;
    this.connectionCallbacks.forEach((cb) => cb(state));
  }
  
  /**
   * Notifies location update listeners.
   */
  private notifyLocationUpdate(location: Location, userType: 'rider' | 'driver'): void {
    this.locationCallbacks.forEach((cb) => cb(location, userType));
  }
  
  /**
   * Notifies chat message listeners.
   */
  private notifyChatMessage(message: ChatMessage): void {
    this.chatCallbacks.forEach((cb) => cb(message));
  }
  
  /**
   * Notifies error listeners.
   */
  private notifyError(error: string): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }
  
  /**
   * Registers a callback for location updates.
   * 
   * @param callback - Function to call when a location update is received
   * @returns Unsubscribe function
   */
  public onLocationUpdate(callback: LocationCallback): () => void {
    this.locationCallbacks.push(callback);
    return () => {
      this.locationCallbacks = this.locationCallbacks.filter((cb) => cb !== callback);
    };
  }
  
  /**
   * Registers a callback for chat messages.
   * 
   * @param callback - Function to call when a chat message is received
   * @returns Unsubscribe function
   */
  public onChatMessage(callback: ChatCallback): () => void {
    this.chatCallbacks.push(callback);
    return () => {
      this.chatCallbacks = this.chatCallbacks.filter((cb) => cb !== callback);
    };
  }
  
  /**
   * Registers a callback for connection state changes.
   * 
   * @param callback - Function to call when connection state changes
   * @returns Unsubscribe function
   */
  public onConnectionStateChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      this.connectionCallbacks = this.connectionCallbacks.filter((cb) => cb !== callback);
    };
  }
  
  /**
   * Registers a callback for errors.
   * 
   * @param callback - Function to call when an error occurs
   * @returns Unsubscribe function
   */
  public onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
    };
  }
  
  /**
   * Gets the current connection state.
   */
  public getState(): ConnectionState {
    return this.state;
  }
  
  /**
   * Checks if currently connected.
   */
  public isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }
}
