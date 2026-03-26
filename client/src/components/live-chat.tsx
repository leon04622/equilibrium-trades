import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MessageCircle, X, Send, Shield, User, Minimize2, Loader2, ArrowLeft } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";
import { useChat } from "@/lib/chat-context";
import { useSidebar } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { SupportMessage } from "@shared/schema";

interface Conversation {
  conversationId: string;
  lastMessage: SupportMessage;
  unreadCount: number;
}

const quickReplies = [
  "How do I connect my wallet?",
  "Explain the 21/200 SMA strategy",
  "What is the liquidity heatmap?",
  "How do I upgrade my plan?",
];

function getOrCreateGuestId(): string {
  const KEY = "eq_guest_session_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "guest_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Audio API not available — silently fail
  }
}

/** Matches App.tsx SidebarProvider --sidebar-width / --sidebar-width-icon for docked panel position. */
const SIDEBAR_W = "16rem";
const SIDEBAR_ICON_W = "3.5rem";

export function LiveChat() {
  const { isOpen, closeChat, pendingMessage, clearPendingMessage } = useChat();
  const { toast } = useToast();
  const { state, isMobile } = useSidebar();
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);
  const { address } = useWallet();

  const guestId = typeof window !== "undefined" ? getOrCreateGuestId() : null;
  const conversationOwnerId = (address?.toLowerCase() || guestId || "").toLowerCase();

  useEffect(() => {
    if (pendingMessage && isOpen) {
      setInputValue(pendingMessage);
      clearPendingMessage();
    }
  }, [pendingMessage, isOpen, clearPendingMessage]);

  const { isMasterAdmin } = useIsMasterAdmin();
  const conversationId = isMasterAdmin ? selectedConversation : conversationOwnerId;

  const buildHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (address) h["x-wallet-address"] = address;
    if (!address && guestId) h["x-session-id"] = guestId;
    return h;
  }, [address, guestId]);

  const { data: messages = [], refetch: refetchMessages } = useQuery<SupportMessage[]>({
    queryKey: ["/api/support/messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await fetch(`/api/support/messages/${conversationId}`, {
        headers: buildHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!conversationId && isOpen && !isMinimized,
    refetchInterval: isOpen && !isMinimized ? 8000 : false,
  });

  /** Near real-time when admin replies (EventSource cannot set headers; use fetch + SSE stream). */
  useEffect(() => {
    if (!conversationId || !isOpen || isMinimized) return;
    const ac = new AbortController();
    let buf = "";
    const run = async () => {
      try {
        const res = await fetch(
          `/api/support/stream/${encodeURIComponent(conversationId)}`,
          { headers: buildHeaders(), signal: ac.signal },
        );
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const block of parts) {
            const line = block.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              const payload = JSON.parse(line.slice(6)) as { id?: string; message?: string };
              if (payload?.id) {
                queryClient.invalidateQueries({ queryKey: ["/api/support/messages", conversationId] });
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* aborted */
      }
    };
    void run();
    return () => ac.abort();
  }, [conversationId, isOpen, isMinimized, buildHeaders]);

  const { data: conversations = [], refetch: refetchConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/support/conversations"],
    queryFn: async () => {
      if (!address) return [];
      const res = await fetch("/api/support/conversations", {
        headers: { "x-wallet-address": address },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isMasterAdmin && !!address && isOpen && !isMinimized,
    refetchInterval: isMasterAdmin && isOpen && !isMinimized ? 4000 : false,
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  useEffect(() => {
    if (isMasterAdmin && totalUnread > prevUnreadRef.current) {
      playNotificationSound();
    }
    prevUnreadRef.current = totalUnread;
  }, [isMasterAdmin, totalUnread]);

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      if (!conversationId) throw new Error("No conversation");
      if (isMasterAdmin) {
        const res = await fetch("/api/support/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildHeaders(),
          },
          body: JSON.stringify({
            senderType: "admin",
            senderWallet: null,
            senderName: "Support Team",
            message: msg,
            conversationId,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to send message");
        }
        return res.json();
      }
      const walletForBody = (address?.toLowerCase() || guestId || conversationOwnerId).toLowerCase();
      const res = await fetch("/api/support/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildHeaders(),
        },
        body: JSON.stringify({
          walletAddress: walletForBody,
          messageContent: msg,
          message: msg,
          conversationId: conversationOwnerId.toLowerCase(),
          clientTimestamp: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: () => {
      setInputValue("");
      refetchMessages();
      if (isMasterAdmin) refetchConversations();
    },
    onError: (err: Error) => {
      toast({
        title: "Message not sent",
        description: err.message || "Check your connection and try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (content: string) => {
    if (!content.trim()) return;
    sendMutation.mutate(content.trim());
  };

  const dockedLeft =
    isMobile
      ? undefined
      : state === "expanded"
        ? `calc(${SIDEBAR_W} + 0.75rem)`
        : `calc(${SIDEBAR_ICON_W} + 0.75rem)`;

  const positionStyle: CSSProperties = {
    zIndex: 100000,
    ...(dockedLeft != null ? { left: dockedLeft, right: "auto" } : {}),
  };

  const positionClassName = cn(
    "fixed flex flex-col bg-background border rounded-xl shadow-2xl transition-all duration-200",
    isMobile && "left-3 right-3 bottom-24 max-w-none",
    !isMobile && "bottom-6",
    isMinimized ? "w-72 h-14" : "w-[340px] sm:w-96 h-[480px] max-h-[80vh]",
  );

  const chatContent = !isOpen ? null : (
    <div
      className={positionClassName}
      style={positionStyle}
      data-testid="live-chat-widget"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground rounded-t-xl">
        <div className="flex items-center gap-2">
          {isMasterAdmin && selectedConversation && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-primary-foreground/20 -ml-1"
              onClick={() => setSelectedConversation(null)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Shield className="h-5 w-5" />
          <div>
            <p className="font-semibold text-sm">
              {isMasterAdmin ? "Support Inbox" : "Live Support"}
            </p>
            {!isMinimized && (
              <p className="text-xs opacity-80">
                {isMasterAdmin
                  ? selectedConversation
                    ? `${selectedConversation.slice(0, 6)}...${selectedConversation.slice(-4)}`
                    : `${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}`
                  : "We typically reply within minutes"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-primary-foreground/20"
            onClick={() => setIsMinimized(!isMinimized)}
            data-testid="button-minimize-chat"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-primary-foreground/20"
            onClick={() => closeChat()}
            data-testid="button-close-chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          {isMasterAdmin && !selectedConversation ? (
            <ScrollArea className="flex-1 min-h-0 p-3">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12">
                  <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground text-center">
                    No customer messages yet.<br />They'll appear here when users reach out.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <button
                      key={conv.conversationId}
                      onClick={() => setSelectedConversation(conv.conversationId)}
                      className="w-full p-3 rounded-lg text-left hover-elevate flex items-center justify-between bg-muted/30"
                      data-testid={`conversation-${conv.conversationId}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-primary/15 text-primary text-xs">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {conv.conversationId.startsWith("guest_")
                              ? `Guest ${conv.conversationId.slice(6, 12)}`
                              : `${conv.conversationId.slice(0, 6)}...${conv.conversationId.slice(-4)}`}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.lastMessage.message}
                          </p>
                        </div>
                      </div>
                      {conv.unreadCount > 0 && (
                        <Badge variant="destructive" className="ml-2 shrink-0">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          ) : (
            <>
              <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 overscroll-contain"
              >
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[120px] py-8">
                      <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground text-center px-2">
                        {isMasterAdmin ? "No messages yet in this conversation." : "Send us a message and we'll reply soon!"}
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-2",
                          message.senderType === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        {message.senderType === "admin" && (
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                              <Shield className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                            message.senderType === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          )}
                        >
                          {message.message}
                          <p className={cn(
                            "text-[10px] mt-1",
                            message.senderType === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {new Date(message.createdAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        {message.senderType === "user" && (
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-muted text-xs">
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {messages.length === 0 && !isMasterAdmin && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-muted-foreground">Quick questions:</p>
                    <div className="flex flex-wrap gap-2">
                      {quickReplies.map((reply) => (
                        <Badge
                          key={reply}
                          variant="outline"
                          className="cursor-pointer hover-elevate text-xs"
                          onClick={() => handleSend(reply)}
                          data-testid={`quick-reply-${reply.replace(/\s+/g, "-").slice(0, 20)}`}
                        >
                          {reply}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend(inputValue);
                  }}
                  className="flex gap-2"
                >
                  <Input
                    placeholder="Type a message..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="flex-1"
                    disabled={sendMutation.isPending}
                    data-testid="input-chat-message"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!inputValue.trim() || sendMutation.isPending}
                    data-testid="button-send-message"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;
  return createPortal(chatContent, document.body);
}
