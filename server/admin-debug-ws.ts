import WebSocket, { WebSocketServer } from "ws";
import type { Server } from "http";
import { subscribeAdminLog, type AdminLogEntry } from "./admin-log-bus";
import { consumeCommandCenterWsToken } from "./command-center-ws-token";

/**
 * Live log stream for the Command Center (master wallet obtains a one-time token via HTTP).
 * Path: /ws/command-center-log?token=...
 */
export function attachCommandCenterDebugWs(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/command-center-log" });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token")?.trim();
    if (!consumeCommandCenterWsToken(token || undefined)) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid or missing WS token. GET /api/command-center/ws-token first." }));
      ws.close(4001, "Unauthorized");
      return;
    }

    const send = (e: AdminLogEntry) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "log", ...e }));
      }
    };
    const unsub = subscribeAdminLog(send);
    ws.send(JSON.stringify({ type: "connected", message: "Command Center live log" }));

    ws.on("close", () => unsub());
    ws.on("error", () => unsub());
  });
}
