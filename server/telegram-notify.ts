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
