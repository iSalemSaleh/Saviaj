/**
 * Chat — 10/10 in-app messaging panel.
 *
 * Built on top of WebSocketRideClient (real-time) with TanStack Query as a 30s safety-net poll.
 *
 * Tier 1+2 (already shipped):
 *  - Optimistic send + per-message status icons + retry
 *  - Real-time WebSocket messages, typing, presence, delivery + read receipts, reactions
 *  - Smart auto-scroll, mark-as-read on open/visibility, day separators, sender grouping
 *  - Quick replies, location share, long-press emoji reactions
 *
 * Tier 3 (media):
 *  - Image attach (file input + camera) with preview + upload progress
 *  - Voice recorder (hold-to-record button, live timer)
 *  - File attach with download bubble
 *  - Image lightbox; audio bubble with play/pause
 *
 * Tier 4 (push + sound):
 *  - In-app sound + sonner toast on incoming messages when window is blurred / chat is closed
 *  - Server pushes silent FCM when receiver is fully offline (handled in pushClient)
 *
 * Tier 5 (reply / edit / delete / search / translate / pin):
 *  - Reply: bubble menu → quoted preview above input → quoted bubble in sent message
 *  - Edit / Delete: long-press own bubble (≤ 5 min after send), edited tag, "Message deleted" tombstone
 *  - Per-chat search input (filter + highlight)
 *  - Pinned message banner at the top (single-pin per ride, rider/driver only)
 *  - Translate button per foreign-language bubble using Azure Translator (server-side, gated)
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast as sonnerToast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Send, MessageSquare, X, Check, CheckCheck, Clock, AlertCircle, MapPin, Smile,
  ChevronDown, RotateCw, Image as ImageIcon, Paperclip, Mic, Search, Pin, PinOff,
  Reply, Pencil, Trash2, Languages, Play, Pause, Download, MoreVertical, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { uploadChatMedia } from "@/lib/chatMediaUpload";
import { AudioRecorder } from "@/lib/audioRecorder";
import type {
  WebSocketRideClient,
  ChatMessage as WsChatMessage,
  PresenceEvent,
} from "@/lib/WebSocketRideClient";

// ============================================================
// Types
// ============================================================

type Status = "sending" | "sent" | "delivered" | "read" | "failed";
type MsgKind = "text" | "location" | "image" | "voice" | "file";

interface UiMessage {
  id?: number;
  clientId?: string;
  rideId: number;
  senderId: string;
  receiverId: string;
  message: string;
  messageType: MsgKind;
  locationLat?: number | null;
  locationLng?: number | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaName?: string | null;
  mediaSizeBytes?: number | null;
  mediaDurationMs?: number | null;
  mediaThumbnailUrl?: string | null;
  replyToMessageId?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  status: Status;
  reactions: Record<string, string[]>;
  createdAt: string;
  /** Cached translation (per-bubble, current target lang) — UI only. */
  translation?: { text: string; lang: string } | null;
}

interface ChatProps {
  rideId: number;
  currentUserId: string;
  otherUserId: string;
  /** Hook-provided WebSocket client ref. May be null until the socket connects. */
  wsRef: React.MutableRefObject<WebSocketRideClient | null>;
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

interface IntegrationsStatus {
  media: boolean;
  push: boolean;
  translate: boolean;
}

interface ChatPrefs {
  preferredLanguage: string;
  sendReadReceipts: boolean;
}

// ============================================================
// Constants
// ============================================================

const QUICK_REPLIES = ["On my way", "I'm here", "Running 2 min late", "Where are you?", "Thank you!"];
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "😢"];
const SCROLL_BOTTOM_THRESHOLD_PX = 80;
const TYPING_STOP_MS = 2500;
const EDIT_WINDOW_MS = 5 * 60 * 1000;
const PING_SOUND_DATA_URI =
  "data:audio/wav;base64,UklGRpQGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YXAGAAAAAAQAvgEvA84DcQTYBPgErQT4A9gCcQHO//L9Av0M/I/7w/vR/H7+kQAGA70F/AdsCRYK6gnRCO0GpwQYAlj/p/wT+oH3bvX48zPzL/Pz81b1bvfp+Xj8B/9vAY8DfgUMB+0H7geWBskEAQI4/wH9PfsR+vT5pPqd+yj9CP+VAJ4BWAJsArYBJgCJ/iX9Av24/Q==";

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
    messageType: (msg.messageType as MsgKind) ?? "text",
    locationLat: msg.locationLat != null ? Number(msg.locationLat) : null,
    locationLng: msg.locationLng != null ? Number(msg.locationLng) : null,
    mediaUrl: msg.mediaUrl ?? null,
    mediaMimeType: msg.mediaMimeType ?? null,
    mediaName: msg.mediaName ?? null,
    mediaSizeBytes: msg.mediaSizeBytes ?? null,
    mediaDurationMs: msg.mediaDurationMs ?? null,
    mediaThumbnailUrl: msg.mediaThumbnailUrl ?? null,
    replyToMessageId: msg.replyToMessageId ?? null,
    editedAt: msg.editedAt ? new Date(msg.editedAt).toISOString() : null,
    deletedAt: msg.deletedAt ? new Date(msg.deletedAt).toISOString() : null,
    pinnedAt: msg.pinnedAt ? new Date(msg.pinnedAt).toISOString() : null,
    status: (msg.status as Status) ?? (msg.read ? "read" : "sent"),
    reactions: (msg.reactions as Record<string, string[]>) ?? {},
    createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
  };
}

const statusRank = (s: Status) => ({ sending: 0, failed: 0, sent: 1, delivered: 2, read: 3 }[s] ?? 0);
const dayBucket = (iso: string) => { const d = new Date(iso); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10); };
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function formatLastSeen(lastSeen: number | string | null | undefined): string {
  if (!lastSeen) return "Offline";
  const ts = typeof lastSeen === "string" ? new Date(lastSeen).getTime() : lastSeen;
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (diffMin < 1) return "Last seen just now";
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Last seen ${diffH}h ago`;
  return `Last seen ${Math.floor(diffH / 24)}d ago`;
}
function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function formatDurationMs(ms?: number | null): string {
  if (!ms || ms <= 0) return "0:00";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  return text.split(re).map((part, i) =>
    re.test(part) ? <mark key={i} className="bg-yellow-300/60 dark:bg-yellow-500/40 text-inherit rounded px-0.5">{part}</mark> : <span key={i}>{part}</span>
  );
}

/** Defensive: only allow http(s) media URLs. Anything else (javascript:, data:, etc.) returns "#". */
function safeMediaUrl(url?: string | null): string {
  if (!url) return "#";
  return /^https?:\/\//i.test(url) ? url : "#";
}

function previewFor(m: UiMessage): string {
  if (m.deletedAt) return "Message deleted";
  if (m.messageType === "image") return "📷 Photo";
  if (m.messageType === "voice") return "🎤 Voice note";
  if (m.messageType === "file") return `📎 ${m.mediaName ?? "Attachment"}`;
  if (m.messageType === "location") return "📍 Location";
  return m.message;
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
  // Tier 5 state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replyTo, setReplyTo] = useState<UiMessage | null>(null);
  const [editing, setEditing] = useState<UiMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [pinnedId, setPinnedId] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Tier 3 state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();

  // ============================================================
  // Integrations status (gated features) + chat prefs
  // ============================================================
  const { data: integrations } = useQuery<IntegrationsStatus>({
    queryKey: ["/api/chat/integrations"],
    staleTime: 5 * 60_000,
  });
  const { data: prefs } = useQuery<ChatPrefs>({
    queryKey: ["/api/users/me/chat-prefs"],
    staleTime: 5 * 60_000,
  });

  // ============================================================
  // Server fetch (initial + 30s safety-net poll while open)
  // ============================================================
  const { data: serverMessages } = useQuery<any[]>({
    queryKey: [`/api/rides/${rideId}/messages`],
    enabled: isOpen && rideId > 0,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
  const { data: pinnedMsg } = useQuery<UiMessage | null>({
    queryKey: [`/api/rides/${rideId}/messages/pinned`],
    enabled: isOpen && rideId > 0,
    select: (raw: any) => (raw && raw.id ? toUi(raw) : null),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!serverMessages) return;
    setMessages((prev) => mergeMessages(prev, serverMessages.map(toUi)));
  }, [serverMessages]);

  useEffect(() => {
    setPinnedId(pinnedMsg?.id ?? null);
  }, [pinnedMsg]);

  // ============================================================
  // WebSocket subscriptions (re-bind on connection toggle)
  // ============================================================
  useEffect(() => {
    const client = wsRef.current;
    if (!client) return;

    const offChat = client.onChatMessage((m) => {
      const ui = toUi(m);
      setMessages((prev) => mergeMessages(prev, [ui]));
      // Sound + toast when window is blurred or chat is closed and the message is FROM the other party
      if (ui.senderId !== currentUserId) {
        const blurred = typeof document !== "undefined" && document.visibilityState !== "visible";
        if (blurred || !isOpen) {
          try { new Audio(PING_SOUND_DATA_URI).play().catch(() => {}); } catch { /* ignore */ }
          sonnerToast(`${previewFor(ui)}`, { description: "New message", duration: 3500 });
        }
      }
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
      setMessages((prev) => prev.map((msg) => msg.id != null && ids.has(msg.id) ? { ...msg, status: "read" } : msg));
    });
    const offTyping = client.onTyping((e) => { if (e.senderId !== currentUserId) setTyping(e.typing); });
    const offPresence = client.onPresence(setPresence);
    const offReaction = client.onReactionUpdate((e) => {
      setMessages((prev) => prev.map((msg) => msg.id === e.messageId ? { ...msg, reactions: e.reactions || {} } : msg));
    });
    const offEdited = client.onMessageEdited((e) => {
      setMessages((prev) => prev.map((msg) => msg.id === e.id
        ? { ...msg, message: e.message, editedAt: new Date(e.editedAt as any).toISOString(), translation: null }
        : msg));
    });
    const offDeleted = client.onMessageDeleted((e) => {
      setMessages((prev) => prev.map((msg) => msg.id === e.id
        ? { ...msg, deletedAt: new Date(e.deletedAt as any).toISOString(), message: "", translation: null, mediaUrl: null }
        : msg));
      setPinnedId((prev) => (prev === e.id ? null : prev));
    });
    const offPinned = client.onPinned((e) => { setPinnedId(e.messageId); });

    return () => {
      offChat(); offDelivery(); offRead(); offTyping(); offPresence(); offReaction();
      offEdited(); offDeleted(); offPinned();
    };
  }, [wsRef, currentUserId, isConnected, isOpen]);

  // ============================================================
  // Mark-as-read
  // ============================================================
  const markReadMutation = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/rides/${rideId}/messages/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] }),
  });
  const fireReadReceipt = useCallback(() => {
    const hasUnread = messages.some((m) => m.receiverId === currentUserId && m.status !== "read");
    if (!hasUnread) return;
    markReadMutation.mutate();
    sendReadReceipt();
  }, [messages, currentUserId, markReadMutation, sendReadReceipt]);

  useEffect(() => {
    if (!isOpen) return;
    fireReadReceipt();
    const onVis = () => { if (document.visibilityState === "visible") fireReadReceipt(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isOpen, fireReadReceipt]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const h = setTimeout(() => fireReadReceipt(), 200);
    return () => clearTimeout(h);
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

  const lastMessageKey = messages.length > 0 ? `${messages[messages.length - 1].id ?? messages[messages.length - 1].clientId ?? messages.length}` : "";
  useEffect(() => {
    if (!isOpen) return;
    if (isAtBottom) {
      const h = setTimeout(() => scrollToBottom(true), 30);
      return () => clearTimeout(h);
    }
    const last = messages[messages.length - 1];
    if (last && last.senderId !== currentUserId) setHasUnseenBelow(true);
  }, [lastMessageKey, isOpen, isAtBottom, scrollToBottom, currentUserId, messages]);

  useEffect(() => {
    if (isOpen) {
      const h = setTimeout(() => scrollToBottom(false), 50);
      return () => clearTimeout(h);
    }
  }, [isOpen, scrollToBottom]);

  // ============================================================
  // Send (text / location / media / reply)
  // ============================================================
  const handleSendText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    let clientId: string | undefined;
    if (replyTo?.id) {
      clientId = wsRef.current?.sendReply(otherUserId, trimmed, replyTo.id);
    } else {
      clientId = sendChatMessage(otherUserId, trimmed);
    }
    setMessages((prev) => mergeMessages(prev, [{
      clientId: clientId ?? `local-${Date.now()}`,
      rideId,
      senderId: currentUserId,
      receiverId: otherUserId,
      message: trimmed,
      messageType: "text",
      replyToMessageId: replyTo?.id ?? null,
      status: isConnected ? "sending" : "failed",
      reactions: {},
      createdAt: new Date().toISOString(),
    }]));
    setInputMessage("");
    setReplyTo(null);
    setIsAtBottom(true);
    setTimeout(() => scrollToBottom(true), 30);
    sendTyping(false);
    if (typingStopTimeoutRef.current) { clearTimeout(typingStopTimeoutRef.current); typingStopTimeoutRef.current = null; }
    lastTypingSentAtRef.current = 0;
  }, [sendChatMessage, otherUserId, rideId, currentUserId, isConnected, scrollToBottom, sendTyping, wsRef, replyTo]);

  const handleSendLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const clientId = sendLocationMessage(otherUserId, latitude, longitude, "📍 Shared location");
        setMessages((prev) => mergeMessages(prev, [{
          clientId: clientId ?? `local-${Date.now()}`,
          rideId, senderId: currentUserId, receiverId: otherUserId,
          message: "📍 Shared location", messageType: "location",
          locationLat: latitude, locationLng: longitude,
          status: isConnected ? "sending" : "failed", reactions: {},
          createdAt: new Date().toISOString(),
        }]));
      },
      () => { /* permission denied */ },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [sendLocationMessage, otherUserId, rideId, currentUserId, isConnected]);

  const sendMediaFile = useCallback(async (file: File, kind: "image" | "voice" | "file", durationMs?: number) => {
    if (!integrations?.media) {
      sonnerToast.error("Media uploads not configured");
      return;
    }
    setUploadProgress(0);
    try {
      const upload = await uploadChatMedia({
        rideId,
        blob: file,
        fileName: file.name,
        durationMs,
        onProgress: (p) => setUploadProgress(p),
      });
      const clientId = wsRef.current?.sendMediaMessage({
        receiverId: otherUserId,
        kind,
        mediaUrl: upload.readUrl,
        mediaMimeType: upload.mimeType,
        mediaName: file.name,
        mediaSizeBytes: upload.sizeBytes,
        mediaDurationMs: upload.durationMs,
        replyToMessageId: replyTo?.id ?? undefined,
      });
      setMessages((prev) => mergeMessages(prev, [{
        clientId: clientId ?? `local-${Date.now()}`,
        rideId, senderId: currentUserId, receiverId: otherUserId,
        message: "", messageType: kind,
        mediaUrl: upload.readUrl, mediaMimeType: upload.mimeType,
        mediaName: file.name, mediaSizeBytes: upload.sizeBytes, mediaDurationMs: upload.durationMs,
        replyToMessageId: replyTo?.id ?? null,
        status: isConnected ? "sending" : "failed", reactions: {},
        createdAt: new Date().toISOString(),
      }]));
      setReplyTo(null);
    } catch (err: any) {
      sonnerToast.error(err?.message || "Upload failed");
    } finally {
      setUploadProgress(null);
    }
  }, [integrations, rideId, otherUserId, currentUserId, isConnected, wsRef, replyTo]);

  // Voice recording — hold-to-record
  const startRecording = useCallback(async () => {
    if (recording || !integrations?.media) {
      if (!integrations?.media) sonnerToast.error("Voice notes not configured");
      return;
    }
    try {
      const rec = new AudioRecorder();
      await rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      sonnerToast.error(err?.message || "Microphone unavailable");
    }
  }, [recording, integrations]);

  const stopRecording = useCallback(async (cancel = false) => {
    if (!recording) return;
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    setRecordSeconds(0);
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) return;
    if (cancel) { rec.cancel(); return; }
    const out = await rec.stop();
    if (!out) return;
    const ext = out.mimeType.includes("webm") ? "webm" : out.mimeType.includes("mp4") ? "m4a" : "ogg";
    const file = new File([out.blob], `voice-${Date.now()}.${ext}`, { type: out.mimeType });
    await sendMediaFile(file, "voice", out.durationMs);
  }, [recording, sendMediaFile]);

  // ============================================================
  // Edit / Delete / Pin / Translate (REST)
  // ============================================================
  const editMutation = useMutation({
    mutationFn: async (vars: { id: number; message: string }) =>
      apiRequest("PATCH", `/api/rides/${rideId}/messages/${vars.id}`, { message: vars.message }),
    onSuccess: (_data, vars) => {
      setMessages((prev) => prev.map((m) => m.id === vars.id ? { ...m, message: vars.message, editedAt: new Date().toISOString(), translation: null } : m));
      setEditing(null);
    },
    onError: (err: any) => sonnerToast.error(err?.message || "Edit failed"),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/rides/${rideId}/messages/${id}`),
    onSuccess: (_data, id) => {
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, deletedAt: new Date().toISOString(), message: "", translation: null, mediaUrl: null } : m));
      setPinnedId((prev) => (prev === id ? null : prev));
    },
    onError: (err: any) => sonnerToast.error(err?.message || "Delete failed"),
  });
  const pinMutation = useMutation({
    mutationFn: async (vars: { id: number | null }) =>
      apiRequest("POST", `/api/rides/${rideId}/messages/${vars.id ?? "clear"}/pin`, { pin: vars.id !== null }),
    onSuccess: (_d, vars) => {
      setPinnedId(vars.id);
      queryClient.invalidateQueries({ queryKey: [`/api/rides/${rideId}/messages/pinned`] });
    },
    onError: (err: any) => sonnerToast.error(err?.message || "Pin failed"),
  });

  const translateMutation = useMutation({
    mutationFn: async (id: number) => {
      const target = prefs?.preferredLanguage || "en";
      const res = await apiRequest("POST", `/api/messages/${id}/translate`, { target });
      return res.json() as Promise<{ text: string; lang: string }>;
    },
    onSuccess: (data, id) => {
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, translation: data } : m));
    },
    onError: (err: any) => sonnerToast.error(err?.message || "Translate failed"),
  });

  // ============================================================
  // Typing input
  // ============================================================
  const handleInputChange = useCallback((value: string) => {
    setInputMessage(value);
    const now = Date.now();
    if (value.length > 0 && now - lastTypingSentAtRef.current > 1500) {
      sendTyping(true); lastTypingSentAtRef.current = now;
    }
    if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
    typingStopTimeoutRef.current = setTimeout(() => { sendTyping(false); lastTypingSentAtRef.current = 0; }, TYPING_STOP_MS);
  }, [sendTyping]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editing && editing.id) {
        editMutation.mutate({ id: editing.id, message: editText.trim() });
      } else {
        handleSendText(inputMessage);
      }
    }
  };

  // Reactions
  const handleReact = useCallback((messageId: number, emoji: string) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const next = { ...(m.reactions || {}) };
      const arr = next[emoji] ? [...next[emoji]] : [];
      const idx = arr.indexOf(currentUserId);
      let removed = false;
      if (idx >= 0) { arr.splice(idx, 1); removed = true; } else { arr.push(currentUserId); }
      if (arr.length === 0) delete next[emoji]; else next[emoji] = arr;
      sendReaction(messageId, emoji, removed);
      return { ...m, reactions: next };
    }));
    setReactionTargetId(null);
  }, [currentUserId, sendReaction]);

  // ============================================================
  // Derived: filter by search, group by day+sender, build pinned ref
  // ============================================================
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) =>
      !m.deletedAt && (
        m.message.toLowerCase().includes(q) ||
        (m.mediaName?.toLowerCase().includes(q) ?? false)
      )
    );
  }, [messages, searchQuery]);

  const grouped = useMemo(() => groupMessages(filteredMessages), [filteredMessages]);
  const pinnedMessage = useMemo(
    () => (pinnedId != null ? messages.find((m) => m.id === pinnedId) ?? pinnedMsg ?? null : null),
    [pinnedId, messages, pinnedMsg],
  );
  const messagesById = useMemo(() => {
    const map = new Map<number, UiMessage>();
    messages.forEach((m) => { if (m.id != null) map.set(m.id, m); });
    return map;
  }, [messages]);

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
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSearchOpen((s) => !s)} data-testid="button-toggle-search" title="Search">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} data-testid="button-close-chat">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {searchOpen && (
        <div className="px-3 pb-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            className="h-8 text-xs"
            autoFocus
            data-testid="input-chat-search"
          />
        </div>
      )}

      {pinnedMessage && (
        <div className="px-3 pb-2">
          <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/30 px-2.5 py-1.5" data-testid="banner-pinned">
            <Pin className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[11px] text-foreground/80 truncate flex-1">
              <span className="font-medium">Pinned: </span>
              {previewFor(pinnedMessage)}
            </div>
            <button
              className="text-amber-700 hover:text-amber-900 text-[11px]"
              onClick={() => pinMutation.mutate({ id: null })}
              data-testid="button-unpin"
              title="Unpin"
            >
              <PinOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <CardContent className="p-3 pt-1 relative">
        <div className="relative">
          <ScrollArea className="h-72 pr-3" ref={scrollAreaRef as any}>
            <div className="space-y-1.5">
              {grouped.length === 0 ? (
                <p className="text-center text-muted-foreground text-xs py-12">
                  {searchQuery ? "No messages match your search." : "No messages yet. Start the conversation!"}
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
                          const quoted = msg.replyToMessageId ? messagesById.get(msg.replyToMessageId) ?? null : null;
                          return (
                            <MessageBubble
                              key={msg.id ?? msg.clientId ?? `${gIdx}-${mIdx}`}
                              msg={msg}
                              isMine={isMine}
                              showTimestamp={isLastInGroup}
                              quoted={quoted}
                              searchQuery={searchQuery}
                              integrations={integrations}
                              onReact={(emoji) => msg.id && handleReact(msg.id, emoji)}
                              onRetry={() => msg.clientId && resendChatMessage(msg.clientId)}
                              onReply={() => setReplyTo(msg)}
                              onPin={() => msg.id && pinMutation.mutate({ id: msg.id === pinnedId ? null : msg.id })}
                              isPinned={msg.id === pinnedId}
                              onEdit={() => { if (msg.id) { setEditing(msg); setEditText(msg.message); } }}
                              onDelete={() => msg.id && deleteMutation.mutate(msg.id)}
                              onTranslate={() => msg.id && translateMutation.mutate(msg.id)}
                              onOpenLightbox={(url) => setLightbox(url)}
                              isReactionOpen={reactionTargetId === msg.id}
                              setReactionOpen={(open) => setReactionTargetId(open && msg.id ? msg.id : null)}
                              currentUserId={currentUserId}
                              audioElRef={audioElRef}
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
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-start">
                    <div className="bg-muted rounded-2xl px-3 py-2 inline-flex gap-1 items-center">
                      <TypingDot delay={0} /><TypingDot delay={150} /><TypingDot delay={300} />
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
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
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

        {/* Reply preview / Edit preview */}
        {(replyTo || editing) && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px]">
            <div className={cn("w-1 self-stretch rounded", editing ? "bg-blue-500" : "bg-primary")} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground/80">
                {editing ? "Editing message" : `Replying to ${replyTo!.senderId === currentUserId ? "yourself" : "them"}`}
              </div>
              <div className="truncate text-muted-foreground">{previewFor((editing ?? replyTo)!)}</div>
            </div>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => { setReplyTo(null); setEditing(null); setEditText(""); }}
              data-testid="button-cancel-reply-edit"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Upload progress */}
        {uploadProgress != null && (
          <div className="mt-2 text-[11px] text-muted-foreground" data-testid="text-upload-progress">
            Uploading… {uploadProgress}%
            <div className="mt-1 h-1 w-full rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {/* Recording indicator */}
        {recording && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-red-600" data-testid="text-recording">
            <span className="inline-block h-2 w-2 rounded-full bg-red-600 animate-pulse" />
            Recording {formatDurationMs(recordSeconds * 1000)} — release to send, swipe up to cancel
          </div>
        )}

        {/* Hidden inputs for media pickers */}
        <input ref={fileInputRef} type="file" accept="image/*" hidden
               onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMediaFile(f, "image"); e.target.value = ""; }}
               data-testid="input-image" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden
               onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMediaFile(f, "image"); e.target.value = ""; }}
               data-testid="input-camera" />
        <input ref={docInputRef} type="file" accept=".pdf,application/pdf" hidden
               onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMediaFile(f, "file"); e.target.value = ""; }}
               data-testid="input-doc" />

        {/* Input row */}
        <div className="flex gap-1 mt-2 items-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={!isConnected} data-testid="button-attach" title="Attach">
                <Paperclip className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1.5 flex gap-1" side="top" align="start">
              <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={!integrations?.media} data-testid="button-pick-image"><ImageIcon className="h-4 w-4 mr-1" />Photo</Button>
              <Button size="sm" variant="ghost" onClick={() => cameraInputRef.current?.click()} disabled={!integrations?.media} data-testid="button-pick-camera"><ImageIcon className="h-4 w-4 mr-1" />Camera</Button>
              <Button size="sm" variant="ghost" onClick={() => docInputRef.current?.click()} disabled={!integrations?.media} data-testid="button-pick-file"><FileText className="h-4 w-4 mr-1" />File</Button>
              <Button size="sm" variant="ghost" onClick={handleSendLocation} data-testid="button-share-location"><MapPin className="h-4 w-4 mr-1" />Location</Button>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline" size="icon"
            className={cn("h-9 w-9 shrink-0", recording && "bg-red-500 text-white border-red-500")}
            onPointerDown={startRecording}
            onPointerUp={() => stopRecording(false)}
            onPointerLeave={() => recording && stopRecording(true)}
            disabled={!isConnected || !integrations?.media}
            title="Hold to record voice"
            data-testid="button-mic"
          >
            <Mic className="h-4 w-4" />
          </Button>

          <Input
            value={editing ? editText : inputMessage}
            onChange={(e) => editing ? setEditText(e.target.value) : handleInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            onBlur={() => sendTyping(false)}
            placeholder={editing ? "Edit message…" : "Type a message…"}
            className="flex-1 h-9 text-sm"
            data-testid="input-chat-message"
          />
          <Button
            size="icon" className="h-9 w-9 shrink-0"
            onClick={() => editing
              ? editing.id && editMutation.mutate({ id: editing.id, message: editText.trim() })
              : handleSendText(inputMessage)}
            disabled={editing ? !editText.trim() || editMutation.isPending : !inputMessage.trim()}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      {/* Image lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)} data-testid="lightbox">
          <img src={lightbox} alt="Preview" className="max-h-full max-w-full rounded shadow-2xl" />
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)}><X className="h-6 w-6" /></button>
        </div>
      )}

      {/* Hidden audio element used by voice bubbles for sequential playback */}
      <audio ref={audioElRef} className="hidden" />
    </Card>
  );
}

// ============================================================
// MessageBubble
// ============================================================

interface MessageBubbleProps {
  msg: UiMessage;
  isMine: boolean;
  showTimestamp: boolean;
  quoted: UiMessage | null;
  searchQuery: string;
  integrations?: IntegrationsStatus;
  onReact: (emoji: string) => void;
  onRetry: () => void;
  onReply: () => void;
  onPin: () => void;
  isPinned: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTranslate: () => void;
  onOpenLightbox: (url: string) => void;
  isReactionOpen: boolean;
  setReactionOpen: (open: boolean) => void;
  currentUserId: string;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
}

function MessageBubble({
  msg, isMine, showTimestamp, quoted, searchQuery, integrations,
  onReact, onRetry, onReply, onPin, isPinned, onEdit, onDelete, onTranslate, onOpenLightbox,
  isReactionOpen, setReactionOpen, currentUserId, audioElRef,
}: MessageBubbleProps) {
  const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);
  const isDeleted = !!msg.deletedAt;
  const ageMs = Date.now() - new Date(msg.createdAt).getTime();
  const canEditDelete = isMine && !isDeleted && msg.id != null && ageMs < EDIT_WINDOW_MS;
  const canPin = msg.id != null && !isDeleted;
  const canTranslate = !!integrations?.translate && !isDeleted && msg.messageType === "text" && msg.message.trim().length > 0 && msg.id != null;

  // Long-press detection (touch + mouse)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const onPressStart = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => setMenuOpen(true), 500);
  };
  const onPressEnd = () => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
      className={cn("flex group", isMine ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex flex-col max-w-[80%]", isMine ? "items-end" : "items-start")}>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <div
              onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
              onPointerDown={onPressStart}
              onPointerUp={onPressEnd}
              onPointerLeave={onPressEnd}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm shadow-sm cursor-pointer relative",
                isMine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md",
                msg.status === "failed" && "opacity-70 ring-1 ring-destructive",
                isDeleted && "italic opacity-60",
              )}
              data-testid={`chat-message-${msg.id ?? msg.clientId}`}
            >
              {quoted && !isDeleted && (
                <div className={cn("mb-1.5 -mt-1 -mx-1 border-l-2 pl-2 pr-1.5 py-1 rounded text-[11px] bg-background/30",
                  isMine ? "border-primary-foreground/60 text-primary-foreground/80" : "border-foreground/40 text-muted-foreground")}>
                  <div className="font-medium opacity-80">{quoted.senderId === currentUserId ? "You" : "Them"}</div>
                  <div className="truncate">{previewFor(quoted)}</div>
                </div>
              )}

              {isDeleted ? (
                <p>Message deleted</p>
              ) : msg.messageType === "image" && msg.mediaUrl ? (
                <button onClick={(e) => { e.stopPropagation(); onOpenLightbox(safeMediaUrl(msg.mediaUrl)); }} className="block max-w-[240px]">
                  <img src={safeMediaUrl(msg.mediaUrl)} alt="" className="rounded-lg max-h-48 object-cover" loading="lazy" />
                </button>
              ) : msg.messageType === "voice" && msg.mediaUrl ? (
                <VoiceBubble url={safeMediaUrl(msg.mediaUrl)} durationMs={msg.mediaDurationMs ?? 0} audioElRef={audioElRef} />
              ) : msg.messageType === "file" && msg.mediaUrl ? (
                <a href={safeMediaUrl(msg.mediaUrl)} target="_blank" rel="noreferrer" download={msg.mediaName || true}
                   className="flex items-center gap-2 underline decoration-dotted" onClick={(e) => e.stopPropagation()}>
                  <Download className="h-4 w-4" />
                  <div className="text-xs leading-tight">
                    <div className="font-medium truncate max-w-[180px]">{msg.mediaName ?? "Attachment"}</div>
                    <div className="opacity-80">{formatBytes(msg.mediaSizeBytes)}</div>
                  </div>
                </a>
              ) : msg.messageType === "location" && msg.locationLat != null && msg.locationLng != null ? (
                <a href={`https://www.google.com/maps?q=${msg.locationLat},${msg.locationLng}`} target="_blank" rel="noreferrer"
                   className="flex items-center gap-2 underline decoration-dotted" onClick={(e) => e.stopPropagation()}>
                  <MapPin className="h-4 w-4" />
                  <div className="text-xs leading-tight">
                    <div className="font-medium">Shared location</div>
                    <div className="opacity-80">Tap to open in Maps</div>
                  </div>
                </a>
              ) : (
                <p className="whitespace-pre-wrap break-words">
                  {searchQuery ? highlightText(msg.message, searchQuery) : msg.message}
                </p>
              )}

              {msg.translation && !isDeleted && (
                <div className="mt-1 pt-1 border-t border-current/20 text-xs opacity-90">
                  <div className="text-[10px] uppercase tracking-wide opacity-60">Translated · {msg.translation.lang}</div>
                  <div>{msg.translation.text}</div>
                </div>
              )}

              {msg.editedAt && !isDeleted && (
                <span className="text-[9px] opacity-60 ml-1">(edited)</span>
              )}

              {msg.id != null && !isDeleted && (
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
          <PopoverContent className="w-44 p-1" side="top" align={isMine ? "end" : "start"}>
            <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2" onClick={() => { setMenuOpen(false); onReply(); }} data-testid="menu-reply">
              <Reply className="h-3.5 w-3.5" /> Reply
            </button>
            {canPin && (
              <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2" onClick={() => { setMenuOpen(false); onPin(); }} data-testid="menu-pin">
                {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                {isPinned ? "Unpin" : "Pin"}
              </button>
            )}
            {canTranslate && (
              <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2" onClick={() => { setMenuOpen(false); onTranslate(); }} data-testid="menu-translate">
                <Languages className="h-3.5 w-3.5" /> Translate
              </button>
            )}
            {canEditDelete && msg.messageType === "text" && (
              <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2" onClick={() => { setMenuOpen(false); onEdit(); }} data-testid="menu-edit">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {canEditDelete && (
              <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted text-destructive flex items-center gap-2" onClick={() => { setMenuOpen(false); onDelete(); }} data-testid="menu-delete">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
            <div className="border-t my-1" />
            <div className="flex gap-1 px-1">
              {REACTION_EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => { setMenuOpen(false); onReact(emoji); }}
                        className="text-lg hover:scale-125 transition-transform px-1" data-testid={`button-emoji-${emoji}`}>
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {reactionEntries.length > 0 && (
          <div className={cn("flex gap-1 mt-0.5 flex-wrap", isMine ? "justify-end" : "justify-start")}>
            {reactionEntries.map(([emoji, users]) => (
              <button key={emoji} onClick={() => onReact(emoji)}
                className="text-[11px] bg-muted/80 hover:bg-muted border border-border rounded-full px-1.5 py-0.5 flex items-center gap-1"
                data-testid={`reaction-${msg.id}-${emoji}`}>
                <span>{emoji}</span><span className="text-muted-foreground">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {showTimestamp && (
          <div className={cn("flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground", isMine ? "justify-end" : "justify-start")}>
            <span>{formatTime(msg.createdAt)}</span>
            {isMine && (
              <>
                <StatusIcon status={msg.status} />
                {msg.status === "failed" && (
                  <button onClick={onRetry} className="text-destructive hover:underline flex items-center gap-0.5" data-testid={`button-retry-${msg.clientId}`}>
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

function VoiceBubble({ url, durationMs, audioElRef }: { url: string; durationMs: number; audioElRef: React.MutableRefObject<HTMLAudioElement | null> }) {
  const [playing, setPlaying] = useState(false);
  const myAudioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!myAudioRef.current) {
      myAudioRef.current = new Audio(url);
      myAudioRef.current.onended = () => setPlaying(false);
      myAudioRef.current.onpause = () => setPlaying(false);
      myAudioRef.current.onerror = () => { setPlaying(false); sonnerToast.error("Voice note unavailable"); };
    }
    // Pause any other voice currently playing.
    if (audioElRef.current && audioElRef.current !== myAudioRef.current) {
      try { audioElRef.current.pause(); } catch { /* ignore */ }
    }
    audioElRef.current = myAudioRef.current;
    if (playing) {
      myAudioRef.current.pause(); setPlaying(false);
    } else {
      myAudioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  useEffect(() => () => { try { myAudioRef.current?.pause(); } catch { /* ignore */ } }, []);

  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <button onClick={(e) => { e.stopPropagation(); toggle(); }}
              className="h-7 w-7 rounded-full bg-background/30 flex items-center justify-center"
              data-testid="button-voice-toggle">
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1 h-1 rounded bg-current/30 overflow-hidden">
        <div className={cn("h-full bg-current/80 transition-all", playing ? "w-full" : "w-0")} />
      </div>
      <span className="text-[10px] opacity-80 tabular-nums">{formatDurationMs(durationMs)}</span>
    </div>
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
    <motion.span animate={{ y: [0, -3, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: delay / 1000 }}
      className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
  );
}

// ============================================================
// Pure helpers
// ============================================================

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
    mediaUrl: next.mediaUrl ?? prev.mediaUrl,
    mediaMimeType: next.mediaMimeType ?? prev.mediaMimeType,
    mediaName: next.mediaName ?? prev.mediaName,
    mediaSizeBytes: next.mediaSizeBytes ?? prev.mediaSizeBytes,
    mediaDurationMs: next.mediaDurationMs ?? prev.mediaDurationMs,
    mediaThumbnailUrl: next.mediaThumbnailUrl ?? prev.mediaThumbnailUrl,
    replyToMessageId: next.replyToMessageId ?? prev.replyToMessageId,
    editedAt: next.editedAt ?? prev.editedAt,
    deletedAt: next.deletedAt ?? prev.deletedAt,
    pinnedAt: next.pinnedAt ?? prev.pinnedAt,
    translation: next.translation ?? prev.translation,
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
