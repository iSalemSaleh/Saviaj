import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id?: number;
  rideId: number;
  senderId: string;
  receiverId: string;
  message: string;
  createdAt?: string;
  read?: boolean;
}

interface ChatProps {
  rideId: number;
  currentUserId: string;
  otherUserId: string;
  sendChatMessage: (receiverId: string, message: string) => void;
  isConnected: boolean;
  isOpen: boolean;
  onClose: () => void;
  onNewMessage?: (message: ChatMessage) => void;
}

export function Chat({
  rideId,
  currentUserId,
  otherUserId,
  sendChatMessage,
  isConnected,
  isOpen,
  onClose,
}: ChatProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: [`/api/rides/${rideId}/messages`],
    enabled: isOpen && rideId > 0,
    refetchInterval: 200, // Refresh every 0.2 seconds for instant messaging
  });

  useEffect(() => {
    if (messages.length > 0) {
      setLocalMessages(prev => {
        // Merge fetched messages with local messages, avoiding duplicates
        const existingIds = new Set(prev.filter(m => m.id).map(m => m.id));
        const newFromApi = messages.filter(m => !existingIds.has(m.id));
        // Also keep any local messages without IDs (optimistic adds)
        const localOnly = prev.filter(m => !m.id);
        // Combine and sort by createdAt
        const merged = [...messages, ...localOnly.filter(local => 
          !messages.some(api => api.message === local.message && api.senderId === local.senderId)
        )];
        return merged.sort((a, b) => 
          new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        );
      });
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [localMessages]);

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim() || !isConnected) return;

    const newMessage: ChatMessage = {
      rideId,
      senderId: currentUserId,
      receiverId: otherUserId,
      message: inputMessage.trim(),
      createdAt: new Date().toISOString(),
    };

    setLocalMessages((prev) => [...prev, newMessage]);
    sendChatMessage(otherUserId, inputMessage.trim());
    setInputMessage("");
  }, [inputMessage, isConnected, rideId, currentUserId, otherUserId, sendChatMessage]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const addIncomingMessage = useCallback((message: ChatMessage) => {
    if (message.senderId !== currentUserId) {
      setLocalMessages((prev) => {
        const exists = prev.some(
          (m) => m.id === message.id || 
          (m.senderId === message.senderId && 
           m.message === message.message && 
           m.createdAt === message.createdAt)
        );
        if (!exists) {
          return [...prev, message];
        }
        return prev;
      });
    }
  }, [currentUserId]);

  useEffect(() => {
    (window as any).__chatAddMessage = addIncomingMessage;
    return () => {
      delete (window as any).__chatAddMessage;
    };
  }, [addIncomingMessage]);

  if (!isOpen) return null;

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Chat
          {isConnected && (
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          data-testid="button-close-chat"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-3">
        <ScrollArea className="h-64 pr-3" ref={scrollRef}>
          <div className="space-y-2">
            {localMessages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                No messages yet. Start the conversation!
              </p>
            ) : (
              localMessages.map((msg, index) => (
                <div
                  key={msg.id || `msg-${index}`}
                  className={cn(
                    "flex",
                    msg.senderId === currentUserId ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      msg.senderId === currentUserId
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                    data-testid={`chat-message-${msg.id || index}`}
                  >
                    <p>{msg.message}</p>
                    {msg.createdAt && (
                      <p
                        className={cn(
                          "text-[10px] mt-1",
                          msg.senderId === currentUserId
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        )}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="flex gap-2 mt-3">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={!isConnected}
            data-testid="input-chat-message"
          />
          <Button
            size="icon"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || !isConnected}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!isConnected && (
          <p className="text-xs text-orange-500 mt-2">
            Reconnecting...
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default Chat;
