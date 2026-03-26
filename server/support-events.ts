import { EventEmitter } from "events";
import type { SupportMessage } from "@shared/schema";

/** Fan-out for SSE: new support messages (any conversation). */
export const supportEventBus = new EventEmitter();
supportEventBus.setMaxListeners(200);

export function emitSupportMessage(message: SupportMessage): void {
  supportEventBus.emit("message", message);
}
