import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MessageCircle, X, Send, Bot, User, Minimize2 } from "lucide-react";

interface Message {
  id: string;
  content: string;
  sender: "user" | "support";
  timestamp: Date;
}

const defaultMessages: Message[] = [
  {
    id: "1",
    content: "Hello! Welcome to Equilibrium support. How can I help you today?",
    sender: "support",
    timestamp: new Date(),
  },
];

const quickReplies = [
  "How do I connect my wallet?",
  "Explain the 21/200 SMA strategy",
  "What is the liquidity heatmap?",
  "How do I upgrade my plan?",
];

export function LiveChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>(defaultMessages);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      setIsTyping(false);
    };
  }, []);

  const handleSend = (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    const timerId = setTimeout(() => {
      const response = getAutoResponse(content);
      const supportMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response,
        sender: "support",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, supportMessage]);
      setIsTyping(false);
    }, 1500);
    
    return () => clearTimeout(timerId);
  };

  const getAutoResponse = (question: string): string => {
    const q = question.toLowerCase();
    
    if (q.includes("wallet") || q.includes("connect")) {
      return "To connect your wallet, go to the Hyperliquid page from the sidebar and click 'Connect Wallet'. We support MetaMask, WalletConnect, and other popular wallets. Need more help with wallet setup?";
    }
    if (q.includes("sma") || q.includes("strategy") || q.includes("21") || q.includes("200")) {
      return "The 21/200 SMA strategy is a trend-following approach. When the 21-period SMA crosses above the 200-period SMA, it signals a potential uptrend (bullish). When it crosses below, it signals a potential downtrend (bearish). Check our Learn section for detailed tutorials!";
    }
    if (q.includes("heatmap") || q.includes("liquidity")) {
      return "The liquidity heatmap shows order book depth over time. Brighter colors indicate more orders at that price level. It helps you see where large orders (whale activity) are placed. This is an Elite tier feature - you can upgrade from the Pricing page.";
    }
    if (q.includes("upgrade") || q.includes("plan") || q.includes("pricing")) {
      return "We offer three tiers: Starter (Free), Pro ($49/mo), and Elite ($149/mo). Pro includes AI pattern detection and alerts. Elite adds the liquidity heatmap and 1-on-1 coaching. Visit the Pricing page to upgrade!";
    }
    if (q.includes("pattern")) {
      return "We support 18+ chart patterns including Bull/Bear Flags, Head & Shoulders, Double Top/Bottom, and more. Visit the Patterns page to learn about each one, or enable AI detection on the Trading page!";
    }
    
    return "Thanks for your question! Our team will get back to you shortly. In the meantime, check out our Learn section for tutorials, or explore the Pattern Library to learn about trading patterns.";
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
        data-testid="button-open-chat"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex flex-col bg-background border rounded-lg shadow-xl transition-all duration-200",
        isMinimized ? "w-72 h-14" : "w-80 sm:w-96 h-[500px]"
      )}
      data-testid="live-chat-widget"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <div>
            <p className="font-semibold text-sm">Equilibrium Support</p>
            {!isMinimized && (
              <p className="text-xs opacity-80">We typically reply instantly</p>
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
            onClick={() => setIsOpen(false)}
            data-testid="button-close-chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2",
                    message.sender === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.sender === "support" && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      message.sender === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {message.content}
                    <p className={cn(
                      "text-[10px] mt-1",
                      message.sender === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {message.sender === "user" && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-muted text-xs">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-2">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {messages.length === 1 && (
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
                data-testid="input-chat-message"
              />
              <Button type="submit" size="icon" disabled={!inputValue.trim()} data-testid="button-send-message">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
