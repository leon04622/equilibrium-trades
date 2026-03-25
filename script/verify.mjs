/**
 * Smoke-test production bundle: spawn dist/index.cjs, hit critical routes, exit.
 * Usage: npm run build && node script/verify.mjs
 * Env: VERIFY_PORT (optional, default random 56100–56999)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(root, "dist", "index.cjs");

if (!existsSync(distEntry)) {
  console.error("verify: missing dist/index.cjs — run npm run build first");
  process.exit(1);
}

const port = Number(
  process.env.VERIFY_PORT || 56100 + Math.floor(Math.random() * 900)
);
const base = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, [distEntry], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "production",
    DATABASE_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderrBuf = "";
child.stderr?.on("data", (c) => {
  stderrBuf += String(c);
  if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-4000);
});

async function waitHealth(maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("server did not respond on /health in time");
}

function stopChild() {
  if (child.exitCode !== null || child.signalCode) return;
  try {
    child.kill(process.platform === "win32" ? undefined : "SIGTERM");
  } catch {
    /* ignore */
  }
}

process.on("SIGINT", () => {
  stopChild();
  process.exit(130);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await waitHealth();

  const h = await fetch(`${base}/health`);
  if (!h.ok) throw new Error(`/health ${h.status}`);
  const hj = await h.json();
  if (hj.status !== "ok") throw new Error(`/health body: ${JSON.stringify(hj)}`);
  console.log("verify: ✓ GET /health");

  const sc = await fetch(`${base}/api/stripe/config`);
  if (!sc.ok) throw new Error(`/api/stripe/config ${sc.status}`);
  const scj = await sc.json();
  if (!("publishableKey" in scj))
    throw new Error(`/api/stripe/config missing publishableKey`);
  console.log("verify: ✓ GET /api/stripe/config");

  const tk = await fetch(`${base}/api/hyperliquid/tickers`);
  if (!tk.ok) throw new Error(`/api/hyperliquid/tickers ${tk.status}`);
  const tickers = await tk.json();
  if (!Array.isArray(tickers) || tickers.length < 10)
    throw new Error(`tickers expected array length >= 10, got ${tickers?.length}`);
  console.log(`verify: ✓ GET /api/hyperliquid/tickers (${tickers.length} markets)`);

  const mk = await fetch(`${base}/api/market/BTC`);
  if (!mk.ok) throw new Error(`/api/market/BTC ${mk.status}`);
  const mkj = await mk.json();
  if (typeof mkj.currentPrice !== "number")
    throw new Error(`/api/market/BTC missing currentPrice`);
  console.log("verify: ✓ GET /api/market/BTC");

  const cd = await fetch(`${base}/api/hyperliquid/candles/BTC?interval=5m&limit=5`);
  if (!cd.ok) throw new Error(`/api/hyperliquid/candles/BTC ${cd.status}`);
  const candles = await cd.json();
  if (!Array.isArray(candles) || candles.length < 1)
    throw new Error("candles expected non-empty array");
  console.log("verify: ✓ GET /api/hyperliquid/candles/BTC");

  const idx = await fetch(`${base}/`);
  if (!idx.ok) throw new Error(`GET / ${idx.status}`);
  console.log("verify: ✓ GET / (static)");

  console.log("\nverify: all checks passed");
  process.exitCode = 0;
} catch (e) {
  console.error("verify: FAILED —", e?.message || e);
  if (stderrBuf.trim()) console.error("--- server stderr (tail) ---\n", stderrBuf.slice(-2000));
  process.exitCode = 1;
} finally {
  stopChild();
  child.stdout?.destroy?.();
  child.stderr?.destroy?.();
  await sleep(500);
}
process.exit(process.exitCode ?? 1);
