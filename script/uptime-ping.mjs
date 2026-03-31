#!/usr/bin/env node
/**
 * Minimal uptime probe for cron or external monitors.
 * Expects JSON `{ "status": "ok" }` from GET /health.
 *
 * Usage:
 *   UPTIME_CHECK_URL=https://www.example.com npm run verify:uptime
 *   npm run verify:uptime -- https://www.example.com
 */

const baseArg = process.argv[2]?.trim();
const base = (process.env.UPTIME_CHECK_URL || process.env.LIVE_BASE_URL || baseArg || "").replace(/\/$/, "");

if (!base) {
  console.error("verify:uptime: set UPTIME_CHECK_URL or LIVE_BASE_URL, or pass the site origin as an argument.");
  process.exit(2);
}

const url = `${base}/health`;

try {
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    console.error(`verify:uptime: ${res.status} ${url}`);
    process.exit(1);
  }
  if (json?.status !== "ok") {
    console.error(`verify:uptime: unexpected body from ${url}: ${text.slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`verify:uptime: ok ${url}`);
  process.exit(0);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`verify:uptime: fetch failed ${url}: ${msg}`);
  process.exit(1);
}
