import { EventEmitter } from "events";

export type AdminLogEntry = {
  ts: string;
  channel: "support" | "telegram" | "stripe" | "api" | "ws";
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
};

const bus = new EventEmitter();
bus.setMaxListeners(200);

export function pushAdminLog(entry: Omit<AdminLogEntry, "ts"> & { ts?: string }): void {
  const full: AdminLogEntry = {
    ts: entry.ts ?? new Date().toISOString(),
    channel: entry.channel,
    level: entry.level,
    message: entry.message,
    meta: entry.meta,
  };
  bus.emit("log", full);
}

export function subscribeAdminLog(handler: (e: AdminLogEntry) => void): () => void {
  bus.on("log", handler);
  return () => bus.off("log", handler);
}
