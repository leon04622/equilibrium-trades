/**
 * Outbound Telegram alerts when a user sends support chat from the trading UI.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   TELEGRAM_CHAT_ID    — your user or group id (getUpdates or @userinfobot)
 *
 * Optional inbound webhook (reply from Telegram → app): set Telegram webhook URL to
 *   https://YOUR_DOMAIN/api/telegram/webhook
 * and implement that route if you want two-way from Telegram; admin panel replies use the existing support API.
 */

const TELEGRAM_API = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function notifyTelegramUserSupportMessage(
  walletAddress: string,
  messageContent: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    return { ok: false, error: "Telegram not configured" };
  }

  const wallet = escapeHtml(walletAddress);
  const text = escapeHtml(messageContent).slice(0, 3500);
  const body = {
    chat_id: chatId,
    text: `<b>New message from Equilibrium User</b> <code>${wallet}</code>\n\n${text}`,
    parse_mode: "HTML" as const,
    disable_web_page_preview: true,
  };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      const err = data.description || res.statusText;
      const { pushAdminLog } = await import("./admin-log-bus");
      pushAdminLog({
        channel: "telegram",
        level: "error",
        message: `Telegram sendMessage failed: ${err}`,
        meta: { walletAddress, status: res.status },
      });
      return { ok: false, error: err };
    }
    const { pushAdminLog } = await import("./admin-log-bus");
    pushAdminLog({
      channel: "telegram",
      level: "info",
      message: "Telegram user support alert delivered",
      meta: { walletAddress, preview: messageContent.slice(0, 120) },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send failed";
    const { pushAdminLog } = await import("./admin-log-bus");
    pushAdminLog({
      channel: "telegram",
      level: "error",
      message: `Telegram sendMessage exception: ${msg}`,
      meta: { walletAddress },
    });
    return { ok: false, error: msg };
  }
}

const apexTelegramDedup = new Map<string, number>();
const APEX_TELEGRAM_COOLDOWN_MS = 5 * 60_000;

/** High-probability Apex flag on 1h/4h → instant admin Telegram (deduped). */
export async function notifyTelegramApexHighProbability(signal: {
  coin: string;
  timeframe: string;
  patternName: string;
  apexTier?: string;
}): Promise<void> {
  if (signal.apexTier !== "high_probability_trend_aligned") return;
  if (signal.timeframe !== "1h" && signal.timeframe !== "4h") return;

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;

  const key = `${signal.coin}|${signal.timeframe}|${signal.patternName}`;
  const now = Date.now();
  if (now - (apexTelegramDedup.get(key) ?? 0) < APEX_TELEGRAM_COOLDOWN_MS) return;
  apexTelegramDedup.set(key, now);
  if (apexTelegramDedup.size > 500) {
    for (const [k, t] of apexTelegramDedup) {
      if (now - t > APEX_TELEGRAM_COOLDOWN_MS * 4) apexTelegramDedup.delete(k);
    }
  }

  const coin = escapeHtml(signal.coin);
  const tf = escapeHtml(signal.timeframe);
  const name = escapeHtml(signal.patternName);
  const body = {
    chat_id: chatId,
    text:
      `<b>Apex — High probability (${tf})</b>\n<code>${coin}</code>\n${name}\n\n<i>Equilibrium Pattern Engine — 1h/4h trend-aligned flag.</i>`,
    parse_mode: "HTML" as const,
    disable_web_page_preview: true,
  };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      const { pushAdminLog } = await import("./admin-log-bus");
      pushAdminLog({
        channel: "telegram",
        level: "warn",
        message: `Apex Telegram failed: ${data.description || res.statusText}`,
      });
    }
  } catch (e) {
    const { pushAdminLog } = await import("./admin-log-bus");
    pushAdminLog({
      channel: "telegram",
      level: "error",
      message: `Apex Telegram exception: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
