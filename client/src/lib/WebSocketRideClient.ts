/**
 * WebSocketRideClient
 *
 * Real-time client for the rider/driver experience. Provides:
 *  - Auto-reconnect with exponential backoff.
 *  - Outbound message queue (mirrored to localStorage) that survives reconnects and refreshes.
 *  - Per-message client IDs (uuid) so the server can dedup retries and the UI can reconcile
 *    optimistic bubbles with the server-confirmed row.
 *  - Heartbeat health check (relies on server pings; the `ws` library handles pong frames
 *    automatically in the browser).
 *  - Typed event callbacks for location, chat, presence, typing, delivery + read receipts,
 *    and reaction updates.
 */

export interface Location {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageKind = 'text' | 'location' | 'image' | 'voice' | 'file';

export interface ChatMessage {
  id?: number;
  clientId?: string;
  rideId: number;
  senderId: string;
  receiverId: string;
  message: string;
  messageType?: MessageKind;
  locationLat?: string | number | null;
  locationLng?: string | number | null;
  // Tier 3 media
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaName?: string | null;
  mediaSizeBytes?: number | null;
  mediaDurationMs?: number | null;
  mediaThumbnailUrl?: string | null;
  // Tier 5 reply / edit / delete / pin
  replyToMessageId?: number | null;
  editedAt?: string | Date | null;
  deletedAt?: string | Date | null;
  pinnedAt?: string | Date | null;
  status?: MessageStatus;
  reactions?: Record<string, string[]>;
  createdAt?: string | Date;
  deliveredAt?: string | Date | null;
  readAt?: string | Date | null;
  read?: boolean;
}

export interface MessageEditedEvent { id: number; message: string; editedAt: string | Date; }
export interface MessageDeletedEvent { id: number; deletedAt: string | Date; }
export interface PinnedEvent { rideId: number; messageId: number | null; }

export interface PresenceEvent {
  online: boolean;
  lastSeen: number | string | null;
}

export interface DeliveryReceiptEvent {
  id: number;
  clientId?: string;
  deliveredAt: string | Date;
}

export interface ReadReceiptEvent {
  messageIds: number[];
  readAt: string | Date;
}

export interface ReactionUpdateEvent {
  messageId: number;
  reactions: Record<string, string[]>;
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

export interface WebSocketClientOptions {
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
}

type LocationCallback = (location: Location, userType: 'rider' | 'driver') => void;
type ChatCallback = (message: ChatMessage) => void;
type ConnectionCallback = (state: ConnectionState) => void;
type ErrorCallback = (error: string) => void;
type TypingCallback = (event: { senderId: string; typing: boolean }) => void;
type PresenceCallback = (event: PresenceEvent) => void;
type DeliveryCallback = (event: DeliveryReceiptEvent) => void;
type ReadCallback = (event: ReadReceiptEvent) => void;
type ReactionCallback = (event: ReactionUpdateEvent) => void;
type MessageEditedCallback = (event: MessageEditedEvent) => void;
type MessageDeletedCallback = (event: MessageDeletedEvent) => void;
type PinnedCallback = (event: PinnedEvent) => void;

interface QueuedMessage {
  clientId: string;
  receiverId: string;
  message: string;
  messageType: MessageKind;
  locationLat?: number;
  locationLng?: number;
  // Tier 3 media — persisted in the queue so retries on reload still work.
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaName?: string;
  mediaSizeBytes?: number;
  mediaDurationMs?: number;
  mediaThumbnailUrl?: string;
  // Tier 5 reply
  replyToMessageId?: number;
  attempts: number;
}

// Polyfill-safe UUID. crypto.randomUUID is available in modern browsers + Node 16+.
function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
  } catch { /* fall through */ }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class WebSocketRideClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private rideId: number | null = null;
  private userType: 'rider' | 'driver' | null = null;
  private userId: string | null = null;

  private options: Required<WebSocketClientOptions>;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private locationCallbacks: LocationCallback[] = [];
  private chatCallbacks: ChatCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private typingCallbacks: TypingCallback[] = [];
  private presenceCallbacks: PresenceCallback[] = [];
  private deliveryCallbacks: DeliveryCallback[] = [];
  private readCallbacks: ReadCallback[] = [];
  private reactionCallbacks: ReactionCallback[] = [];
  private editedCallbacks: MessageEditedCallback[] = [];
  private deletedCallbacks: MessageDeletedCallback[] = [];
  private pinnedCallbacks: PinnedCallback[] = [];

  // Queue of outbound chat messages awaiting an ack. Keyed by clientId for O(1) ack drain.
  private sendQueue: Map<string, QueuedMessage> = new Map();

  constructor(options: WebSocketClientOptions = {}) {
    this.options = {
      maxReconnectAttempts: options.maxReconnectAttempts ?? 8,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 1000,
    };
  }

  // ============================================================
  // Connection lifecycle
  // ============================================================

  public async connect(rideId: number, userType: 'rider' | 'driver', userId: string): Promise<void> {
    this.rideId = rideId;
    this.userType = userType;
    this.userId = userId;
    this.reconnectAttempts = 0;
    this.loadQueueFromStorage();
    return this.createConnection();
  }

  private createConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.updateState(ConnectionState.CONNECTING);
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.updateState(ConnectionState.CONNECTED);
        this.reconnectAttempts = 0;
        this.sendRaw({
          type: 'join_ride',
          rideId: this.rideId!,
          userType: this.userType!,
          userId: this.userId!,
        });
        // Drain any queued outbound messages now that we're back online.
        this.flushQueue();
        resolve();
      };

      this.ws.onmessage = (event) => this.handleMessage(event.data);

      this.ws.onclose = () => {
        this.updateState(ConnectionState.DISCONNECTED);
        if (this.rideId !== null) this.attemptReconnect();
      };

      this.ws.onerror = () => {
        this.notifyError('WebSocket connection error');
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.notifyError('Max reconnection attempts reached');
      return;
    }
    this.updateState(ConnectionState.RECONNECTING);
    this.reconnectAttempts++;
    const delay = Math.min(this.options.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1), 30_000);
    this.reconnectTimeout = setTimeout(() => {
      this.createConnection().catch(() => { /* error triggers another retry */ });
    }, delay);
  }

  // ============================================================
  // Inbound dispatch
  // ============================================================

  private handleMessage(data: string): void {
    try {
      const m = JSON.parse(data);
      switch (m.type) {
        case 'location_update':
          if (m.userType !== this.userType) {
            this.locationCallbacks.forEach((cb) => cb(m.location, m.userType));
          }
          break;
        case 'chat_message':
          this.chatCallbacks.forEach((cb) => cb(m));
          break;
        case 'chat_message_sent':
          // Drain ack from queue, then notify.
          if (m.clientId) {
            this.sendQueue.delete(m.clientId);
            this.persistQueue();
          }
          this.chatCallbacks.forEach((cb) => cb(m));
          break;
        case 'delivery_receipt':
          this.deliveryCallbacks.forEach((cb) => cb(m));
          break;
        case 'read_receipt':
          this.readCallbacks.forEach((cb) => cb(m));
          break;
        case 'typing':
          this.typingCallbacks.forEach((cb) => cb({ senderId: m.senderId, typing: true }));
          break;
        case 'typing_stop':
          this.typingCallbacks.forEach((cb) => cb({ senderId: m.senderId, typing: false }));
          break;
        case 'presence':
          this.presenceCallbacks.forEach((cb) => cb({ online: !!m.online, lastSeen: m.lastSeen ?? null }));
          break;
        case 'joined':
          if (m.presence) {
            this.presenceCallbacks.forEach((cb) => cb({ online: !!m.presence.online, lastSeen: m.presence.lastSeen ?? null }));
          }
          break;
        case 'reaction_update':
          this.reactionCallbacks.forEach((cb) => cb({ messageId: m.messageId, reactions: m.reactions || {} }));
          break;
        case 'chat_message_edited':
          this.editedCallbacks.forEach((cb) => cb({ id: m.id, message: m.message, editedAt: m.editedAt }));
          break;
        case 'chat_message_deleted':
          this.deletedCallbacks.forEach((cb) => cb({ id: m.id, deletedAt: m.deletedAt }));
          break;
        case 'chat_pinned':
          this.pinnedCallbacks.forEach((cb) => cb({ rideId: m.rideId, messageId: m.messageId }));
          break;
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }

  // ============================================================
  // Outbound API
  // ============================================================

  private sendRaw(payload: any): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  public sendLocation(location: Location): void {
    if (!this.rideId || !this.userType) return;
    this.sendRaw({ type: 'location_update', rideId: this.rideId, userType: this.userType, location });
  }

  /**
   * Sends a text chat message. Returns the generated clientId so the caller can
   * render an optimistic bubble keyed by the same id.
   */
  public sendChatMessage(receiverId: string, message: string): string {
    return this.enqueueAndSend({
      clientId: uuid(),
      receiverId,
      message,
      messageType: 'text',
      attempts: 0,
    });
  }

  public sendLocationMessage(receiverId: string, lat: number, lng: number, label = 'Shared location'): string {
    return this.enqueueAndSend({
      clientId: uuid(),
      receiverId,
      message: label,
      messageType: 'location',
      locationLat: lat,
      locationLng: lng,
      attempts: 0,
    });
  }

  /**
   * Send a media chat message (image/voice/file). The caller is responsible for uploading
   * the bytes to Azure Blob first via the SAS URL, then passing the resulting read URL here.
   */
  public sendMediaMessage(opts: {
    receiverId: string;
    kind: 'image' | 'voice' | 'file';
    mediaUrl: string;
    mediaMimeType: string;
    mediaName?: string;
    mediaSizeBytes?: number;
    mediaDurationMs?: number;
    mediaThumbnailUrl?: string;
    caption?: string;
    replyToMessageId?: number;
  }): string {
    return this.enqueueAndSend({
      clientId: uuid(),
      receiverId: opts.receiverId,
      message: opts.caption ?? '',
      messageType: opts.kind,
      mediaUrl: opts.mediaUrl,
      mediaMimeType: opts.mediaMimeType,
      mediaName: opts.mediaName,
      mediaSizeBytes: opts.mediaSizeBytes,
      mediaDurationMs: opts.mediaDurationMs,
      mediaThumbnailUrl: opts.mediaThumbnailUrl,
      replyToMessageId: opts.replyToMessageId,
      attempts: 0,
    });
  }

  /** Send a text reply quoting an existing message. */
  public sendReply(receiverId: string, message: string, replyToMessageId: number): string {
    return this.enqueueAndSend({
      clientId: uuid(),
      receiverId,
      message,
      messageType: 'text',
      replyToMessageId,
      attempts: 0,
    });
  }

  /**
   * Resend a message that previously failed. Re-uses its clientId so the server
   * dedups against the original row if it actually went through.
   */
  public resendChatMessage(clientId: string): void {
    const msg = this.sendQueue.get(clientId);
    if (!msg) return;
    msg.attempts += 1;
    this.persistQueue();
    this.dispatchQueued(msg);
  }

  public sendTyping(typing: boolean): void {
    if (!this.rideId) return;
    this.sendRaw({ type: typing ? 'typing' : 'typing_stop', rideId: this.rideId });
  }

  public sendReadReceipt(): void {
    if (!this.rideId) return;
    this.sendRaw({ type: 'read_receipt', rideId: this.rideId });
  }

  public sendReaction(messageId: number, emoji: string, remove = false): void {
    if (!this.rideId) return;
    this.sendRaw({ type: remove ? 'reaction_remove' : 'reaction_add', rideId: this.rideId, messageId, emoji });
  }

  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws?.readyState === WebSocket.OPEN && this.rideId && this.userType) {
      this.sendRaw({ type: 'leave_ride', rideId: this.rideId, userType: this.userType });
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.rideId = null;
    this.userType = null;
    this.userId = null;
    this.updateState(ConnectionState.DISCONNECTED);
  }

  // ============================================================
  // Queue persistence
  // ============================================================

  private queueStorageKey(): string {
    return `chat_queue_${this.rideId ?? 'none'}_${this.userId ?? 'anon'}`;
  }

  private loadQueueFromStorage(): void {
    this.sendQueue.clear();
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.queueStorageKey());
      if (!raw) return;
      const parsed: QueuedMessage[] = JSON.parse(raw);
      parsed.forEach((m) => this.sendQueue.set(m.clientId, m));
    } catch { /* ignore */ }
  }

  private persistQueue(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const arr = Array.from(this.sendQueue.values());
      if (arr.length === 0) localStorage.removeItem(this.queueStorageKey());
      else localStorage.setItem(this.queueStorageKey(), JSON.stringify(arr));
    } catch { /* ignore */ }
  }

  private enqueueAndSend(msg: QueuedMessage): string {
    this.sendQueue.set(msg.clientId, msg);
    this.persistQueue();
    this.dispatchQueued(msg);
    return msg.clientId;
  }

  private dispatchQueued(msg: QueuedMessage): void {
    if (!this.rideId || !this.userId) return;
    const payload: any = {
      type: 'chat_message',
      rideId: this.rideId,
      userType: this.userType,
      senderId: this.userId,
      receiverId: msg.receiverId,
      message: msg.message,
      messageType: msg.messageType,
      clientId: msg.clientId,
    };
    if (msg.messageType === 'location') {
      payload.locationLat = msg.locationLat;
      payload.locationLng = msg.locationLng;
    }
    if (msg.messageType === 'image' || msg.messageType === 'voice' || msg.messageType === 'file') {
      payload.mediaUrl = msg.mediaUrl;
      payload.mediaMimeType = msg.mediaMimeType;
      payload.mediaName = msg.mediaName;
      payload.mediaSizeBytes = msg.mediaSizeBytes;
      payload.mediaDurationMs = msg.mediaDurationMs;
      payload.mediaThumbnailUrl = msg.mediaThumbnailUrl;
    }
    if (msg.replyToMessageId != null) payload.replyToMessageId = msg.replyToMessageId;
    this.sendRaw(payload);
  }

  /**
   * Returns the list of currently queued (unacked) messages so the UI can render
   * them as "sending..." bubbles after a refresh.
   */
  public getQueuedMessages(): QueuedMessage[] {
    return Array.from(this.sendQueue.values());
  }

  private flushQueue(): void {
    this.sendQueue.forEach((msg) => this.dispatchQueued(msg));
  }

  // ============================================================
  // Event registration
  // ============================================================

  private updateState(state: ConnectionState): void {
    this.state = state;
    this.connectionCallbacks.forEach((cb) => cb(state));
  }

  private notifyError(error: string): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  public onLocationUpdate(cb: LocationCallback) { this.locationCallbacks.push(cb); return () => { this.locationCallbacks = this.locationCallbacks.filter((c) => c !== cb); }; }
  public onChatMessage(cb: ChatCallback) { this.chatCallbacks.push(cb); return () => { this.chatCallbacks = this.chatCallbacks.filter((c) => c !== cb); }; }
  public onConnectionStateChange(cb: ConnectionCallback) { this.connectionCallbacks.push(cb); return () => { this.connectionCallbacks = this.connectionCallbacks.filter((c) => c !== cb); }; }
  public onError(cb: ErrorCallback) { this.errorCallbacks.push(cb); return () => { this.errorCallbacks = this.errorCallbacks.filter((c) => c !== cb); }; }
  public onTyping(cb: TypingCallback) { this.typingCallbacks.push(cb); return () => { this.typingCallbacks = this.typingCallbacks.filter((c) => c !== cb); }; }
  public onPresence(cb: PresenceCallback) { this.presenceCallbacks.push(cb); return () => { this.presenceCallbacks = this.presenceCallbacks.filter((c) => c !== cb); }; }
  public onDeliveryReceipt(cb: DeliveryCallback) { this.deliveryCallbacks.push(cb); return () => { this.deliveryCallbacks = this.deliveryCallbacks.filter((c) => c !== cb); }; }
  public onReadReceipt(cb: ReadCallback) { this.readCallbacks.push(cb); return () => { this.readCallbacks = this.readCallbacks.filter((c) => c !== cb); }; }
  public onReactionUpdate(cb: ReactionCallback) { this.reactionCallbacks.push(cb); return () => { this.reactionCallbacks = this.reactionCallbacks.filter((c) => c !== cb); }; }
  public onMessageEdited(cb: MessageEditedCallback) { this.editedCallbacks.push(cb); return () => { this.editedCallbacks = this.editedCallbacks.filter((c) => c !== cb); }; }
  public onMessageDeleted(cb: MessageDeletedCallback) { this.deletedCallbacks.push(cb); return () => { this.deletedCallbacks = this.deletedCallbacks.filter((c) => c !== cb); }; }
  public onPinned(cb: PinnedCallback) { this.pinnedCallbacks.push(cb); return () => { this.pinnedCallbacks = this.pinnedCallbacks.filter((c) => c !== cb); }; }

  public getState(): ConnectionState { return this.state; }
  public isConnected(): boolean { return this.state === ConnectionState.CONNECTED; }
}
