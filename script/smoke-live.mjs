/**
 * Smoke-test a live deployment.
 *
 * Usage:
 *   LIVE_BASE_URL=https://www.example.com node script/smoke-live.mjs
 *
 * Optional:
 *   LIVE_WALLET=0x...
 *   LIVE_VIDEO_URL=https://www.example.com/api/uploads/files/...
 */

const baseUrl = (process.env.LIVE_BASE_URL || "").trim().replace(/\/$/, "");
const wallet = (
  process.env.LIVE_WALLET || "0x1111111111111111111111111111111111111111"
).trim();
const explicitVideoUrl = (process.env.LIVE_VIDEO_URL || "").trim();

if (!baseUrl) {
  console.error("smoke-live: set LIVE_BASE_URL, e.g. https://www.equilibrium-trading.xyz");
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function fetchJson(path, init) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep null
  }
  return { res, text, json };
}

async function fetchHead(url) {
  const res = await fetch(url, { method: "HEAD" });
  return res;
}

try {
  const health = await fetchJson("/health");
  assert(health.res.ok, `/health ${health.res.status}`);
  assert(health.json?.status === "ok", `/health body: ${health.text}`);
  console.log("smoke-live: ✓ /health");

  const debugDb = await fetchJson("/api/debug-db");
  assert(debugDb.res.ok, `/api/debug-db ${debugDb.res.status}`);
  assert(debugDb.json?.status === "Connected", `/api/debug-db body: ${debugDb.text}`);
  console.log("smoke-live: ✓ /api/debug-db");

  const sync = await fetchJson("/api/user/sync", {
    headers: {
      "x-wallet-address": wallet,
      Authorization: `Bearer ${wallet}`,
    },
  });
  assert(sync.res.ok, `/api/user/sync ${sync.res.status} :: ${sync.text}`);
  assert(sync.json?.wallet?.toLowerCase?.() === wallet.toLowerCase(), `/api/user/sync body: ${sync.text}`);
  console.log("smoke-live: ✓ /api/user/sync");

  const status = await fetchJson(`/api/user-status/${encodeURIComponent(wallet)}`);
  assert(status.res.ok, `/api/user-status ${status.res.status} :: ${status.text}`);
  assert(typeof status.json?.tier === "string", `/api/user-status body: ${status.text}`);
  console.log("smoke-live: ✓ /api/user-status/:wallet");

  const journal = await fetchJson("/api/trade-journal/config");
  assert(journal.res.ok, `/api/trade-journal/config ${journal.res.status}`);
  assert(journal.json?.persistedToVault === true, `/api/trade-journal/config body: ${journal.text}`);
  console.log("smoke-live: ✓ /api/trade-journal/config");

  const videos = await fetchJson("/api/videos");
  assert(videos.res.ok, `/api/videos ${videos.res.status}`);
  assert(Array.isArray(videos.json), `/api/videos body: ${videos.text}`);
  console.log(`smoke-live: ✓ /api/videos (${videos.json.length} items)`);

  const videoUrl =
    explicitVideoUrl ||
    (Array.isArray(videos.json) && videos.json[0] && typeof videos.json[0].videoPath === "string"
      ? videos.json[0].videoPath
      : "");
  if (videoUrl) {
    const head = await fetchHead(videoUrl);
    assert(head.ok, `HEAD ${videoUrl} ${head.status}`);
    const contentType = head.headers.get("content-type") || "";
    assert(contentType.includes("video/"), `video content-type missing: ${contentType}`);
    console.log("smoke-live: ✓ lesson video URL");
  } else {
    console.log("smoke-live: ! no lesson video URL to check");
  }

  console.log("\nsmoke-live: all checks passed");
} catch (error) {
  console.error("smoke-live: FAILED -", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
