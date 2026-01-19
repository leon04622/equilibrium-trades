import { useState, useRef, useEffect } from "react";
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
import { useChat } from "@/lib/chat-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

export function LiveChat() {
  const { isOpen, openChat, closeChat, pendingMessage, clearPendingMessage } = useChat();
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { address } = useWallet();

  useEffect(() => {
    if (pendingMessage && isOpen) {
      setInputValue(pendingMessage);
      clearPendingMessage();
    }
  }, [pendingMessage, isOpen, clearPendingMessage]);

  const { data: isAdminData } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check", address],
    queryFn: async () => {
      if (!address) return { isAdmin: false };
      const res = await fetch(`/api/admin/check/${address}`);
      return res.json();
    },
    enabled: !!address,
  });

  const isAdmin = isAdminData?.isAdmin ?? false;
  const conversationId = isAdmin ? selectedConversation : address?.toLowerCase();

  const { data: messages = [], refetch: refetchMessages } = useQuery<SupportMessage[]>({
    queryKey: ["/api/support/messages", conversationId],
    queryFn: async () => {
      if (!conversationId || !address) return [];
      const res = await fetch(`/api/support/messages/${conversationId}`, {
        headers: { "x-wallet-address": address },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!conversationId && !!address && isOpen && !isMinimized,
    refetchInterval: isOpen && !isMinimized ? 5000 : false,
  });

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
    enabled: isAdmin && !!address && isOpen && !isMinimized,
    refetchInterval: isOpen && !isMinimized ? 5000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      if (!conversationId || !address) throw new Error("No conversation ID or wallet");
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({
          senderType: isAdmin ? "admin" : "user",
          senderWallet: isAdmin ? null : address,
          senderName: isAdmin ? "Support Team" : `User ${address?.slice(0, 6)}...${address?.slice(-4)}`,
          message: msg,
          conversationId,
        }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      setInputValue("");
      refetchMessages();
      if (isAdmin) {
        refetchConversations();
      }
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

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const chatContent = !isOpen ? (
    <Button
      onClick={() => openChat()}
      className="fixed bottom-20 right-4 md:bottom-4 md:right-4 h-14 w-14 rounded-full shadow-lg"
      size="icon"
      style={{ zIndex: 9999 }}
      data-testid="button-open-chat"
    >
      <MessageCircle className="h-6 w-6" />
      {isAdmin && totalUnread > 0 && (
        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
          {totalUnread}
        </Badge>
      )}
    </Button>
  ) : (
    <div
      className={cn(
        "fixed bottom-20 right-4 md:bottom-4 md:right-4 flex flex-col bg-background border rounded-lg shadow-xl transition-all duration-200",
        isMinimized ? "w-72 h-14" : "w-80 sm:w-96 h-[450px] max-h-[80vh]"
      )}
      style={{ zIndex: 9999 }}
      data-testid="live-chat-widget"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          {isAdmin && selectedConversation && (
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
              {isAdmin ? "Support Inbox" : "Live Support"}
            </p>
            {!isMinimized && (
              <p className="text-xs opacity-80">
                {isAdmin 
                  ? (selectedConversation 
                    ? `${selectedConversation.slice(0, 6)}...${selectedConversation.slice(-4)}` 
                    : `${conversations.length} conversations`)
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
        <>
          {isAdmin && !selectedConversation ? (
            <ScrollArea className="flex-1 p-3">
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
                            {conv.conversationId.slice(0, 6)}...{conv.conversationId.slice(-4)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.lastMessage.message}
                          </p>
                        </div>
                      </div>
                      {conv.unreadCount > 0 && (
                        <Badge variant="default" className="ml-2 shrink-0">
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
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.length === 0 && !address ? (
                    <div className="flex flex-col items-center justify-center h-full py-8">
                      <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground text-center">
                        Connect your wallet to chat with support
                      </p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8">
                      <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground text-center">
                        Send us a message and we'll reply soon!
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
                            {new Date(message.createdAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

                {messages.length === 0 && address && !isAdmin && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-muted-foreground">Quick questions:</p>
                    <div className="flex flex-wrap gap-2">
                      {quickReplies.map((reply) => (
                        <Badge
                          key={reply}
                          variant="outline"
                          className="cursor-pointer hover-elevate text-xs"
                          onClick={() => handleSend(reply)}
                          data-testid={`quick-reply-${reply.replace(/\s+/g, '-').slice(0, 20)}`}
                        >
                          {reply}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </ScrollArea>

              {(address || isAdmin) && (
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
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  return createPortal(chatContent, document.body);
}
