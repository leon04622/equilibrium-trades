// In-memory chat storage for MVP
// This can be upgraded to use a database when needed

interface Conversation {
  id: number;
  title: string;
  createdAt: Date;
}

interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
}

export interface IChatStorage {
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
}

class MemoryChatStorage implements IChatStorage {
  private conversations: Map<number, Conversation> = new Map();
  private messages: Map<number, Message> = new Map();
  private nextConversationId = 1;
  private nextMessageId = 1;

  async getConversation(id: number) {
    return this.conversations.get(id);
  }

  async getAllConversations() {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createConversation(title: string) {
    const conversation: Conversation = {
      id: this.nextConversationId++,
      title,
      createdAt: new Date(),
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async deleteConversation(id: number) {
    this.conversations.delete(id);
    // Delete associated messages
    for (const [msgId, msg] of this.messages.entries()) {
      if (msg.conversationId === id) {
        this.messages.delete(msgId);
      }
    }
  }

  async getMessagesByConversation(conversationId: number) {
    return Array.from(this.messages.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createMessage(conversationId: number, role: string, content: string) {
    const message: Message = {
      id: this.nextMessageId++,
      conversationId,
      role,
      content,
      createdAt: new Date(),
    };
    this.messages.set(message.id, message);
    return message;
  }
}

export const chatStorage = new MemoryChatStorage();
