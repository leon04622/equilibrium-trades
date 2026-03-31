import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageCircle, X, Send, Loader2, User, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWallet } from "@/lib/wallet-context";
import { queryClient } from "@/lib/queryClient";
import type { SupportMessage } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { linkifyPlainText } from "@/lib/linkify-message";

interface SupportChatProps {
  isAdmin?: boolean;
}

export function SupportChat({ isAdmin = false }: SupportChatProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { address } = useWallet();

  const conversationId = isAdmin ? selectedConversation : address?.toLowerCase();

  const buildHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (address) h["x-wallet-address"] = address;
    return h;
  }, [address]);

  const { data: messages = [], refetch: refetchMessages } = useQuery<SupportMessage[]>({
    queryKey: ["/api/support/messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await fetch(`/api/support/messages/${encodeURIComponent(conversationId)}`, {
        headers: buildHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!conversationId && isOpen,
    refetchInterval: isOpen ? 5000 : false,
  });

  const { data: conversations = [] } = useQuery<{ conversationId: string; lastMessage: SupportMessage; unreadCount: number }[]>({
    queryKey: ["/api/support/conversations", address],
    queryFn: async () => {
      if (!address) return [];
      const res = await fetch("/api/support/conversations", {
        headers: { "x-wallet-address": address },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin && isOpen && !!address,
    refetchInterval: isOpen ? 5000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      if (!conversationId) throw new Error("No conversation ID");
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildHeaders(),
        },
        body: JSON.stringify({
          senderType: isAdmin ? "admin" : "user",
          senderWallet: isAdmin ? null : address,
          senderName: isAdmin ? "Support Team" : `User ${address?.slice(0, 6)}...${address?.slice(-4)}`,
          message: msg,
          conversationId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(err.detail || err.error || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: () => {
      setMessage("");
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Message not sent",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMutation.mutate(message.trim());
  };

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  if (!address && !isAdmin) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full shadow-xl shadow-primary/20 md:bottom-6 md:right-6"
        size="icon"
        data-testid="button-open-chat"
      >
        <MessageCircle className="h-6 w-6" />
        {totalUnread > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
            {totalUnread}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <Card className="fixed bottom-20 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm border-border/70 shadow-2xl md:bottom-6 md:right-6 md:w-96">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 p-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              {isAdmin ? "Support Inbox" : "Live Support"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} data-testid="button-close-chat">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isAdmin && !selectedConversation ? (
              <div className="p-3">
                <p className="text-sm text-muted-foreground mb-3">Customer Conversations</p>
                {conversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conv) => (
                      <button
                        key={conv.conversationId}
                        onClick={() => setSelectedConversation(conv.conversationId)}
                        className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/50 p-3 text-left transition-colors hover:bg-muted/40"
                        data-testid={`conversation-${conv.conversationId}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {conv.conversationId.slice(0, 8)}...{conv.conversationId.slice(-6)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.lastMessage.message}
                          </p>
                        </div>
                        {conv.unreadCount > 0 && (
                          <Badge variant="default" className="ml-2">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {isAdmin && selectedConversation && (
                  <div className="p-2 border-b flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedConversation(null)}>
                      Back
                    </Button>
                    <span className="text-xs text-muted-foreground truncate">
                      {selectedConversation.slice(0, 8)}...{selectedConversation.slice(-6)}
                    </span>
                  </div>
                )}
                <ScrollArea className="h-72 p-3" ref={scrollRef}>
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {isAdmin ? "No messages in this conversation" : "Send us a message and we'll reply soon!"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex gap-2",
                            msg.senderType === "admin" ? "justify-start" : "justify-end"
                          )}
                        >
                          {msg.senderType === "admin" && (
                            <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                              <Shield className="h-3.5 w-3.5 text-primary" />
                            </div>
                          )}
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-3 py-2 text-sm break-words shadow-sm",
                              msg.senderType === "admin"
                                ? "border border-border/60 bg-muted/70"
                                : "bg-primary text-primary-foreground"
                            )}
                          >
                            {linkifyPlainText(
                              msg.message,
                              msg.senderType === "admin"
                                ? "text-primary underline-offset-2 hover:underline break-all"
                                : "text-primary-foreground underline font-medium break-all",
                            )}
                          </div>
                          {msg.senderType === "user" && (
                            <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <form onSubmit={handleSend} className="p-3 border-t flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={sendMutation.isPending}
                    data-testid="input-chat-message"
                  />
                  <Button type="submit" size="icon" disabled={sendMutation.isPending || !message.trim()} data-testid="button-send-message">
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
