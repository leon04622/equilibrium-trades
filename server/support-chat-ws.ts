import WebSocket, { WebSocketServer } from "ws";
import type { Server } from "http";
import type { RawData } from "ws";
import { supportEventBus } from "./support-events";
import { isMasterAdminAddress } from "./master-admin";
import type { SupportMessage } from "@shared/schema";

type SubscribePayload = {
  type?: string;
  scope?: string;
  conversationId?: string;
  walletAddress?: string;
  sessionId?: string;
};

function safeParseSubscribe(raw: RawData): SubscribePayload | null {
  try {
    const o = JSON.parse(raw.toString()) as SubscribePayload;
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

function allowConversationSubscribe(
  walletAddress: string | undefined,
  sessionId: string | undefined,
  conversationId: string,
): boolean {
  const cid = conversationId.toLowerCase();
  if (isMasterAdminAddress(walletAddress)) return true;
  const owner = (walletAddress || sessionId || "").toLowerCase();
  return !!owner && owner === cid;
}

/**
 * /ws/support-chat — end-users subscribe to their conversation; master wallet can subscribe to `admin_inbox` for all new tickets.
 * Payloads to client: `{ type: "support_message", message: SupportMessage }`
 */
export function attachSupportChatWs(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/support-chat" });

  const byConversation = new Map<string, Set<WebSocket>>();
  const adminInboxSockets = new Set<WebSocket>();

  const addToConversation = (cid: string, ws: WebSocket) => {
    const key = cid.toLowerCase();
    let set = byConversation.get(key);
    if (!set) {
      set = new Set();
      byConversation.set(key, set);
    }
    set.add(ws);
  };

  const removeFromConversation = (cid: string, ws: WebSocket) => {
    const set = byConversation.get(cid.toLowerCase());
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) byConversation.delete(cid.toLowerCase());
  };

  const cleanupSocket = (ws: WebSocket) => {
    adminInboxSockets.delete(ws);
    for (const [cid, set] of byConversation) {
      set.delete(ws);
      if (set.size === 0) byConversation.delete(cid);
    }
  };

  const dropConversationSubs = (ws: WebSocket) => {
    for (const [cid, set] of byConversation) {
      set.delete(ws);
      if (set.size === 0) byConversation.delete(cid);
    }
  };

  const broadcastConversation = (cid: string, message: SupportMessage) => {
    const payload = JSON.stringify({ type: "support_message", message });
    const set = byConversation.get(cid.toLowerCase());
    if (set) {
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payload);
          } catch {
            /* ignore */
          }
        }
      }
    }
  };

  const broadcastAdminInbox = (message: SupportMessage) => {
    const payload = JSON.stringify({ type: "support_message", message });
    for (const ws of adminInboxSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch {
          /* ignore */
        }
      }
    }
  };

  const onSupportMessage = (message: SupportMessage) => {
    try {
      const cid = String(message.conversationId || "").toLowerCase();
      if (cid) broadcastConversation(cid, message);
      broadcastAdminInbox(message);
    } catch {
      /* ignore */
    }
  };

  supportEventBus.on("message", onSupportMessage);

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      try {
        const msg = safeParseSubscribe(raw);
        if (!msg || msg.type !== "subscribe") return;

        if (msg.scope === "admin_inbox") {
          const w = msg.walletAddress?.trim();
          if (!isMasterAdminAddress(w)) {
            ws.send(JSON.stringify({ type: "error", error: "Master admin wallet required for admin_inbox" }));
            return;
          }
          dropConversationSubs(ws);
          adminInboxSockets.add(ws);
          ws.send(JSON.stringify({ type: "subscribed", scope: "admin_inbox" }));
          return;
        }

        const conversationId = (msg.conversationId || "").trim().toLowerCase();
        if (!conversationId) {
          ws.send(JSON.stringify({ type: "error", error: "conversationId required" }));
          return;
        }

        if (!allowConversationSubscribe(msg.walletAddress?.trim(), msg.sessionId?.trim(), conversationId)) {
          ws.send(JSON.stringify({ type: "error", error: "Cannot subscribe to this conversation" }));
          return;
        }

        addToConversation(conversationId, ws);
        ws.send(JSON.stringify({ type: "subscribed", conversationId }));
      } catch {
        /* ignore malformed */
      }
    });

    ws.on("close", () => cleanupSocket(ws));
    ws.on("error", () => cleanupSocket(ws));
  });

  wss.on("error", (err) => {
    console.error("[support-chat-ws] server error:", err);
  });
}
