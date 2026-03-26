#!/usr/bin/env node
/**
 * Optional: point Telegram at your app to receive bot updates (e.g. future inbound replies).
 * Outbound user→admin alerts use TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID only (no webhook).
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=123:ABC node scripts/telegram-webhook-setup.mjs https://yourdomain.com/api/telegram/webhook
 */
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const url = process.argv[2]?.trim();
if (!token || !url) {
  console.error(
    "Usage: TELEGRAM_BOT_TOKEN=your_bot_token node scripts/telegram-webhook-setup.mjs https://YOUR_DOMAIN/api/telegram/webhook",
  );
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url }),
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
