/**
 * Chat
 *
 * 10/10 in-app messaging panel for the rider/driver experience. Built on top of
 * WebSocketRideClient (real-time) with TanStack Query as a 30s safety-net poll.
 *
 * Features:
 *  - Optimistic send with clientId-based reconciliation (no content-matching dedup).
 *  - Per-message status icon: sending (clock) → sent (✓) → delivered (✓✓) → read (✓✓ blue).
 *  - Failed sends get a one-tap "Retry" affordance.
 *  - WebSocket-driven real-time messages, typing indicator, presence (online / last seen),
 *    delivery + read receipts, and emoji reactions.
 *  - Smart auto-scroll: only scrolls if the user is near the bottom; otherwise shows a
 *    "New messages ↓" pill that jumps them down on tap.
 *  - Mark-as-read fires on open, on visibility change, and whenever a new message arrives
 *    while the chat is open (with debouncing).
 *  - Date separators (Today / Yesterday / dd MMM) and message grouping for adjacent
 *    same-sender messages.
 *  - Quick-reply chips for one-tap canned responses while driving.
 *  - Location share button (sends a special bubble with an "Open in Maps" link).
 *  - Long-press / right-click any bubble to add an emoji reaction.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Send, MessageSquare, X, Check, CheckCheck, Clock,
  AlertCircle, MapPin, Smile, ChevronDown, RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import type {
  WebSocketRideClient,
  ChatMessage as WsChatMessage,
  PresenceEvent,
} from "@/lib/WebSocketRideClient";

// ============================================================
// Types
// ============================================================

type Status = "sending" | "sent" | "delivered" | "read" | "failed";

interface UiMessage {
  id?: number;
  clientId?: string;
  rideId: number;
  senderId: string;
  receiverId: string;
  message: string;
  messageType: "text" | "location";
  locationLat?: number | null;
  locationLng?: number | null;
  status: Status;
  reactions: Record<string, string[]>;
  createdAt: string;
}

interface ChatProps {
  rideId: number;
  currentUserId: string;
  otherUserId: string;
  /** Hook-provided WebSocket client ref. May be null until the socket connects. */
  wsRef: React.MutableRefObject<WebSocketRideClient | null>;
  /** Send methods from useLocationTracking. */
  sendChatMessage: (receiverId: string, message: string) => string | undefined;
  sendLocationMessage: (receiverId: string, lat: number, lng: number, label?: string) => string | undefined;
  sendTyping: (typing: boolean) => void;
  sendReadReceipt: () => void;
  sendReaction: (messageId: number, emoji: string, remove?: boolean) => void;
  resendChatMessage: (clientId: string) => void;
  isConnected: boolean;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================
// Constants
// ============================================================

const QUICK_REPLIES = [
  "On my way",
  "I'm here",
  "Running 2 min late",
  "Where are you?",
  "Thank you!",
];

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "😢"];

const SCROLL_BOTTOM_THRESHOLD_PX = 80;
const TYPING_STOP_MS = 2500;

// ============================================================
// Helpers
// ============================================================

function toUi(msg: WsChatMessage | any): UiMessage {
  return {
    id: msg.id,
    clientId: msg.clientId,
    rideId: msg.rideId,
    senderId: msg.senderId,
    receiverId: msg.receiverId,
    message: msg.message ?? "",
    messageType: (msg.messageType as any) ?? "text",
    locationLat: msg.locationLat != null ? Number(msg.locationLat) : null,
    locationLng: msg.locationLng != null ? Number(msg.locationLng) : null,
    status: (msg.status as Status) ?? (msg.read ? "read" : "sent"),
    reactions: (msg.reactions as Record<string, string[]>) ?? {},
    createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
  };
}

function statusRank(s: Status): number {
  return { sending: 0, failed: 0, sent: 1, delivered: 2, read: 3 }[s] ?? 0;
}

function dayBucket(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatLastSeen(lastSeen: number | string | null | undefined): string {
  if (!lastSeen) return "Offline";
  const ts = typeof lastSeen === "string" ? new Date(lastSeen).getTime() : lastSeen;
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (diffMin < 1) return "Last seen just now";
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Last seen ${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `Last seen ${diffD}d ago`;
}

// ============================================================
// Component
// ============================================================

export function Chat({
  rideId,
  currentUserId,
  otherUserId,
  wsRef,
  sendChatMessage,
  sendLocationMessage,
  sendTyping,
  sendReadReceipt,
  sendReaction,
  resendChatMessage,
  isConnected,
  isOpen,
  onClose,
}: ChatProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [presence, setPresence] = useState<PresenceEvent>({ online: false, lastSeen: null });
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasUnseenBelow, setHasUnseenBelow] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<number | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const queryClient = useQueryClient();

  // ============================================================
  // Initial + safety-net fetch (30s, only when chat is open)
  // ============================================================
  const { data: serverMessages } = useQuery<any[]>({
    queryKey: [`/api/rides/${rideId}/messages`],
    enabled: isOpen && rideId > 0,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  // Seed local state from server fetch, merging without losing optimistic/queued bubbles.
  useEffect(() => {
    if (!serverMessages) return;
    setMessages((prev) => mergeMessages(prev, serverMessages.map(toUi)));
  }, [serverMessages]);

  // ============================================================
  // WebSocket subscriptions (re-bind whenever connection toggles)
  // ============================================================
  useEffect(() => {
    const client = wsRef.current;
    if (!client) return;

    const offChat = client.onChatMessage((m) => {
      setMessages((prev) => mergeMessages(prev, [toUi(m)]));
    });
    const offDelivery = client.onDeliveryReceipt((e) => {
      setMessages((prev) => prev.map((msg) =>
        (e.id != null && msg.id === e.id) || (e.clientId && msg.clientId === e.clientId)
          ? { ...msg, status: bumpStatus(msg.status, "delivered") }
          : msg
      ));
    });
    const offRead = client.onReadReceipt((e) => {
      const ids = new Set(e.messageIds);
      setMessages((prev) => prev.map((msg) =>
        msg.id != null && ids.has(msg.id) ? { ...msg, status: "read" } : msg
      ));
    });
    const offTyping = client.onTyping((e) => {
      if (e.senderId === currentUserId) return; // never show our own typing
      setTyping(e.typing);
    });
    const offPresence = client.onPresence(setPresence);
    const offReaction = client.onReactionUpdate((e) => {
      setMessages((prev) => prev.map((msg) =>
        msg.id === e.messageId ? { ...msg, reactions: e.reactions || {} } : msg
      ));
    });

    return () => {
      offChat(); offDelivery(); offRead(); offTyping(); offPresence(); offReaction();
    };
  }, [wsRef, currentUserId, isConnected]);

  // ============================================================
  // Mark-as-read mutation
  // ============================================================
  const markReadMutation = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/rides/${rideId}/messages/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
  });

  const fireReadReceipt = useCallback(() => {
    // Only mark if we have unread messages addressed to us.
    const hasUnread = messages.some((m) => m.receiverId === currentUserId && m.status !== "read");
    if (!hasUnread) return;
    markReadMutation.mutate();
    sendReadReceipt();
  }, [messages, currentUserId, markReadMutation, sendReadReceipt]);

  // Mark-as-read triggers: open, visibility change, new incoming message while open.
  useEffect(() => {
    if (!isOpen) return;
    fireReadReceipt();
    const onVis = () => { if (document.visibilityState === "visible") fireReadReceipt(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isOpen, fireReadReceipt]);

  // Whenever messages array changes (new incoming), and chat is open + tab visible, mark read.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const handle = setTimeout(() => fireReadReceipt(), 200);
    return () => clearTimeout(handle);
  }, [messages.length, isOpen, fireReadReceipt]);

  // ============================================================
  // Smart auto-scroll
  // ============================================================
  const updateScrollPosition = useCallback(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom < SCROLL_BOTTOM_THRESHOLD_PX;
    setIsAtBottom(atBottom);
    if (atBottom) setHasUnseenBelow(false);
  }, []);

  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!el) return;
    el.addEventListener("scroll", updateScrollPosition, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollPosition);
  }, [updateScrollPosition, isOpen]);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
    setHasUnseenBelow(false);
  }, []);

  // Whenever a message is added: if user was near the bottom, scroll. Otherwise mark "unseen below".
  const lastMessageKey = messages.length > 0 ? `${messages[messages.length - 1].id ?? messages[messages.length - 1].clientId ?? messages.length}` : "";
  useEffect(() => {
    if (!isOpen) return;
    if (isAtBottom) {
      // small timeout so the new bubble renders first
      const h = setTimeout(() => scrollToBottom(true), 30);
      return () => clearTimeout(h);
    }
    // there's a new message but user is scrolled up
    const last = messages[messages.length - 1];
    if (last && last.senderId !== currentUserId) {
      setHasUnseenBelow(true);
    }
  }, [lastMessageKey, isOpen, isAtBottom, scrollToBottom, currentUserId, messages]);

  // On open, scroll to bottom immediately (no smooth).
  useEffect(() => {
    if (isOpen) {
      const h = setTimeout(() => scrollToBottom(false), 50);
      return () => clearTimeout(h);
    }
  }, [isOpen, scrollToBottom]);

  // ============================================================
  // Send + typing
  // ============================================================
  const handleSendText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const clientId = sendChatMessage(otherUserId, trimmed);
    // Optimistic bubble:
    setMessages((prev) => mergeMessages(prev, [{
      clientId: clientId ?? `local-${Date.now()}`,
      rideId,
      senderId: currentUserId,
      receiverId: otherUserId,
      message: trimmed,
      messageType: "text",
      status: isConnected ? "sending" : "failed",
      reactions: {},
      createdAt: new Date().toISOString(),
    }]));
    setInputMessage("");
    setIsAtBottom(true);
    setTimeout(() => scrollToBottom(true), 30);
    // stop typing notification immediately on send
    sendTyping(false);
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
    lastTypingSentAtRef.current = 0;
  }, [sendChatMessage, otherUserId, rideId, currentUserId, isConnected, scrollToBottom, sendTyping]);

  const handleSendLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const clientId = sendLocationMessage(otherUserId, latitude, longitude, "📍 Shared location");
        setMessages((prev) => mergeMessages(prev, [{
          clientId: clientId ?? `local-${Date.now()}`,
          rideId,
          senderId: currentUserId,
          receiverId: otherUserId,
          message: "📍 Shared location",
          messageType: "location",
          locationLat: latitude,
          locationLng: longitude,
          status: isConnected ? "sending" : "failed",
          reactions: {},
          createdAt: new Date().toISOString(),
        }]));
      },
      () => { /* permission denied or unavailable - silent */ },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [sendLocationMessage, otherUserId, rideId, currentUserId, isConnected]);

  const handleInputChange = useCallback((value: string) => {
    setInputMessage(value);
    // Throttle typing notifications: send "typing" no more than once per 1.5s.
    const now = Date.now();
    if (value.length > 0 && now - lastTypingSentAtRef.current > 1500) {
      sendTyping(true);
      lastTypingSentAtRef.current = now;
    }
    // Schedule a "typing_stop" if the user pauses.
    if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
    typingStopTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
      lastTypingSentAtRef.current = 0;
    }, TYPING_STOP_MS);
  }, [sendTyping]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText(inputMessage);
    }
  };

  // ============================================================
  // Reactions
  // ============================================================
  const handleReact = useCallback((messageId: number, emoji: string) => {
    // Optimistic UI: toggle the user's own reaction immediately.
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const next = { ...(m.reactions || {}) };
      const arr = next[emoji] ? [...next[emoji]] : [];
      const idx = arr.indexOf(currentUserId);
      let removed = false;
      if (idx >= 0) {
        arr.splice(idx, 1);
        removed = true;
      } else {
        arr.push(currentUserId);
      }
      if (arr.length === 0) delete next[emoji]; else next[emoji] = arr;
      sendReaction(messageId, emoji, removed);
      return { ...m, reactions: next };
    }));
    setReactionTargetId(null);
  }, [currentUserId, sendReaction]);

  // ============================================================
  // Group messages by day & by consecutive sender
  // ============================================================
  const grouped = useMemo(() => groupMessages(messages), [messages]);

  // ============================================================
  // Render
  // ============================================================
  if (!isOpen) return null;

  return (
    <Card className="border-none shadow-2xl backdrop-blur-md bg-background/95">
      <CardHeader className="pb-2 pt-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative">
            <MessageSquare className="h-5 w-5 text-primary" />
            {presence.online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 ring-2 ring-background" />
            )}
          </div>
          <div className="min-w-0">
            <CardTitle className="text-sm leading-tight">Chat</CardTitle>
            <p className="text-[10px] text-muted-foreground leading-tight" data-testid="text-presence">
              {presence.online ? "Online" : formatLastSeen(presence.lastSeen)}
              {!isConnected && <span className="text-amber-500 ml-1">• reconnecting…</span>}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} data-testid="button-close-chat">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="p-3 pt-1 relative">
        <div className="relative">
          <ScrollArea className="h-72 pr-3" ref={scrollAreaRef as any}>
            <div className="space-y-1.5">
              {grouped.length === 0 ? (
                <p className="text-center text-muted-foreground text-xs py-12">
                  No messages yet. Start the conversation!
                </p>
              ) : (
                grouped.map((day) => (
                  <div key={day.dateKey}>
                    <div className="flex justify-center my-2 sticky top-0 z-10">
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted/80 backdrop-blur px-2 py-0.5 rounded-full">
                        {day.label}
                      </span>
                    </div>
                    {day.groups.map((group, gIdx) => (
                      <div key={`${day.dateKey}-${gIdx}`} className="mb-2">
                        {group.messages.map((msg, mIdx) => {
                          const isMine = msg.senderId === currentUserId;
                          const isLastInGroup = mIdx === group.messages.length - 1;
                          return (
                            <MessageBubble
                              key={msg.id ?? msg.clientId ?? `${gIdx}-${mIdx}`}
                              msg={msg}
                              isMine={isMine}
                              showTimestamp={isLastInGroup}
                              onReact={(emoji) => msg.id && handleReact(msg.id, emoji)}
                              onRetry={() => msg.clientId && resendChatMessage(msg.clientId)}
                              isReactionOpen={reactionTargetId === msg.id}
                              setReactionOpen={(open) => setReactionTargetId(open && msg.id ? msg.id : null)}
                              currentUserId={currentUserId}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))
              )}
              <AnimatePresence>
                {typing && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-muted rounded-2xl px-3 py-2 inline-flex gap-1 items-center">
                      <TypingDot delay={0} />
                      <TypingDot delay={150} />
                      <TypingDot delay={300} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={bottomAnchorRef} />
            </div>
          </ScrollArea>

          <AnimatePresence>
            {hasUnseenBelow && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={() => scrollToBottom(true)}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs shadow-lg flex items-center gap-1"
                data-testid="button-jump-to-latest"
              >
                <ChevronDown className="h-3 w-3" /> New messages
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Quick reply chips */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-thin">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              onClick={() => handleSendText(q)}
              disabled={!isConnected}
              className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-border bg-background hover:bg-muted disabled:opacity-50 transition"
              data-testid={`button-quick-reply-${q.toLowerCase().replace(/[^a-z]+/g, '-')}`}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="flex gap-1.5 mt-2 items-end">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSendLocation}
            disabled={!isConnected}
            title="Share my location"
            data-testid="button-share-location"
          >
            <MapPin className="h-4 w-4" />
          </Button>
          <Input
            value={inputMessage}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            onBlur={() => sendTyping(false)}
            placeholder="Type a message..."
            data-testid="input-chat-message"
            className="h-9"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => handleSendText(inputMessage)}
            disabled={!inputMessage.trim()}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Subcomponents
// ============================================================

interface MessageBubbleProps {
  msg: UiMessage;
  isMine: boolean;
  showTimestamp: boolean;
  onReact: (emoji: string) => void;
  onRetry: () => void;
  isReactionOpen: boolean;
  setReactionOpen: (open: boolean) => void;
  currentUserId: string;
}

function MessageBubble({ msg, isMine, showTimestamp, onReact, onRetry, isReactionOpen, setReactionOpen }: MessageBubbleProps) {
  const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn("flex group", isMine ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex flex-col max-w-[80%]", isMine ? "items-end" : "items-start")}>
        <Popover open={isReactionOpen} onOpenChange={setReactionOpen}>
          <PopoverTrigger asChild>
            <div
              onContextMenu={(e) => { e.preventDefault(); if (msg.id) setReactionOpen(true); }}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm shadow-sm cursor-pointer relative",
                isMine
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md",
                msg.status === "failed" && "opacity-70 ring-1 ring-destructive",
              )}
              data-testid={`chat-message-${msg.id ?? msg.clientId}`}
            >
              {msg.messageType === "location" && msg.locationLat != null && msg.locationLng != null ? (
                <a
                  href={`https://www.google.com/maps?q=${msg.locationLat},${msg.locationLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 underline decoration-dotted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapPin className="h-4 w-4" />
                  <div className="text-xs leading-tight">
                    <div className="font-medium">Shared location</div>
                    <div className="opacity-80">{Number(msg.locationLat).toFixed(5)}, {Number(msg.locationLng).toFixed(5)}</div>
                    <div className="opacity-80">Tap to open in Maps</div>
                  </div>
                </a>
              ) : (
                <p className="whitespace-pre-wrap break-words">{msg.message}</p>
              )}
              {/* Hover/long-press emoji button */}
              {msg.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); setReactionOpen(true); }}
                  className={cn(
                    "absolute -top-2 opacity-0 group-hover:opacity-100 transition bg-background border rounded-full p-1 shadow",
                    isMine ? "-left-2" : "-right-2",
                  )}
                  data-testid={`button-react-${msg.id}`}
                  aria-label="React"
                >
                  <Smile className="h-3 w-3" />
                </button>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1.5 flex gap-1" side="top" align={isMine ? "end" : "start"}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className="text-lg hover:scale-125 transition-transform px-1"
                data-testid={`button-emoji-${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Reactions strip */}
        {reactionEntries.length > 0 && (
          <div className={cn("flex gap-1 mt-0.5 flex-wrap", isMine ? "justify-end" : "justify-start")}>
            {reactionEntries.map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className="text-[11px] bg-muted/80 hover:bg-muted border border-border rounded-full px-1.5 py-0.5 flex items-center gap-1"
                data-testid={`reaction-${msg.id}-${emoji}`}
              >
                <span>{emoji}</span>
                <span className="text-muted-foreground">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp + status row (only at end of group) */}
        {showTimestamp && (
          <div className={cn(
            "flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground",
            isMine ? "justify-end" : "justify-start"
          )}>
            <span>{formatTime(msg.createdAt)}</span>
            {isMine && (
              <>
                <StatusIcon status={msg.status} />
                {msg.status === "failed" && (
                  <button
                    onClick={onRetry}
                    className="text-destructive hover:underline flex items-center gap-0.5"
                    data-testid={`button-retry-${msg.clientId}`}
                  >
                    <RotateCw className="h-3 w-3" /> Retry
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "sending") return <Clock className="h-3 w-3 opacity-60" data-testid="icon-status-sending" />;
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-destructive" data-testid="icon-status-failed" />;
  if (status === "sent") return <Check className="h-3 w-3 opacity-60" data-testid="icon-status-sent" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 opacity-60" data-testid="icon-status-delivered" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-sky-500" data-testid="icon-status-read" />;
  return null;
}

function TypingDot({ delay }: { delay: number }) {
  return (
    <motion.span
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 0.9, repeat: Infinity, delay: delay / 1000 }}
      className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground"
    />
  );
}

// ============================================================
// Pure helpers
// ============================================================

/**
 * Merge a list of incoming UiMessages into the existing list.
 *  - If incoming has the same id  → replace.
 *  - Else if incoming has the same clientId → replace (reconciles optimistic bubble with server row).
 *  - Else append.
 *  - Status is bumped monotonically (never goes backwards).
 *  - Result is sorted by createdAt ascending.
 */
function mergeMessages(existing: UiMessage[], incoming: UiMessage[]): UiMessage[] {
  const byId = new Map<number, UiMessage>();
  const byClient = new Map<string, UiMessage>();
  const result: UiMessage[] = [];

  const upsert = (msg: UiMessage) => {
    if (msg.id != null && byId.has(msg.id)) {
      const idx = result.indexOf(byId.get(msg.id)!);
      const merged = mergeOne(byId.get(msg.id)!, msg);
      result[idx] = merged;
      byId.set(merged.id!, merged);
      if (merged.clientId) byClient.set(merged.clientId, merged);
      return;
    }
    if (msg.clientId && byClient.has(msg.clientId)) {
      const idx = result.indexOf(byClient.get(msg.clientId)!);
      const merged = mergeOne(byClient.get(msg.clientId)!, msg);
      result[idx] = merged;
      if (merged.id != null) byId.set(merged.id, merged);
      byClient.set(merged.clientId!, merged);
      return;
    }
    result.push(msg);
    if (msg.id != null) byId.set(msg.id, msg);
    if (msg.clientId) byClient.set(msg.clientId, msg);
  };

  existing.forEach(upsert);
  incoming.forEach(upsert);

  return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function mergeOne(prev: UiMessage, next: UiMessage): UiMessage {
  // Always prefer the higher status (read > delivered > sent > sending/failed).
  const status = statusRank(next.status) >= statusRank(prev.status) ? next.status : prev.status;
  return {
    ...prev,
    ...next,
    id: next.id ?? prev.id,
    clientId: next.clientId ?? prev.clientId,
    status,
    reactions: next.reactions && Object.keys(next.reactions).length > 0 ? next.reactions : prev.reactions,
    locationLat: next.locationLat ?? prev.locationLat,
    locationLng: next.locationLng ?? prev.locationLng,
    createdAt: prev.createdAt || next.createdAt,
  };
}

function bumpStatus(prev: Status, next: Status): Status {
  return statusRank(next) > statusRank(prev) ? next : prev;
}

interface DayGroup {
  dateKey: string;
  label: string;
  groups: { senderId: string; messages: UiMessage[] }[];
}

function groupMessages(messages: UiMessage[]): DayGroup[] {
  const days: DayGroup[] = [];
  let currentDay: DayGroup | null = null;
  let currentSenderGroup: { senderId: string; messages: UiMessage[] } | null = null;

  for (const m of messages) {
    const dateKey = dayBucket(m.createdAt);
    if (!currentDay || currentDay.dateKey !== dateKey) {
      currentDay = { dateKey, label: formatDayLabel(m.createdAt), groups: [] };
      days.push(currentDay);
      currentSenderGroup = null;
    }
    if (!currentSenderGroup || currentSenderGroup.senderId !== m.senderId) {
      currentSenderGroup = { senderId: m.senderId, messages: [] };
      currentDay.groups.push(currentSenderGroup);
    }
    currentSenderGroup.messages.push(m);
  }
  return days;
}

export default Chat;
