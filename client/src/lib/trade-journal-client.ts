import type { TradeJournalCreateBody } from "@shared/schema";

/**
 * Persists an execution to the professional trade journal (Mongo `trade_journal` when vault is connected).
 * Non-blocking for trading: failures are logged only.
 */
export async function saveTradeToJournal(
  walletAddress: string,
  body: TradeJournalCreateBody,
): Promise<void> {
  const w = walletAddress.trim().toLowerCase();
  if (!w) return;
  try {
    const res = await fetch("/api/trade-journal/entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wallet-address": w,
      },
      body: JSON.stringify({ ...body, walletAddress: w }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[saveTradeToJournal]", res.status, t);
    }
  } catch (e) {
    console.warn("[saveTradeToJournal]", e);
  }
}
