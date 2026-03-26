import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ChatContextType {
  isOpen: boolean;
  openChat: (message?: string) => void;
  /** Master admin: open the floating inbox, optionally focused on a conversation id (wallet or guest id). */
  openSupportInbox: (conversationId?: string) => void;
  closeChat: () => void;
  pendingMessage: string | null;
  clearPendingMessage: () => void;
  pendingSupportConversationId: string | null;
  clearPendingSupportConversation: () => void;
  /** Increments when master opens inbox without a target — Live Chat clears thread selection to show the list. */
  supportInboxListKey: number;
}

const ChatContext = createContext<ChatContextType>({
  isOpen: false,
  openChat: () => {},
  openSupportInbox: () => {},
  closeChat: () => {},
  pendingMessage: null,
  clearPendingMessage: () => {},
  pendingSupportConversationId: null,
  clearPendingSupportConversation: () => {},
  supportInboxListKey: 0,
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [pendingSupportConversationId, setPendingSupportConversationId] = useState<string | null>(null);
  const [supportInboxListKey, setSupportInboxListKey] = useState(0);

  const clearPendingSupportConversation = useCallback(() => {
    setPendingSupportConversationId(null);
  }, []);

  const openChat = (message?: string) => {
    if (message) {
      setPendingMessage(message);
    }
    setIsOpen(true);
  };

  const openSupportInbox = useCallback((conversationId?: string) => {
    if (conversationId !== undefined && conversationId !== "") {
      setPendingSupportConversationId(conversationId);
    } else {
      setPendingSupportConversationId(null);
      setSupportInboxListKey((k) => k + 1);
    }
    setIsOpen(true);
  }, []);

  const closeChat = () => {
    setIsOpen(false);
  };

  const clearPendingMessage = () => {
    setPendingMessage(null);
  };

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        openChat,
        openSupportInbox,
        closeChat,
        pendingMessage,
        clearPendingMessage,
        pendingSupportConversationId,
        clearPendingSupportConversation,
        supportInboxListKey,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
