import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerLocalUploadRoutes } from "./local-upload-routes";
import { analyzePatterns, getMarketCondition } from "./pattern-detection";
import { 
  getAvailableCoins, 
  getAllTickers,
  getSpotTickers,
  getOrderBook, 
  getRecentTrades,
  getCandles,
  getPerpExchangeAggregates,
} from "./hyperliquid";
import { scanForSignals, getSMAStatus } from "./sma-detection";
import {
  scanForEducationalPatterns,
  type EducationalPatternSignal,
  type PatternScanMeta,
} from "./universal-scanner";
import { gradeTrade } from "./trade-grading";
import { stripeService } from "./stripeService";
import { getStripePublishableKey, getUncachableStripeClient } from "./stripeClient";
import { getPublicAppBaseUrl } from "./public-url";
import { isAdminAddress } from "./admin-access";
import {
  requireMasterAdminWallet,
  isMasterAdminAddress,
  getMasterAdminAddress,
  resolveWalletAddressFromRequest,
} from "./master-admin";
import { issueCommandCenterWsToken } from "./command-center-ws-token";
import { pushAdminLog } from "./admin-log-bus";
import {
  tryConnectMongoVault,
  upsertMongoCrmUserFromWallet,
  fetchMongoCrmSubscriptionSnapshot,
  fetchMongoScannerWatchlistPrefs,
  upsertMongoScannerWatchlistPrefs,
  getVaultDb,
  type MongoVaultHandle,
} from "./mongo-vault";
import {
  buildGlobalScannerTickerList,
  getScannerHealthSnapshot,
  getScannerHealthMonitoringEnabled,
  setScannerHealthMonitoringEnabled,
  GLOBAL_SCANNER_GOLD_PROXY_INFO,
} from "./global-scanner";
import { getDefaultPatternScanTickerList } from "./scanner-controller";
import {
  createAdminEquilibriumChallenge,
  verifyAdminEquilibriumSignature,
  validateAdminEquilibriumToken,
  revokeAdminEquilibriumToken,
  getMasterAdminWallet,
} from "./admin-equilibrium-auth";
import { SCAN_ALL_TIMEFRAMES } from "@shared/scan-timeframes";
import { isFortressSovereignAddress } from "./fortress-admin";
import {
  tradeJournalCreateBodySchema,
  tradeJournalNotesBodySchema,
  tradeJournalCloseOpenBodySchema,
} from "@shared/schema";
import {
  insertTradeJournalEntry,
  listTradeJournalEntries,
  updateTradeJournalNotes,
  closeLatestOpenJournalEntry,
  getTradeJournalStats,
  isTradeJournalBackedByMongo,
} from "./trade-journal-store";

let mongoVaultHandle: MongoVaultHandle | null = null;

const PATTERN_SCAN_CACHE_TTL_MS = 90_000;
const PATTERN_SCAN_CACHE_MAX_KEYS = 8;
type PatternScanCacheEntry = {
  patterns: EducationalPatternSignal[];
  meta: PatternScanMeta;
  at: number;
  coins: string[];
  source: "query" | "watchlist" | "universe";
  volumeCapMax: number | null;
};

const patternScanResultCache = new Map<string, PatternScanCacheEntry>();

function patternScanCoinsPreview(coins: string[]): string {
  const max = 24;
  if (coins.length === 0) return "";
  if (coins.length <= max) return coins.join(",");
  return `${coins.slice(0, max).join(",")},+${coins.length - max}more`;
}

function patternVolumeCapMax(): number | null {
  const enforce = process.env.PATTERN_SCAN_ENFORCE_MAX_COINS === "1";
  const n = parseInt(process.env.PATTERN_SCAN_MAX_COINS || "", 10);
  if (enforce && Number.isFinite(n) && n > 0) return n;
  return null;
}

function setPatternScanInsightHeaders(
  res: Response,
  opts: {
    coins: string[];
    source: "query" | "watchlist" | "universe";
    volumeCapMax: number | null;
    meta: PatternScanMeta;
    cached: boolean;
  },
): void {
  res.setHeader("X-Pattern-Scan-Coins", String(opts.meta.coinCount));
  res.setHeader("X-Pattern-Scan-Duration-Ms", String(opts.meta.durationMs));
  res.setHeader("X-Pattern-Scan-Signals", String(opts.meta.signalCount));
  res.setHeader("X-Pattern-Scan-Cached", opts.cached ? "1" : "0");
  res.setHeader("X-Pattern-Scan-Source", opts.source);
  res.setHeader("X-Pattern-Scan-Coins-Preview", patternScanCoinsPreview(opts.coins));
  if (opts.volumeCapMax != null) {
    res.setHeader("X-Pattern-Scan-Volume-Cap", String(opts.volumeCapMax));
  }
}

function patternScanCacheKey(walletKey: string, coinsParam: string, coins: string[], timeframes: string[]): string {
  const coinPart = coinsParam.trim() || [...coins].sort().join(",");
  const tfPart = [...timeframes].sort().join(",");
  return `${walletKey}|${coinPart}|${tfPart}`;
}

function prunePatternScanCache(): void {
  const now = Date.now();
  for (const [k, v] of patternScanResultCache) {
    if (now - v.at > PATTERN_SCAN_CACHE_TTL_MS) patternScanResultCache.delete(k);
  }
  while (patternScanResultCache.size > PATTERN_SCAN_CACHE_MAX_KEYS) {
    let oldestK: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of patternScanResultCache) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestK = k;
      }
    }
    if (oldestK) patternScanResultCache.delete(oldestK);
    else break;
  }
}

function crmTierLabel(tier: string | undefined): "Free" | "Pro" | "Mentor" {
  const t = (tier || "free").toLowerCase();
  if (t === "mentoring" || t === "elite") return "Mentor";
  if (t === "pro") return "Pro";
  return "Free";
}

function crmStatusFromSubscriptionRow(u: {
  subscriptionTier: string;
  subscriptionActive: boolean;
  subscriptionExpiresAt: Date | null;
}): "Active" | "Expired" {
  const t = (u.subscriptionTier || "free").toLowerCase();
  if (t === "free") return "Active";
  const exp = u.subscriptionExpiresAt;
  const expMs = exp instanceof Date ? exp.getTime() : NaN;
  const expOk = !Number.isFinite(expMs) || expMs > Date.now();
  return u.subscriptionActive && expOk ? "Active" : "Expired";
}

async function syncWalletUserToMongoCrm(walletAddress: string): Promise<void> {
  try {
    const u = await storage.getWalletUser(walletAddress);
    if (u) await upsertMongoCrmUserFromWallet(u);
  } catch (e) {
    console.error("[routes] Mongo CRM user sync:", e);
  }
}

type WalletSubscriptionPayload = {
  tier: "free" | "pro" | "mentoring" | "elite";
  active: boolean;
  expiresAt: string | null;
  subTier: string;
};

function mongoSubscriptionSnapshotToPayload(
  mongo: NonNullable<Awaited<ReturnType<typeof fetchMongoCrmSubscriptionSnapshot>>>,
): WalletSubscriptionPayload {
  const t = mongo.subscriptionTier.toLowerCase();
  let tier: "free" | "pro" | "mentoring" | "elite" = "free";
  if (t === "pro") tier = "pro";
  else if (t === "mentoring" || t === "elite") tier = "mentoring";
  const exp = mongo.subscriptionExpiresAt;
  const expMs = exp instanceof Date ? exp.getTime() : NaN;
  const expOk = !Number.isFinite(expMs) || expMs > Date.now();
  if (mongo.manualProOverride && tier !== "free") {
    return {
      tier,
      active: true,
      expiresAt: exp instanceof Date ? exp.toISOString() : null,
      subTier: mongo.subTier,
    };
  }
  const active = mongo.subscriptionActive && tier !== "free" && expOk;
  return {
    tier,
    active,
    expiresAt: exp instanceof Date ? exp.toISOString() : null,
    subTier: mongo.subTier,
  };
}

function tierRank(t: WalletSubscriptionPayload["tier"]): number {
  if (t === "mentoring" || t === "elite") return 3;
  if (t === "pro") return 2;
  return 1;
}

/** Prefer highest paid tier among Stripe, Postgres, and Mongo CRM (admin grants must not be ignored). */
function pickBestPaidSubscriptionPayload(
  candidates: (WalletSubscriptionPayload | null | undefined)[],
): WalletSubscriptionPayload | null {
  const paid = candidates.filter(
    (c): c is WalletSubscriptionPayload =>
      !!c && c.active && tierRank(c.tier) >= 2,
  );
  if (paid.length === 0) return null;
  paid.sort((a, b) => tierRank(b.tier) - tierRank(a.tier));
  return paid[0];
}

function subscriptionPayloadFromPostgresUser(
  user: NonNullable<Awaited<ReturnType<typeof storage.getWalletUser>>>,
): WalletSubscriptionPayload | null {
  if (user.manualProOverride && user.subscriptionTier !== "free") {
    return {
      tier: user.subscriptionTier as "pro" | "mentoring" | "elite",
      active: true,
      expiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
      subTier: crmTierLabel(user.subscriptionTier),
    };
  }
  if (user.subscriptionActive && user.subscriptionTier !== "free") {
    const exp = user.subscriptionExpiresAt;
    const expMs = exp instanceof Date ? exp.getTime() : NaN;
    const expOk = !Number.isFinite(expMs) || expMs > Date.now();
    if (!expOk) return null;
    return {
      tier: user.subscriptionTier as "pro" | "mentoring" | "elite",
      active: true,
      expiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
      subTier: crmTierLabel(user.subscriptionTier),
    };
  }
  return null;
}

const FREE_WALLET_SUBSCRIPTION_PAYLOAD: WalletSubscriptionPayload = {
  tier: "free",
  active: false,
  expiresAt: null,
  subTier: "Free",
};

/** Single source of truth for subscription UI — merges Stripe, Postgres, and Mongo CRM. */
async function buildWalletSubscriptionPayload(walletAddressRaw: string): Promise<WalletSubscriptionPayload> {
  let walletAddress = walletAddressRaw.trim();
  try {
    walletAddress = decodeURIComponent(walletAddress);
  } catch {
    /* ignore */
  }
  walletAddress = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) {
    return FREE_WALLET_SUBSCRIPTION_PAYLOAD;
  }

  if (isAdminAddress(walletAddress)) {
    return { tier: "mentoring", active: true, expiresAt: null, subTier: "Mentor" };
  }

  const mongoSnap = await fetchMongoCrmSubscriptionSnapshot(walletAddress);
  const mongoPayload = mongoSnap ? mongoSubscriptionSnapshotToPayload(mongoSnap) : null;

  const stripeSubscription = await stripeService.getActiveSubscriptionByWalletAddress(walletAddress);
  if (stripeSubscription) {
    const u = await storage.getWalletUser(walletAddress);
    if (u && (u.subscriptionTier !== stripeSubscription.tier || !u.subscriptionActive)) {
      await storage.updateWalletUserSubscription(
        walletAddress,
        stripeSubscription.tier,
        true,
        stripeSubscription.expiresAt ? new Date(stripeSubscription.expiresAt) : null,
      );
    }
    void syncWalletUserToMongoCrm(walletAddress);
  }

  const user = await storage.getWalletUser(walletAddress);
  const pgPayload = user ? subscriptionPayloadFromPostgresUser(user) : null;

  const stripePayload = stripeSubscription
    ? {
        tier: stripeSubscription.tier,
        active: !!stripeSubscription.active,
        expiresAt: stripeSubscription.expiresAt ?? null,
        subTier: crmTierLabel(stripeSubscription.tier),
      }
    : null;

  const best = pickBestPaidSubscriptionPayload([stripePayload, pgPayload, mongoPayload]);
  if (best) return best;

  if (user) {
    return {
      tier: "free",
      active: false,
      expiresAt: null,
      subTier: crmTierLabel(user.subscriptionTier ?? undefined),
    };
  }
  if (mongoSnap) {
    return { tier: "free", active: false, expiresAt: null, subTier: mongoSnap.subTier };
  }
  return { tier: "free", active: false, expiresAt: null, subTier: crmTierLabel("free") };
}

function parseAdminNewTierInput(raw: string): {
  subscriptionTier: "free" | "pro" | "mentoring" | "elite";
  subscriptionActive: boolean;
  manualProOverride: boolean;
} | null {
  const s = raw.trim().toLowerCase();
  if (s === "free" || s === "none") {
    return { subscriptionTier: "free", subscriptionActive: false, manualProOverride: false };
  }
  if (s === "pro" || s === "50") {
    return { subscriptionTier: "pro", subscriptionActive: true, manualProOverride: true };
  }
  if (s === "mentor" || s === "mentoring" || s === "500" || s === "elite") {
    return { subscriptionTier: "mentoring", subscriptionActive: true, manualProOverride: true };
  }
  return null;
}

async function persistUserAccessTier(
  paramWallet: string,
  subscriptionTier: "free" | "pro" | "mentoring" | "elite",
  subscriptionActive: boolean,
  expiresAt: Date | null,
  manualProOverride: boolean,
) {
  const normalized = paramWallet.trim().toLowerCase();
  let user = await storage.getWalletUser(normalized);
  if (!user) {
    await storage.createWalletUser({
      walletAddress: normalized,
      subscriptionTier,
      subscriptionActive,
      builderCodeApproved: false,
      manualProOverride,
    });
  }
  await storage.updateWalletUserSubscription(
    normalized,
    subscriptionTier,
    subscriptionActive,
    expiresAt,
  );
  await storage.setManualProOverride(normalized, manualProOverride);
  user = await storage.getWalletUser(normalized);
  if (!user) {
    throw new Error(`persistUserAccessTier: no row after upsert for ${normalized}`);
  }
  await syncWalletUserToMongoCrm(normalized);
  return user;
}

// ── Simple in-memory cache ──
interface CacheEntry { data: any; expires: number; }
const cache = new Map<string, CacheEntry>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) return Promise.resolve(entry.data as T);
  return fn().then(data => {
    cache.set(key, { data, expires: Date.now() + ttlMs });
    return data;
  });
}

function canViewTradeJournalTarget(req: Request, targetWallet: string): boolean {
  const t = targetWallet.trim().toLowerCase();
  const self = resolveWalletAddressFromRequest(req)?.trim().toLowerCase();
  if (self && self === t) return true;
  return requireMasterAdminWallet(req).ok;
}

async function resolveScanCoins(coinsParam?: string): Promise<string[]> {
  if (coinsParam?.trim()) {
    return coinsParam.split(",").map((c) => c.trim()).filter(Boolean);
  }
  let list = await buildGlobalScannerTickerList();
  if (list.length === 0) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      list = await buildGlobalScannerTickerList();
      if (list.length > 0) break;
    }
  }
  if (list.length === 0) {
    try {
      const meta = await getAvailableCoins();
      const perps = (meta.universe || [])
        .map((u: { name?: string }) => String(u.name || "").trim())
        .filter(Boolean);
      if (perps.length > 0) {
        list = [...new Set(perps)].sort((a, b) => a.localeCompare(b));
      }
    } catch {
      /* keep trying fallbacks */
    }
  }
  if (list.length === 0) {
    list = getDefaultPatternScanTickerList();
    console.warn("[pattern-scan] HL universe still empty after retries — using default ticker list (DB-independent)");
  }
  const maxCoins = parseInt(process.env.PATTERN_SCAN_MAX_COINS || "", 10);
  const enforceMax = process.env.PATTERN_SCAN_ENFORCE_MAX_COINS === "1";
  if (enforceMax && Number.isFinite(maxCoins) && maxCoins > 0 && list.length > maxCoins) {
    try {
      const tickers = await getAllTickers();
      const vol = new Map(tickers.map((t) => [t.coin, parseFloat(t.dayNtlVlm || "0")]));
      list = [...list].sort((a, b) => (vol.get(b) ?? 0) - (vol.get(a) ?? 0)).slice(0, maxCoins);
      console.warn(
        `[pattern-scan] PATTERN_SCAN_ENFORCE_MAX_COINS=1 active — scanning top ${maxCoins} by 24h volume only (often BTC-heavy).`,
      );
    } catch {
      /* keep full list */
    }
  }
  return list;
}

/** POST /api/videos and POST /api/admin/videos — sovereign wallet only (`x-wallet-address` or Bearer wallet). */
async function persistCommandCenterVideo(req: Request, res: Response): Promise<void> {
  if (mongoVaultHandle) {
    return mongoVaultHandle.handlePostVideo(req, res);
  }
  const walletAddress = resolveWalletAddressFromRequest(req)?.trim();
  if (!walletAddress) {
    res.status(401).json({ error: "x-wallet-address or Authorization: Bearer <0x…> required" });
    return;
  }
  if (!isFortressSovereignAddress(walletAddress)) {
    res.status(403).json({ error: "Sovereign admin wallet required" });
    return;
  }
  try {
    const { adminVideoCreateSchema } = await import("@shared/schema");
    const parsed = adminVideoCreateSchema.safeParse(
      req.body && typeof req.body === "object" ? req.body : {},
    );
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    const row = parsed.data;
    if (!row.youtubeId?.trim() && !row.videoPath?.trim()) {
      res.status(400).json({ error: "Could not resolve video URL (YouTube, Vimeo, or direct link)" });
      return;
    }
    const video = await storage.createVideo({
      title: row.title,
      description: row.description,
      duration: row.duration,
      category: row.category,
      youtubeId: row.youtubeId ?? null,
      videoPath: row.videoPath ?? null,
      thumbnailPath: row.thumbnailPath ?? null,
      academySection: row.academySection,
    });
    res.json(video);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("POST /api/videos (unified):", error);
    res.status(500).json({ error: "Failed to create video", detail });
  }
}

async function deleteCommandCenterVideo(req: Request, res: Response): Promise<void> {
  if (mongoVaultHandle) {
    return mongoVaultHandle.handleDeleteVideo(req, res);
  }
  const walletAddress = resolveWalletAddressFromRequest(req)?.trim();
  if (!walletAddress) {
    res.status(401).json({ error: "x-wallet-address or Authorization: Bearer <0x…> required" });
    return;
  }
  if (!isFortressSovereignAddress(walletAddress)) {
    res.status(403).json({ error: "Sovereign admin wallet required" });
    return;
  }
  try {
    const deleted = await storage.deleteVideo(req.params.id);
    if (deleted) res.json({ success: true });
    else res.status(404).json({ error: "Video not found" });
  } catch (error) {
    console.error("DELETE /api/videos/:id:", error);
    res.status(500).json({ error: "Failed to delete video" });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  mongoVaultHandle = await tryConnectMongoVault();

  app.get("/api/wallet/is-admin", async (req: Request, res: Response) => {
    const walletAddress = req.headers["x-wallet-address"] as string | undefined;
    res.json({
      isAdmin: isFortressSovereignAddress(walletAddress),
    });
  });

  // Register OpenAI chat routes
  registerChatRoutes(app);

  // Video/file uploads: always same-origin `uploads/videos` (avoids Replit GCS + browser CORS/sidecar issues).
  registerLocalUploadRoutes(app);

  // Get all subscription tiers
  app.get("/api/subscriptions", async (req: Request, res: Response) => {
    try {
      const tiers = await storage.getAllSubscriptionTiers();
      res.json(tiers);
    } catch (error) {
      console.error("Error fetching subscription tiers:", error);
      res.status(500).json({ error: "Failed to fetch subscription tiers" });
    }
  });

  // Get single subscription tier
  app.get("/api/subscriptions/:id", async (req: Request, res: Response) => {
    try {
      const tier = await storage.getSubscriptionTier(req.params.id);
      if (!tier) {
        return res.status(404).json({ error: "Subscription tier not found" });
      }
      res.json(tier);
    } catch (error) {
      console.error("Error fetching subscription tier:", error);
      res.status(500).json({ error: "Failed to fetch subscription tier" });
    }
  });

  // Get active detected patterns
  app.get("/api/patterns/active", async (req: Request, res: Response) => {
    try {
      const patterns = await storage.getActivePatterns();
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching active patterns:", error);
      res.status(500).json({ error: "Failed to fetch active patterns" });
    }
  });

  // Get patterns by symbol
  app.get("/api/patterns/symbol/:symbol", async (req: Request, res: Response) => {
    try {
      // Normalize symbol to ticker only (remove exchange prefix)
      const symbol = req.params.symbol.includes(":") 
        ? req.params.symbol.split(":")[1] 
        : req.params.symbol;
      const patterns = await storage.getPatternsBySymbol(symbol);
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching patterns by symbol:", error);
      res.status(500).json({ error: "Failed to fetch patterns" });
    }
  });

  // Get recent SMA signals
  app.get("/api/signals/sma", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const signals = await storage.getRecentSmaSignals(limit);
      res.json(signals);
    } catch (error) {
      console.error("Error fetching SMA signals:", error);
      res.status(500).json({ error: "Failed to fetch SMA signals" });
    }
  });

  // AI Pattern Detection endpoint - streaming
  app.post("/api/detect-patterns", async (req: Request, res: Response) => {
    try {
      const { symbol, timeframe, priceData } = req.body;

      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Use AI to analyze patterns
      const patterns = await analyzePatterns(symbol, timeframe || "1m", priceData);

      // Stream the results and store validated patterns
      for (const pattern of patterns) {
        res.write(`data: ${JSON.stringify({ type: "pattern", data: pattern })}\n\n`);
        
        // Only store patterns that have valid required fields and reasonable confidence
        if (
          pattern.patternId &&
          pattern.confidence >= 50 && 
          pattern.confidence <= 100
        ) {
          try {
            // Normalize symbol to ticker only (remove exchange prefix like "BINANCE:")
            const normalizedSymbol = symbol.includes(":") ? symbol.split(":")[1] : symbol;
            const patternData: any = {
              patternId: pattern.patternId,
              symbol: normalizedSymbol,
              timeframe: timeframe || "1m",
              confidence: pattern.confidence,
              status: pattern.confidence >= 70 ? "confirmed" : "forming",
            };
            // Only add optional fields if they have valid values
            if (typeof pattern.entryPrice === 'number') patternData.entryPrice = pattern.entryPrice;
            if (typeof pattern.stopLoss === 'number') patternData.stopLoss = pattern.stopLoss;
            if (typeof pattern.takeProfit === 'number') patternData.takeProfit = pattern.takeProfit;
            
            await storage.createDetectedPattern(patternData);
          } catch (storageError) {
            console.error("Error storing pattern:", storageError);
          }
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done", count: patterns.length })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error detecting patterns:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Pattern detection failed" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Pattern detection failed" });
      }
    }
  });

  // Get market condition (SMA analysis)
  app.get("/api/market/:symbol", async (req: Request, res: Response) => {
    try {
      const condition = await getMarketCondition(req.params.symbol);
      res.json(condition);
    } catch (error) {
      console.error("Error fetching market condition:", error);
      res.status(500).json({ error: "Failed to fetch market condition" });
    }
  });

  // Create SMA signal
  app.post("/api/signals/sma", async (req: Request, res: Response) => {
    try {
      const signal = await storage.createSmaSignal(req.body);
      res.status(201).json(signal);
    } catch (error) {
      console.error("Error creating SMA signal:", error);
      res.status(500).json({ error: "Failed to create SMA signal" });
    }
  });

  // Update pattern status
  app.patch("/api/patterns/:id/status", async (req: Request, res: Response) => {
    try {
      const { status, outcome } = req.body;
      const pattern = await storage.updatePatternStatus(req.params.id, status, outcome);
      if (!pattern) {
        return res.status(404).json({ error: "Pattern not found" });
      }
      res.json(pattern);
    } catch (error) {
      console.error("Error updating pattern status:", error);
      res.status(500).json({ error: "Failed to update pattern status" });
    }
  });

  // ============ HYPERLIQUID API ROUTES ============

  // Get available coins from Hyperliquid — cached 60 s (coin list changes rarely)
  app.get("/api/hyperliquid/coins", async (_req: Request, res: Response) => {
    try {
      const meta = await cached("hl:coins", 60_000, () => getAvailableCoins());
      res.json(meta.universe);
    } catch (error) {
      console.error("Error fetching Hyperliquid coins:", error);
      res.status(500).json({ error: "Failed to fetch coins" });
    }
  });

  // Get all tickers with prices (perps + spot) — cached 3 s
  app.get("/api/hyperliquid/tickers", async (_req: Request, res: Response) => {
    try {
      const [perpTickers, spotTickers] = await cached("hl:tickers", 3_000, () =>
        Promise.all([getAllTickers(), getSpotTickers()])
      );
      res.json([...perpTickers, ...spotTickers]);
    } catch (error) {
      console.error("Error fetching Hyperliquid tickers:", error);
      res.status(500).json({ error: "Failed to fetch tickers" });
    }
  });

  // Get order book for a coin
  app.get("/api/hyperliquid/orderbook/:coin", async (req: Request, res: Response) => {
    try {
      const orderBook = await getOrderBook(req.params.coin);
      if (!orderBook) {
        return res.json({ coin: req.params.coin, levels: [[], []] });
      }
      res.json(orderBook);
    } catch (error) {
      console.error("Error fetching order book:", error);
      res.status(502).json({ error: "Upstream API unavailable" });
    }
  });

  // Get recent trades for a coin
  app.get("/api/hyperliquid/trades/:coin", async (req: Request, res: Response) => {
    try {
      const trades = await getRecentTrades(req.params.coin);
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  // Get candle data for a coin
  app.get("/api/hyperliquid/candles/:coin", async (req: Request, res: Response) => {
    try {
      const { interval, startTime, endTime, limit } = req.query;
      const parsedLimit = limit != null && limit !== "" ? parseInt(String(limit), 10) : NaN;
      const effectiveLimit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 5000)
        : 200;
      const candles = await getCandles(
        req.params.coin,
        (interval as string) || "1m",
        startTime ? parseInt(startTime as string) : undefined,
        endTime ? parseInt(endTime as string) : undefined,
        effectiveLimit,
      );
      res.json(candles);
    } catch (error) {
      console.error("Error fetching candles:", error);
      res.status(500).json({ error: "Failed to fetch candles" });
    }
  });

  // Pre-warm all timeframes for a coin (fire-and-forget, so switching timeframes is instant)
  app.post("/api/hyperliquid/candles/:coin/prewarm", async (req: Request, res: Response) => {
    const coin = req.params.coin;
    const ALL_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"];
    // Fire all in parallel, don't await — respond immediately
    Promise.all(ALL_INTERVALS.map(tf => getCandles(coin, tf))).catch(() => {});
    res.json({ ok: true });
  });

  // ============ EDUCATIONAL PATTERN SCANNER ============

  // Scan for educational patterns (no entry/SL/TP — for learning)
  app.get("/api/signals/patterns", async (req: Request, res: Response) => {
    try {
      const coinsParam = req.query.coins as string;
      const timeframesParam = req.query.timeframes as string;
      const wallet = resolveWalletAddressFromRequest(req)?.trim();
      const skipCache = req.query.nocache === "1" || req.query.nocache === "true";

      // Always scan full HL perps + active spot unless `coins` query explicitly lists symbols.
      // (CRM watchlist prefs no longer narrow the scanner — avoids accidental 3-coin scans.)
      let scanSource: "query" | "watchlist" | "universe" = "universe";
      let coins: string[];
      if (coinsParam?.trim()) {
        scanSource = "query";
        coins = coinsParam.split(",").map((c) => c.trim()).filter(Boolean);
      } else {
        coins = await resolveScanCoins(undefined);
      }

      const volumeCapMax = scanSource === "universe" ? patternVolumeCapMax() : null;

      const timeframes = timeframesParam?.trim()
        ? timeframesParam.split(",").map((t) => t.trim()).filter(Boolean)
        : [...SCAN_ALL_TIMEFRAMES];

      const walletKey = wallet?.toLowerCase() ?? "anon";
      const cacheKey = patternScanCacheKey(walletKey, coinsParam || "", coins, timeframes);

      if (!skipCache) {
        prunePatternScanCache();
        const hit = patternScanResultCache.get(cacheKey);
        if (hit && Date.now() - hit.at <= PATTERN_SCAN_CACHE_TTL_MS) {
          setPatternScanInsightHeaders(res, {
            coins: hit.coins,
            source: hit.source,
            volumeCapMax: hit.volumeCapMax,
            meta: hit.meta,
            cached: true,
          });
          return res.json(hit.patterns);
        }
      }

      const { patterns, meta } = await scanForEducationalPatterns(coins, timeframes);
      if (!skipCache) {
        patternScanResultCache.set(cacheKey, {
          patterns,
          meta,
          at: Date.now(),
          coins,
          source: scanSource,
          volumeCapMax,
        });
        prunePatternScanCache();
      }
      setPatternScanInsightHeaders(res, {
        coins,
        source: scanSource,
        volumeCapMax,
        meta,
        cached: false,
      });
      res.json(patterns);
    } catch (error) {
      console.error("Error scanning for educational patterns:", error);
      res.status(500).json({ error: "Failed to scan for patterns" });
    }
  });

  /** Full HL perp + active spot list for pattern scanner watchlist UI */
  app.get("/api/scanner/markets", async (_req: Request, res: Response) => {
    try {
      let tickers = await buildGlobalScannerTickerList();
      if (tickers.length === 0) {
        tickers = getDefaultPatternScanTickerList();
      }
      res.json({ tickers, goldNote: GLOBAL_SCANNER_GOLD_PROXY_INFO });
    } catch (error) {
      console.error("Error building scanner markets list:", error);
      res.status(500).json({ error: "Failed to load markets" });
    }
  });

  app.get("/api/scanner/watchlist", async (req: Request, res: Response) => {
    const wallet = resolveWalletAddressFromRequest(req)?.trim();
    if (!wallet) {
      res.status(401).json({ error: "x-wallet-address or Authorization: Bearer <0x…> required" });
      return;
    }
    if (!getVaultDb()) {
      res.json({ allMarkets: true, coins: [], mongoConfigured: false });
      return;
    }
    const prefs = await fetchMongoScannerWatchlistPrefs(wallet);
    if (!prefs) {
      res.json({ allMarkets: true, coins: [], mongoConfigured: true });
      return;
    }
    res.json({
      allMarkets: prefs.allMarkets,
      coins: prefs.coins,
      mongoConfigured: true,
    });
  });

  app.patch("/api/scanner/watchlist", async (req: Request, res: Response) => {
    const wallet = resolveWalletAddressFromRequest(req)?.trim();
    if (!wallet) {
      res.status(401).json({ error: "x-wallet-address or Authorization: Bearer <0x…> required" });
      return;
    }
    if (!getVaultDb()) {
      res.status(503).json({ error: "MongoDB vault not connected; cannot persist watchlist" });
      return;
    }
    const body = req.body as { allMarkets?: unknown; coins?: unknown };
    const allMarkets = body.allMarkets !== false;
    const coins = Array.isArray(body.coins)
      ? body.coins.map((c) => String(c).trim()).filter(Boolean)
      : [];
    if (!allMarkets && coins.length === 0) {
      res.status(400).json({ error: "Select at least one ticker when All Markets is off" });
      return;
    }
    const saved = await upsertMongoScannerWatchlistPrefs(wallet, { allMarkets, coins });
    if (!saved.ok) {
      res.status(503).json({ error: "Failed to save watchlist" });
      return;
    }
    res.json({ ok: true, allMarkets, coins });
  });

  app.get("/api/admin/scanner-health", async (req: Request, res: Response) => {
    const wallet = resolveWalletAddressFromRequest(req)?.trim();
    if (!isFortressSovereignAddress(wallet)) {
      res.status(403).json({ error: "Sovereign admin wallet required" });
      return;
    }
    res.json(getScannerHealthSnapshot());
  });

  app.post("/api/admin/scanner-health/monitoring", async (req: Request, res: Response) => {
    const wallet = resolveWalletAddressFromRequest(req)?.trim();
    if (!isFortressSovereignAddress(wallet)) {
      res.status(403).json({ error: "Sovereign admin wallet required" });
      return;
    }
    const enabled = Boolean((req.body as { enabled?: unknown })?.enabled);
    setScannerHealthMonitoringEnabled(enabled);
    res.json({ ok: true, enabled: getScannerHealthMonitoringEnabled() });
  });

  // ============ SMA CROSSOVER SIGNALS (Legacy) ============

  // Scan for real-time SMA crossover signals
  app.get("/api/signals/crossover", async (req: Request, res: Response) => {
    try {
      const coinsParam = req.query.coins as string;
      const timeframesParam = req.query.timeframes as string;

      const coins = await resolveScanCoins(coinsParam);
      const timeframes = timeframesParam?.trim()
        ? timeframesParam.split(",").map((t) => t.trim()).filter(Boolean)
        : [...SCAN_ALL_TIMEFRAMES];

      const signals = await scanForSignals(coins, timeframes);
      res.json(signals);
    } catch (error) {
      console.error("Error scanning for crossover signals:", error);
      res.status(500).json({ error: "Failed to scan for signals" });
    }
  });

  // Get SMA status for a specific coin
  app.get("/api/signals/sma-status/:coin", async (req: Request, res: Response) => {
    try {
      const timeframe = (req.query.timeframe as string) || "1m";
      const status = await getSMAStatus(req.params.coin, timeframe);
      
      if (!status) {
        return res.json({ 
          coin: req.params.coin, 
          error: "Not enough data for SMA calculation" 
        });
      }
      
      res.json({ coin: req.params.coin, timeframe, ...status });
    } catch (error) {
      console.error("Error getting SMA status:", error);
      res.status(500).json({ error: "Failed to get SMA status" });
    }
  });

  // ============ TRADE JOURNAL & GRADING ============

  // Get trade grades for a wallet
  app.get("/api/journal/trades/:walletAddress", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const trades = await storage.getTradeGrades(req.params.walletAddress, limit);
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trade grades:", error);
      res.status(500).json({ error: "Failed to fetch trade grades" });
    }
  });

  // Get weekly stats for a wallet
  app.get("/api/journal/weekly/:walletAddress", async (req: Request, res: Response) => {
    try {
      const stats = await storage.getWeeklyStats(req.params.walletAddress);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching weekly stats:", error);
      res.status(500).json({ error: "Failed to fetch weekly stats" });
    }
  });

  // Grade and save a trade
  app.post("/api/journal/grade", async (req: Request, res: Response) => {
    try {
      // Import and validate with Zod schema
      const { tradeGradeInputSchema } = await import("@shared/schema");
      
      // Parse numbers if they come as strings
      const body = {
        ...req.body,
        entryPrice: Number(req.body.entryPrice),
        exitPrice: Number(req.body.exitPrice),
        stopLoss: Number(req.body.stopLoss),
        takeProfit: Number(req.body.takeProfit),
        leverage: Number(req.body.leverage) || 1,
        size: Number(req.body.size) || 1,
      };
      
      const validated = tradeGradeInputSchema.safeParse(body);
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid input", details: validated.error.errors });
      }

      const gradedTrade = gradeTrade(validated.data);
      const saved = await storage.createTradeGrade(gradedTrade);
      res.json(saved);
    } catch (error) {
      console.error("Error grading trade:", error);
      res.status(500).json({ error: "Failed to grade trade" });
    }
  });

  // ── Professional Trade Journal (Mongo `trade_journal` via trade-journal-store; in-memory if no vault) ──

  app.get("/api/trade-journal/config", (_req: Request, res: Response) => {
    try {
      res.json({ persistedToVault: isTradeJournalBackedByMongo() });
    } catch (error) {
      console.error("GET /api/trade-journal/config:", error);
      res.status(500).json({ error: "Failed to read journal config" });
    }
  });

  app.post("/api/trade-journal/entries", async (req: Request, res: Response) => {
    try {
      const parsed = tradeJournalCreateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
        return;
      }
      const header = resolveWalletAddressFromRequest(req)?.trim().toLowerCase();
      const bodyWallet = parsed.data.walletAddress.trim().toLowerCase();
      if (!header || header !== bodyWallet) {
        res.status(401).json({ error: "x-wallet-address must match walletAddress in body" });
        return;
      }
      const openedAt = parsed.data.openedAt ? new Date(parsed.data.openedAt) : undefined;
      if (openedAt && Number.isNaN(openedAt.getTime())) {
        res.status(400).json({ error: "Invalid openedAt" });
        return;
      }
      const saved = await insertTradeJournalEntry({
        walletAddress: bodyWallet,
        pair: parsed.data.pair.trim(),
        coin: parsed.data.coin.trim(),
        side: parsed.data.side,
        entryPrice: parsed.data.entryPrice,
        size: parsed.data.size,
        stopLoss: parsed.data.stopLoss ?? null,
        takeProfit: parsed.data.takeProfit ?? null,
        leverage: parsed.data.leverage,
        patternStatusAtEntry: parsed.data.patternStatusAtEntry ?? null,
        openedAt,
      });
      res.json(saved);
    } catch (error) {
      console.error("POST /api/trade-journal/entries:", error);
      res.status(500).json({ error: "Failed to save journal entry" });
    }
  });

  app.get("/api/trade-journal/entries/:walletAddress", async (req: Request, res: Response) => {
    try {
      const target = req.params.walletAddress.trim().toLowerCase();
      if (!canViewTradeJournalTarget(req, target)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const limit = Math.min(parseInt(String(req.query.limit || "10000"), 10) || 10_000, 100_000);
      const rows = await listTradeJournalEntries(target, limit);
      res.json(rows);
    } catch (error) {
      console.error("GET /api/trade-journal/entries:", error);
      res.status(500).json({ error: "Failed to list journal entries" });
    }
  });

  app.get("/api/trade-journal/stats/:walletAddress", async (req: Request, res: Response) => {
    try {
      const target = req.params.walletAddress.trim().toLowerCase();
      if (!canViewTradeJournalTarget(req, target)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const stats = await getTradeJournalStats(target);
      res.json(stats);
    } catch (error) {
      console.error("GET /api/trade-journal/stats:", error);
      res.status(500).json({ error: "Failed to load journal stats" });
    }
  });

  app.patch("/api/trade-journal/entries/:id/notes", async (req: Request, res: Response) => {
    try {
      const header = resolveWalletAddressFromRequest(req)?.trim().toLowerCase();
      if (!header) {
        res.status(401).json({ error: "x-wallet-address required" });
        return;
      }
      const parsed = tradeJournalNotesBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
        return;
      }
      const updated = await updateTradeJournalNotes(header, req.params.id, parsed.data.notes);
      if (!updated) {
        res.status(404).json({ error: "Journal entry not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
      console.error("PATCH /api/trade-journal/entries/:id/notes:", error);
      res.status(500).json({ error: "Failed to update notes" });
    }
  });

  app.post("/api/trade-journal/close-open", async (req: Request, res: Response) => {
    try {
      const header = resolveWalletAddressFromRequest(req)?.trim().toLowerCase();
      if (!header) {
        res.status(401).json({ error: "x-wallet-address required" });
        return;
      }
      const parsed = tradeJournalCloseOpenBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
        return;
      }
      const closed = await closeLatestOpenJournalEntry({
        walletAddress: header,
        coin: parsed.data.coin.trim(),
        side: parsed.data.side,
        exitPrice: parsed.data.exitPrice,
        realizedPnl: parsed.data.realizedPnl,
      });
      res.json({ ok: true, closed });
    } catch (error) {
      console.error("POST /api/trade-journal/close-open:", error);
      res.status(500).json({ error: "Failed to close journal entry" });
    }
  });

  // Tutorial Videos API — explicit JSON shape so clients always receive camelCase fields.
  app.get("/api/videos", async (req: Request, res: Response) => {
    if (mongoVaultHandle) {
      return mongoVaultHandle.handleGetVideos(req, res);
    }
    try {
      const videos = await storage.getAllVideos();
      res.json(
        videos.map((v) => ({
          id: v.id,
          title: v.title,
          description: v.description,
          duration: v.duration ?? "",
          category: v.category,
          youtubeId: v.youtubeId ?? null,
          videoPath: v.videoPath ?? null,
          thumbnailPath: v.thumbnailPath ?? null,
          academySection: v.academySection ?? null,
          createdAt:
            v.createdAt instanceof Date
              ? v.createdAt.toISOString()
              : v.createdAt != null
                ? v.createdAt
                : null,
        })),
      );
    } catch (error) {
      console.error("Error fetching videos:", error);
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  /** Create vault lesson — JSON: title, category, videoUrl, optional description, thumbnailUrl. Master wallet only. */
  app.post("/api/videos", persistCommandCenterVideo);

  /** Backward-compatible alias for Command Center clients. */
  app.post("/api/admin/videos", persistCommandCenterVideo);

  app.delete("/api/admin/videos/:id", deleteCommandCenterVideo);

  app.delete("/api/videos/:id", deleteCommandCenterVideo);

  /** CRM projection for Command Center — sovereign wallet only. */
  app.get("/api/crm/users", async (req: Request, res: Response) => {
    if (mongoVaultHandle) {
      return mongoVaultHandle.handleGetCrmUsers(req, res);
    }
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      const rows = await storage.getAllWalletUsers();
      res.json(
        rows.map((u) => ({
          wallet: u.walletAddress,
          email: u.email ?? null,
          joinDate:
            u.createdAt instanceof Date
              ? u.createdAt.toISOString()
              : u.createdAt != null
                ? String(u.createdAt)
                : null,
          subTier: crmTierLabel(u.subscriptionTier),
          status: crmStatusFromSubscriptionRow({
            subscriptionTier: u.subscriptionTier,
            subscriptionActive: u.subscriptionActive,
            subscriptionExpiresAt: u.subscriptionExpiresAt,
          }),
          manualProOverride: u.manualProOverride ?? false,
          builderStatus: u.isBuilderLinked ? "Linked" : "Not linked",
        })),
      );
    } catch (e) {
      console.error("GET /api/crm/users:", e);
      res.status(500).json({ error: "Failed to fetch CRM users" });
    }
  });

  // ============ WALLET USER / HYPERLIQUID ONBOARDING ============

  // Get wallet user status (check if already registered)
  app.get("/api/wallet-user/:walletAddress", async (req: Request, res: Response) => {
    try {
      const user = await storage.getWalletUser(req.params.walletAddress);
      if (!user) {
        return res.json({ exists: false });
      }
      res.json({
        exists: true,
        builderCodeApproved: user.builderCodeApproved,
        isBuilderLinked: user.isBuilderLinked ?? false,
        email: user.email,
        createdAt: user.createdAt,
      });
    } catch (error) {
      console.error("Error fetching wallet user:", error);
      res.status(500).json({ error: "Failed to fetch wallet user" });
    }
  });

  // Register new wallet user
  app.post("/api/wallet-user/register", async (req: Request, res: Response) => {
    try {
      const { insertWalletUserSchema } = await import("@shared/schema");
      const validated = insertWalletUserSchema.safeParse(req.body);
      
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid input", details: validated.error.errors });
      }

      // Check if user already exists
      const existing = await storage.getWalletUser(validated.data.walletAddress);
      if (existing) {
        const emailIn = validated.data.email?.trim();
        if (emailIn) {
          try {
            const updated = await storage.updateWalletUserEmail(validated.data.walletAddress, emailIn);
            const finalUser = updated ?? existing;
            void syncWalletUserToMongoCrm(validated.data.walletAddress);
            return res.json({
              success: true,
              message: "User already registered; email updated for CRM.",
              user: finalUser,
            });
          } catch {
            /* fall through */
          }
        }
        void syncWalletUserToMongoCrm(validated.data.walletAddress);
        return res.json({
          success: true,
          message: "User already registered",
          user: existing,
        });
      }

      const user = await storage.createWalletUser(validated.data);
      void syncWalletUserToMongoCrm(validated.data.walletAddress);
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error registering wallet user:", error);
      res.status(500).json({ error: "Failed to register wallet user" });
    }
  });

  // Approve builder code (after signature verification)
  app.post("/api/wallet-user/approve-builder-code", async (req: Request, res: Response) => {
    try {
      const { builderCodeApprovalSchema } = await import("@shared/schema");
      const validated = builderCodeApprovalSchema.safeParse(req.body);
      
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid input", details: validated.error.errors });
      }

      const { walletAddress, signature, message } = validated.data;

      const { ethers } = await import("ethers");

      let normalizedWallet: string;
      try {
        normalizedWallet = ethers.getAddress(walletAddress).toLowerCase();
      } catch {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      const text = message.replace(/\r\n/g, "\n");
      const lines = text.split("\n");
      const checksummed = ethers.getAddress(walletAddress);
      if (lines[0] !== "Sign in to Equilibrium Trading" || lines[1] !== `Wallet: ${checksummed}`) {
        return res.status(400).json({ error: "Sign-in message does not match expected format" });
      }
      const tsMatch = /^Timestamp: (\d+)$/m.exec(text);
      if (!tsMatch) {
        return res.status(400).json({ error: "Invalid or missing timestamp in sign-in message" });
      }
      const ts = parseInt(tsMatch[1], 10);
      const skewMs = 24 * 60 * 60 * 1000;
      if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > skewMs) {
        return res.status(400).json({
          error: "Sign-in message expired or invalid timestamp — please try again",
        });
      }
      if (!text.includes("EQUILIBRIUM_BUILDER")) {
        return res.status(400).json({ error: "Sign-in message is missing builder authorization line" });
      }
      const requiredBuilder = "0xad9be64fd7a35d99a138b87cb212baefbcdcf045";
      if (!text.toLowerCase().includes(requiredBuilder)) {
        return res.status(400).json({
          error: "Sign-in message must include the Equilibrium Hyperliquid builder address",
        });
      }

      try {
        const recoveredAddress = ethers.verifyMessage(text, signature);
        const recoveredLower = ethers.getAddress(recoveredAddress).toLowerCase();
        if (recoveredLower !== normalizedWallet) {
          console.warn("Builder approval: recovered signer !== claimed wallet", {
            recovered: recoveredLower,
            claimed: normalizedWallet,
          });
          return res.status(400).json({
            error: "Wallet mismatch — the signature does not match the connected address.",
          });
        }
      } catch (sigError) {
        console.error("Signature verification error:", sigError);
        return res.status(400).json({
          error: "Invalid signature — try again or disconnect and reconnect your wallet.",
        });
      }

      // Check if user exists, create if not
      let user = await storage.getWalletUser(normalizedWallet);
      if (!user) {
        user = await storage.createWalletUser({
          walletAddress: normalizedWallet,
          builderCodeApproved: true,
        });
      } else {
        user = await storage.updateWalletUserApproval(normalizedWallet, true);
      }

      void syncWalletUserToMongoCrm(normalizedWallet);
      res.json({ 
        success: true, 
        message: "Builder code approved",
        user 
      });
    } catch (error) {
      console.error("Error approving builder code:", error);
      res.status(500).json({ error: "Failed to approve builder code" });
    }
  });

  /** CRM: record instant-trading (HL agent) handshake completion — called from client after session is ready. */
  app.post("/api/wallet-user/instant-trading-complete", async (req: Request, res: Response) => {
    try {
      const walletAddress = (req.headers["x-wallet-address"] as string | undefined)?.trim();
      if (!walletAddress) {
        return res.status(401).json({ error: "Wallet address required" });
      }
      const normalized = walletAddress.toLowerCase();
      const user = await storage.recordInstantTradingHandshake(normalized);
      void syncWalletUserToMongoCrm(normalized);
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error recording instant trading handshake:", error);
      res.status(500).json({ error: "Failed to record handshake" });
    }
  });

  /**
   * Lifetime first-trade handshake: Equilibrium sign-in + HL approveAgent + approveBuilderFee (client-side).
   * Sets `isBuilderLinked` for CRM / Mongo and aligns instant-trading flags.
   */
  app.post("/api/wallet-user/lifetime-handshake-complete", async (req: Request, res: Response) => {
    try {
      const walletAddress = (req.headers["x-wallet-address"] as string | undefined)?.trim();
      if (!walletAddress) {
        return res.status(401).json({ error: "Wallet address required" });
      }
      const normalized = walletAddress.toLowerCase();
      const user = await storage.recordLifetimeTradeHandshake(normalized);
      void syncWalletUserToMongoCrm(normalized);
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error recording lifetime trade handshake:", error);
      res.status(500).json({ error: "Failed to record handshake" });
    }
  });

  // Update wallet user email
  app.patch("/api/wallet-user/:walletAddress/email", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const { z } = await import("zod");
      
      const emailSchema = z.string().email();
      const validated = emailSchema.safeParse(email);
      
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const user = await storage.updateWalletUserEmail(req.params.walletAddress, email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      void syncWalletUserToMongoCrm(req.params.walletAddress);
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error updating wallet user email:", error);
      res.status(500).json({ error: "Failed to update email" });
    }
  });

  /** Postgres + Stripe + Mongo CRM — primary read for gating vault / signals after wallet connect. */
  app.get("/api/user-status/:walletAddress", async (req: Request, res: Response) => {
    try {
      const payload = await buildWalletSubscriptionPayload(req.params.walletAddress);
      res.json(payload);
    } catch (error) {
      console.error("GET /api/user-status:", error);
      res.status(500).json({ error: "Failed to load user status" });
    }
  });

  /** Legacy path — same effective data as `/api/user-status` (omits `subTier`). */
  app.get("/api/stripe/subscription/:walletAddress", async (req: Request, res: Response) => {
    try {
      const payload = await buildWalletSubscriptionPayload(req.params.walletAddress);
      res.json({
        tier: payload.tier,
        active: payload.active,
        expiresAt: payload.expiresAt,
      });
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ error: "Failed to fetch subscription status" });
    }
  });

  /** Master admin (env) or sovereign `0x1155…` — persists to Postgres + Mongo CRM. */
  app.patch("/api/admin/update-tier", async (req: Request, res: Response) => {
    try {
      const adminWallet = resolveWalletAddressFromRequest(req)?.trim();
      if (!adminWallet) {
        return res.status(401).json({ error: "Send x-wallet-address or Authorization: Bearer <0x…>" });
      }
      const master = requireMasterAdminWallet(req);
      if (!isFortressSovereignAddress(adminWallet) && !master.ok) {
        return res.status(master.status).json({ error: master.error });
      }

      const { adminUpdateTierBodySchema } = await import("@shared/schema");
      const parsed = adminUpdateTierBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      }
      const { walletAddress, newTier, accessExpires } = parsed.data;
      const mapped = parseAdminNewTierInput(newTier);
      if (!mapped) {
        return res.status(400).json({ error: "newTier must be Free, Pro, or Mentor (or pro / mentoring)" });
      }
      let expiresAt: Date | null = null;
      if (accessExpires != null && String(accessExpires).trim() !== "") {
        const d = new Date(String(accessExpires));
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: "accessExpires must be a valid ISO date" });
        }
        expiresAt = d;
      }

      const user = await persistUserAccessTier(
        walletAddress,
        mapped.subscriptionTier,
        mapped.subscriptionActive,
        expiresAt,
        mapped.manualProOverride,
      );
      res.json({
        success: true,
        user,
        subTier: crmTierLabel(user.subscriptionTier ?? undefined),
      });
    } catch (error) {
      console.error("PATCH /api/admin/update-tier:", error);
      res.status(500).json({ error: "Failed to update tier" });
    }
  });

  /**
   * Hard-write Pro/Mentor/Free to Postgres + Mongo CRM (upsert). Same persistence as `/api/admin/update-tier`.
   * Master admin (env) or sovereign fortress wallet.
   */
  app.patch("/api/admin/set-access", async (req: Request, res: Response) => {
    try {
      const adminWallet = resolveWalletAddressFromRequest(req)?.trim();
      if (!adminWallet) {
        return res.status(401).json({ error: "Send x-wallet-address or Authorization: Bearer <0x…>" });
      }
      const master = requireMasterAdminWallet(req);
      if (!isFortressSovereignAddress(adminWallet) && !master.ok) {
        return res.status(master.status).json({ error: master.error });
      }

      const { adminSetAccessBodySchema } = await import("@shared/schema");
      const parsed = adminSetAccessBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      }
      const { walletAddress, targetTier } = parsed.data;
      const t = targetTier.trim();
      const normalizedTier = t.toLowerCase() === "mentor" ? "mentoring" : t;
      const mapped = parseAdminNewTierInput(normalizedTier);
      if (!mapped) {
        return res.status(400).json({ error: "targetTier must be Pro, Mentor, or Free" });
      }

      const user = await persistUserAccessTier(
        walletAddress,
        mapped.subscriptionTier,
        mapped.subscriptionActive,
        null,
        mapped.manualProOverride,
      );
      res.json({
        success: true,
        user,
        subTier: crmTierLabel(user.subscriptionTier ?? undefined),
      });
    } catch (error) {
      console.error("PATCH /api/admin/set-access:", error);
      res.status(500).json({ error: "Failed to set access" });
    }
  });

  /** Payment provider / automation — header `x-equilibrium-billing-secret: $EQUILIBRIUM_BILLING_SYNC_SECRET`. */
  app.post("/api/billing/sync-tier", async (req: Request, res: Response) => {
    try {
      const want = process.env.EQUILIBRIUM_BILLING_SYNC_SECRET?.trim();
      const got = String(req.headers["x-equilibrium-billing-secret"] ?? "").trim();
      if (!want || got !== want) {
        return res.status(401).json({ error: "Invalid or missing x-equilibrium-billing-secret" });
      }
      const { adminUpdateTierBodySchema } = await import("@shared/schema");
      const parsed = adminUpdateTierBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      }
      const { walletAddress, newTier, accessExpires } = parsed.data;
      const mapped = parseAdminNewTierInput(newTier);
      if (!mapped) {
        return res.status(400).json({ error: "Invalid newTier" });
      }
      let expiresAt: Date | null = null;
      if (accessExpires != null && String(accessExpires).trim() !== "") {
        const d = new Date(String(accessExpires));
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: "Invalid accessExpires" });
        }
        expiresAt = d;
      }
      const user = await persistUserAccessTier(
        walletAddress,
        mapped.subscriptionTier,
        mapped.subscriptionActive,
        expiresAt,
        mapped.manualProOverride,
      );
      res.json({ success: true, user });
    } catch (error) {
      console.error("POST /api/billing/sync-tier:", error);
      res.status(500).json({ error: "Failed to sync tier" });
    }
  });

  // Admin: Update user subscription (sovereign wallet)
  app.patch("/api/admin/users/:walletAddress/subscription", async (req: Request, res: Response) => {
    try {
      const adminWallet = resolveWalletAddressFromRequest(req);
      const { updateSubscriptionSchema } = await import("@shared/schema");

      if (!isFortressSovereignAddress(adminWallet)) {
        return res.status(403).json({ error: "Sovereign admin wallet required" });
      }
      
      const validated = updateSubscriptionSchema.safeParse({
        walletAddress: req.params.walletAddress,
        ...req.body
      });
      
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid subscription data", details: validated.error.errors });
      }
      
      const { subscriptionTier, subscriptionActive, subscriptionExpiresAt, builderCodeApproved, manualProOverride } =
        validated.data;
      const expiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
      const paramWallet = decodeURIComponent(req.params.walletAddress);

      let user = await storage.updateWalletUserSubscription(
        paramWallet,
        subscriptionTier,
        subscriptionActive,
        expiresAt
      );

      if (!user) {
        user = await storage.createWalletUser({
          walletAddress: paramWallet,
          subscriptionTier,
          subscriptionActive: subscriptionActive,
          builderCodeApproved: builderCodeApproved ?? false,
          manualProOverride: typeof manualProOverride === "boolean" ? manualProOverride : false,
        });
      } else if (typeof builderCodeApproved === "boolean") {
        await storage.updateWalletUserApproval(paramWallet, builderCodeApproved);
        user = (await storage.getWalletUser(paramWallet)) ?? user;
      }

      if (typeof manualProOverride === "boolean") {
        await storage.setManualProOverride(paramWallet, manualProOverride);
        user = (await storage.getWalletUser(paramWallet)) ?? user;
      }

      void syncWalletUserToMongoCrm(paramWallet);
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error updating subscription:", error);
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  // ============ LEADS / EMAIL CAPTURE ============

  // Capture email lead (no auth required - public)
  app.post("/api/leads", async (req: Request, res: Response) => {
    try {
      const { z } = await import("zod");
      const leadSchema = z.object({
        email: z.string().email("Valid email required"),
        name: z.string().optional(),
        source: z.string().optional().default("landing"),
        walletAddress: z.string().optional(),
      });
      const validated = leadSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      const lead = await storage.createLead(validated.data);
      res.json({ success: true, lead });
    } catch (error) {
      console.error("Error capturing lead:", error);
      res.status(500).json({ error: "Failed to capture lead" });
    }
  });

  // Get all leads — sovereign admin only
  app.get("/api/leads", async (req: Request, res: Response) => {
    try {
      const adminWallet = resolveWalletAddressFromRequest(req);
      if (!isFortressSovereignAddress(adminWallet)) {
        return res.status(403).json({ error: "Sovereign admin wallet required" });
      }
      const allLeads = await storage.getAllLeads();
      res.json(allLeads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Support Chat API
  // Get messages for a conversation — wallet users own their conversation, guests own their session, admins can access all
  app.get("/api/support/messages/:conversationId", async (req: Request, res: Response) => {
    try {
      if (mongoVaultHandle) {
        return mongoVaultHandle.handleGetSupportMessagesConversation(req, res);
      }
      const walletAddress = req.headers["x-wallet-address"] as string | undefined;
      const sessionId = req.headers["x-session-id"] as string | undefined;
      const conversationId = req.params.conversationId.toLowerCase();

      const master = isMasterAdminAddress(walletAddress);

      if (!master) {
        const ownerIdentifier = (walletAddress || sessionId || "").toLowerCase();
        if (!ownerIdentifier || ownerIdentifier !== conversationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const messages = await storage.getMessages(conversationId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Get all conversations — master admin wallet only (Equilibrium Command Center / inbox)
  app.get("/api/support/conversations", async (req: Request, res: Response) => {
    try {
      if (mongoVaultHandle) {
        return mongoVaultHandle.handleGetSupportConversations(req, res);
      }
      const walletAddress = resolveWalletAddressFromRequest(req);
      if (!isMasterAdminAddress(walletAddress)) {
        return res.status(403).json({ error: "Master admin wallet required" });
      }
      const conversations = await storage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  /** Master admin: full support inbox (same rows as `support_tickets` / legacy name support_messages). */
  app.get("/api/support", async (req: Request, res: Response) => {
    if (mongoVaultHandle) {
      return mongoVaultHandle.handleGetSupportInbox(req, res);
    }
    try {
      const auth = requireMasterAdminWallet(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      const limit = Math.min(parseInt(String(req.query.limit || "500"), 10) || 500, 2000);
      const messages = await storage.getAllSupportMessages(limit);
      res.json(messages);
    } catch (err) {
      console.error("GET /api/support:", err);
      res.status(500).json({ error: "Failed to fetch support messages" });
    }
  });

  // Send a message — end-users / guests, or master admin (support replies from bubble)
  app.post("/api/support/messages", async (req: Request, res: Response) => {
    try {
      if (mongoVaultHandle) {
        return mongoVaultHandle.handleSupportMessagesPost(req, res);
      }
      const { insertSupportMessageSchema } = await import("@shared/schema");
      const walletAddress =
        resolveWalletAddressFromRequest(req) || (req.headers["x-wallet-address"] as string | undefined);
      const sessionId = req.headers["x-session-id"] as string | undefined;

      const asAdmin = isMasterAdminAddress(walletAddress);

      const conversationId = (req.body.conversationId || "").toLowerCase();

      if (!conversationId) {
        return res.status(400).json({ error: "conversationId is required" });
      }

      if (!asAdmin) {
        const ownerIdentifier = (walletAddress || sessionId || "").toLowerCase();
        if (!ownerIdentifier || ownerIdentifier !== conversationId) {
          return res.status(403).json({ error: "Can only send to your own conversation" });
        }
      }

      const messageData = {
        ...req.body,
        senderType: asAdmin ? "admin" : "user",
        senderWallet: asAdmin ? null : (walletAddress?.toLowerCase() || null),
        conversationId,
        walletAddress: asAdmin ? null : (walletAddress?.toLowerCase() ?? null),
        clientSentAt: req.body.clientSentAt ? new Date(req.body.clientSentAt) : null,
      };

      const validated = insertSupportMessageSchema.safeParse(messageData);
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid input", details: validated.error.errors });
      }
      const message = await storage.createMessage(validated.data);
      const { emitSupportMessage } = await import("./support-events");
      emitSupportMessage(message);
      res.json(message);
    } catch (error: unknown) {
      console.error("Error creating message:", error);
      const detail = error instanceof Error ? error.message : undefined;
      res.status(500).json({ error: "Failed to send message", ...(detail ? { detail } : {}) });
    }
  });

  /** Preferred user support path: wallet + timestamp + body → support_tickets. */
  async function handleSupportSendRequest(req: Request, res: Response): Promise<void> {
    try {
      if (mongoVaultHandle) {
        return await mongoVaultHandle.handleSupportSend(req, res);
      }
      const { supportSendBodySchema, insertSupportMessageSchema } = await import("@shared/schema");
      const parsed = supportSendBodySchema.safeParse(req.body);
      if (!parsed.success) {
        pushAdminLog({
          channel: "support",
          level: "warn",
          message: "POST support send validation failed",
          meta: { issues: parsed.error.flatten() },
        });
        res.status(400).json({ error: "Invalid body", details: parsed.error.errors });
        return;
      }

      const bodyWallet = parsed.data.walletAddress.trim();
      const conversationId = (parsed.data.conversationId?.trim() || bodyWallet).toLowerCase();
      const headerWallet = (req.headers["x-wallet-address"] as string | undefined)?.trim();
      const sessionId = (req.headers["x-session-id"] as string | undefined)?.trim();
      const asAdmin = isMasterAdminAddress(headerWallet);

      if (!asAdmin) {
        const owner = (headerWallet || sessionId || "").toLowerCase();
        if (!owner || owner !== conversationId) {
          pushAdminLog({
            channel: "support",
            level: "warn",
            message: "support/send denied (conversation owner mismatch)",
            meta: { conversationId },
          });
          res.status(403).json({ error: "Access denied" });
          return;
        }
        if (headerWallet && headerWallet.toLowerCase() !== bodyWallet.toLowerCase()) {
          res.status(403).json({ error: "walletAddress must match connected wallet" });
          return;
        }
      }

      let clientSentAt: Date;
      if (parsed.data.clientTimestamp) {
        const d = new Date(parsed.data.clientTimestamp);
        clientSentAt = Number.isNaN(d.getTime()) ? new Date() : d;
      } else {
        clientSentAt = new Date();
      }

      const messageData = {
        conversationId,
        senderType: asAdmin ? ("admin" as const) : ("user" as const),
        senderWallet: asAdmin ? null : bodyWallet.toLowerCase(),
        senderName: asAdmin
          ? "Support Team"
          : headerWallet
            ? `User ${headerWallet.slice(0, 6)}…${headerWallet.slice(-4)}`
            : "Guest",
        message: parsed.data.message,
        isRead: false,
        walletAddress: asAdmin ? null : bodyWallet.toLowerCase(),
        clientSentAt,
      };

      const validated = insertSupportMessageSchema.safeParse(messageData);
      if (!validated.success) {
        pushAdminLog({
          channel: "support",
          level: "warn",
          message: "support/send insert validation failed",
          meta: { details: validated.error.errors },
        });
        res.status(400).json({ error: "Invalid message payload", details: validated.error.errors });
        return;
      }

      pushAdminLog({
        channel: "support",
        level: "info",
        message: "support/send persisting ticket",
        meta: { conversationId, bytes: parsed.data.message.length },
      });

      const message = await storage.createMessage(validated.data);
      const { emitSupportMessage } = await import("./support-events");
      emitSupportMessage(message);

      res.json(message);
    } catch (error: unknown) {
      console.error("support/send:", error);
      pushAdminLog({ channel: "support", level: "error", message: String(error) });
      const detail = error instanceof Error ? error.message : undefined;
      res.status(500).json({ error: "Failed to send message", ...(detail ? { detail } : {}) });
    }
  }

  app.post("/api/support/send", handleSupportSendRequest);

  /** Canonical support ingest: persists to `support_tickets` (same as /api/support/send). */
  app.post("/api/support", async (req: Request, res: Response) => {
    const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    req.body = { ...b };
    return handleSupportSendRequest(req, res);
  });

  /** Alias for clients that POST `walletAddress` + `messageContent` (JSON). Same persistence as /api/support/send. */
  app.post("/api/support/message", async (req: Request, res: Response) => {
    const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    req.body = { ...b };
    return handleSupportSendRequest(req, res);
  });

  /** Alias of POST /api/support. */
  app.post("/api/messages", async (req: Request, res: Response) => {
    const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    req.body = { ...b };
    return handleSupportSendRequest(req, res);
  });

  /** Public support ingest alias — same validation and `support_tickets` row as /api/support/send. */
  app.post("/api/support/chat", async (req: Request, res: Response) => {
    const b = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    req.body = { ...b };
    return handleSupportSendRequest(req, res);
  });

  /** SSE: push new messages to the trading UI when admin replies (or self echo). */
  app.get("/api/support/stream/:conversationId", async (req: Request, res: Response) => {
    try {
      const walletAddress = req.headers["x-wallet-address"] as string | undefined;
      const sessionId = req.headers["x-session-id"] as string | undefined;
      const conversationId = req.params.conversationId.toLowerCase();
      const master = isMasterAdminAddress(walletAddress);
      if (!master) {
        const owner = (walletAddress || sessionId || "").toLowerCase();
        if (!owner || owner !== conversationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof (res as any).flushHeaders === "function") (res as any).flushHeaders();

      const { supportEventBus } = await import("./support-events");
      const send = (msg: unknown) => {
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      };

      const onMessage = (m: { conversationId?: string }) => {
        if (m && String(m.conversationId || "").toLowerCase() === conversationId) {
          send(m);
        }
      };
      supportEventBus.on("message", onMessage);
      const ping = setInterval(() => {
        res.write(": ping\n\n");
      }, 25_000);
      req.on("close", () => {
        clearInterval(ping);
        supportEventBus.off("message", onMessage);
      });
      send({ type: "connected", conversationId });
    } catch (error) {
      console.error("Error opening support stream:", error);
      if (!res.headersSent) res.status(500).end();
    }
  });

  // Mark messages as read — master admin only
  app.post("/api/support/messages/:conversationId/read", async (req: Request, res: Response) => {
    try {
      if (mongoVaultHandle) {
        return mongoVaultHandle.handleMarkSupportRead(req, res);
      }
      const walletAddress = req.headers["x-wallet-address"] as string | undefined;
      if (!isMasterAdminAddress(walletAddress)) {
        return res.status(403).json({ error: "Master admin wallet required" });
      }
      await storage.markMessagesAsRead(req.params.conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Check if wallet is admin
  app.get("/api/admin/check/:walletAddress", async (req: Request, res: Response) => {
    try {
      const isAdmin = isFortressSovereignAddress(req.params.walletAddress);
      res.json({ isAdmin });
    } catch (error) {
      console.error("Error checking admin status:", error);
      res.status(500).json({ error: "Failed to check admin status" });
    }
  });

  // ── Equilibrium Command Center (master wallet + `x-wallet-address` header) ──
  app.get("/api/command-center/status", (req: Request, res: Response) => {
    const addr = String(req.query.address || "").trim();
    res.json({
      masterConfigured: !!getMasterAdminAddress(),
      isMasterAdmin: isMasterAdminAddress(addr),
    });
  });

  app.get("/api/command-center/ws-token", (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const token = issueCommandCenterWsToken();
    pushAdminLog({
      channel: "api",
      level: "info",
      message: "Issued Command Center WebSocket log token",
    });
    res.json({ token, expiresInSec: 300 });
  });

  app.get("/api/command-center/users", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      res.json(await storage.getAllWalletUsers());
    } catch {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/command-center/leads", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      res.json(await storage.getAllLeads());
    } catch {
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.get("/api/command-center/conversations", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      res.json(await storage.getAllConversations());
    } catch {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.post("/api/command-center/support/reply", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      const { insertSupportMessageSchema } = await import("@shared/schema");
      const conversationId = String(req.body?.conversationId || "").toLowerCase().trim();
      const text = String(req.body?.message || "").trim();
      if (!conversationId || !text) {
        return res.status(400).json({ error: "conversationId and message are required" });
      }
      const messageData = {
        senderType: "admin" as const,
        senderWallet: null as string | null,
        senderName: String(req.body?.senderName || "Support Team"),
        message: text,
        isRead: true,
        conversationId,
      };
      const validated = insertSupportMessageSchema.safeParse(messageData);
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid input", details: validated.error.errors });
      }
      const message = await storage.createMessage(validated.data);
      const { emitSupportMessage } = await import("./support-events");
      emitSupportMessage(message);
      pushAdminLog({
        channel: "support",
        level: "info",
        message: "Command Center admin reply",
        meta: { conversationId },
      });
      res.json(message);
    } catch (e) {
      console.error("command-center support reply:", e);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  const handleMasterWalletSubscriptionPatch = async (req: Request, res: Response): Promise<void> => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    try {
      const { updateSubscriptionSchema } = await import("@shared/schema");
      const paramWallet = decodeURIComponent(req.params.walletAddress);
      const raw = { walletAddress: paramWallet, ...req.body } as Record<string, unknown>;
      if (raw.removePro === true) {
        raw.subscriptionTier = "free";
        raw.subscriptionActive = false;
        raw.manualProOverride = false;
      } else if (raw.isMentee === true) {
        raw.subscriptionTier = "mentoring";
        raw.subscriptionActive = true;
        raw.manualProOverride = true;
      } else if (raw.isSubscribed === true) {
        raw.subscriptionTier = "pro";
        raw.subscriptionActive = true;
        raw.manualProOverride = true;
      }
      delete raw.isSubscribed;
      delete raw.isMentee;
      delete raw.removePro;
      const validated = updateSubscriptionSchema.safeParse(raw);
      if (!validated.success) {
        res.status(400).json({ error: "Invalid subscription data", details: validated.error.errors });
        return;
      }
      const { subscriptionTier, subscriptionActive, subscriptionExpiresAt, builderCodeApproved, manualProOverride } =
        validated.data;
      const expiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
      let user = await storage.updateWalletUserSubscription(paramWallet, subscriptionTier, subscriptionActive, expiresAt);
      if (!user) {
        user = await storage.createWalletUser({
          walletAddress: paramWallet,
          subscriptionTier,
          subscriptionActive,
          builderCodeApproved: builderCodeApproved ?? false,
          manualProOverride: typeof manualProOverride === "boolean" ? manualProOverride : false,
        });
      } else if (typeof builderCodeApproved === "boolean") {
        await storage.updateWalletUserApproval(paramWallet, builderCodeApproved);
        user = (await storage.getWalletUser(paramWallet)) ?? user;
      }
      if (typeof manualProOverride === "boolean") {
        await storage.setManualProOverride(paramWallet, manualProOverride);
        user = (await storage.getWalletUser(paramWallet)) ?? user;
      }
      void syncWalletUserToMongoCrm(paramWallet);
      res.json({ success: true, user });
    } catch (error) {
      console.error("command-center subscription:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  };

  app.patch("/api/command-center/users/:walletAddress/subscription", handleMasterWalletSubscriptionPatch);
  app.patch("/api/users/:walletAddress/subscription", handleMasterWalletSubscriptionPatch);

  // ── Short REST paths for AdminDashboard (same master-wallet auth) ──
  app.get("/api/users", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      res.json(await storage.getAllWalletUsers());
    } catch (err) {
      console.error("GET /api/users:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  /** Admin Command Center — same payload as GET /api/users (master wallet via x-wallet-address or Authorization Bearer). */
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      res.json(await storage.getAllWalletUsers());
    } catch (err) {
      console.error("GET /api/admin/users:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/messages", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "500"), 10) || 500, 2000);
      res.json(await storage.getAllSupportMessages(limit));
    } catch (err) {
      console.error("GET /api/messages:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/command-center/analytics/hyperliquid", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      const [hl, allUsers] = await Promise.all([getPerpExchangeAggregates(), storage.getAllWalletUsers()]);
      const handshakeComplete = allUsers.filter((u) => u.instantTradingCompletedAt).length;
      const builderApproved = allUsers.filter((u) => u.builderCodeApproved).length;
      res.json({
        hyperliquid: hl,
        sovereignCohort: {
          totalWalletRows: allUsers.length,
          instantTradingHandshakeComplete: handshakeComplete,
          builderCodeApproved: builderApproved,
        },
        note:
          "Exchange totals are Hyperliquid-wide (public API). Builder-attributed volume is not exposed as a single public aggregate; use sovereign cohort counts for users recorded in Equilibrium.",
      });
    } catch (e) {
      console.error("command-center analytics:", e);
      res.status(500).json({ error: "Failed to load analytics" });
    }
  });

  // ── Admin Equilibrium CRM (master-wallet signature session) ──
  function adminEquilibriumBearer(req: Request): string | undefined {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return undefined;
    return h.slice(7).trim() || undefined;
  }

  app.get("/api/admin-equilibrium/challenge", (_req: Request, res: Response) => {
    const ch = createAdminEquilibriumChallenge();
    res.json({
      ...ch,
      masterWalletHint: getMasterAdminWallet() ? "configured" : "any-admin-wallet",
    });
  });

  app.post("/api/admin-equilibrium/verify", (req: Request, res: Response) => {
    const nonce = String(req.body?.nonce || "");
    const signature = String(req.body?.signature || "");
    const out = verifyAdminEquilibriumSignature(nonce, signature);
    if (!out.ok) {
      return res.status(401).json({ error: out.error });
    }
    res.json({
      accessToken: out.accessToken,
      expiresAt: out.expiresAt,
      wallet: out.wallet,
    });
  });

  app.post("/api/admin-equilibrium/session/revoke", (req: Request, res: Response) => {
    const tok = adminEquilibriumBearer(req);
    const v = validateAdminEquilibriumToken(tok);
    if (v.ok) revokeAdminEquilibriumToken(tok!);
    res.json({ success: true });
  });

  app.get("/api/admin-equilibrium/users", async (req: Request, res: Response) => {
    const v = validateAdminEquilibriumToken(adminEquilibriumBearer(req));
    if (!v.ok) return res.status(401).json({ error: v.error });
    try {
      const users = await storage.getAllWalletUsers();
      res.json(users);
    } catch {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin-equilibrium/users/:walletAddress/subscription", async (req: Request, res: Response) => {
    const { validateAdminEquilibriumToken } = require("./admin-equilibrium-auth") as typeof import("./admin-equilibrium-auth");
    const v = validateAdminEquilibriumToken(adminEquilibriumBearer(req));
    if (!v.ok) return res.status(401).json({ error: v.error });
    try {
      const { updateSubscriptionSchema } = await import("@shared/schema");
      const paramWallet = decodeURIComponent(req.params.walletAddress);
      const validated = updateSubscriptionSchema.safeParse({
        walletAddress: paramWallet,
        ...req.body,
      });
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid subscription data", details: validated.error.errors });
      }
      const { subscriptionTier, subscriptionActive, subscriptionExpiresAt, builderCodeApproved, manualProOverride } =
        validated.data;
      const expiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
      let user = await storage.updateWalletUserSubscription(
        paramWallet,
        subscriptionTier,
        subscriptionActive,
        expiresAt,
      );
      if (!user) {
        user = await storage.createWalletUser({
          walletAddress: paramWallet,
          subscriptionTier,
          subscriptionActive,
          builderCodeApproved: builderCodeApproved ?? false,
          manualProOverride: typeof manualProOverride === "boolean" ? manualProOverride : false,
        });
      } else if (typeof builderCodeApproved === "boolean") {
        await storage.updateWalletUserApproval(paramWallet, builderCodeApproved);
        user = (await storage.getWalletUser(paramWallet)) ?? user;
      }
      if (typeof manualProOverride === "boolean") {
        await storage.setManualProOverride(paramWallet, manualProOverride);
        user = (await storage.getWalletUser(paramWallet)) ?? user;
      }
      void syncWalletUserToMongoCrm(paramWallet);
      res.json({ success: true, user });
    } catch (error) {
      console.error("admin-equilibrium subscription:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.get("/api/admin-equilibrium/conversations", async (req: Request, res: Response) => {
    const v = validateAdminEquilibriumToken(adminEquilibriumBearer(req));
    if (!v.ok) return res.status(401).json({ error: v.error });
    try {
      const conversations = await storage.getAllConversations();
      res.json(conversations);
    } catch {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.post("/api/admin-equilibrium/support/messages", async (req: Request, res: Response) => {
    const v = validateAdminEquilibriumToken(adminEquilibriumBearer(req));
    if (!v.ok) return res.status(401).json({ error: v.error });
    try {
      const { insertSupportMessageSchema } = await import("@shared/schema");
      const conversationId = String(req.body?.conversationId || "").toLowerCase();
      if (!conversationId) {
        return res.status(400).json({ error: "conversationId is required" });
      }
      const messageData = {
        ...req.body,
        senderType: "admin",
        senderWallet: null,
        conversationId,
      };
      const validated = insertSupportMessageSchema.safeParse(messageData);
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid input", details: validated.error.errors });
      }
      const message = await storage.createMessage(validated.data);
      const { emitSupportMessage } = await import("./support-events");
      emitSupportMessage(message);
      res.json(message);
    } catch (error) {
      console.error("admin-equilibrium support message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.get("/api/admin-equilibrium/analytics/hyperliquid", async (req: Request, res: Response) => {
    const v = validateAdminEquilibriumToken(adminEquilibriumBearer(req));
    if (!v.ok) return res.status(401).json({ error: v.error });
    try {
      const [hl, allUsers] = await Promise.all([getPerpExchangeAggregates(), storage.getAllWalletUsers()]);
      const handshakeComplete = allUsers.filter((u) => u.instantTradingCompletedAt).length;
      const builderApproved = allUsers.filter((u) => u.builderCodeApproved).length;
      res.json({
        hyperliquid: hl,
        sovereignCohort: {
          totalWalletRows: allUsers.length,
          instantTradingHandshakeComplete: handshakeComplete,
          builderCodeApproved: builderApproved,
        },
        note:
          "Exchange totals are Hyperliquid-wide (public API). Builder-attributed volume is not exposed as a single public aggregate; use sovereign cohort counts for users recorded in Equilibrium.",
      });
    } catch (e) {
      console.error("admin-equilibrium analytics:", e);
      res.status(500).json({ error: "Failed to load analytics" });
    }
  });

  // ============ STRIPE PAYMENT ROUTES ============

  // Get Stripe publishable key for frontend
  app.get("/api/stripe/config", async (_req: Request, res: Response) => {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  });

  // Get available Stripe products and prices
  app.get("/api/stripe/products", async (req: Request, res: Response) => {
    try {
      let rows = await stripeService.listProductsWithPrices();

      // If the synced DB table is empty, fall back to querying Stripe directly
      if (!rows || rows.length === 0) {
        const directProducts = await stripeService.listProductsWithPricesFromStripe();
        const data = directProducts.map((p: any) => ({
          id: p.product_id,
          name: p.product_name,
          description: p.product_description,
          active: p.product_active,
          metadata: p.product_metadata,
          prices: p.prices.map((pr: any) => ({
            id: pr.price_id,
            unit_amount: pr.unit_amount,
            currency: pr.currency,
            recurring: pr.recurring,
            active: pr.price_active,
            metadata: pr.price_metadata,
          })),
        }));
        return res.json({ data });
      }

      const productsMap = new Map();
      for (const row of rows as any[]) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            metadata: row.product_metadata,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
            metadata: row.price_metadata
          });
        }
      }

      res.json({ data: Array.from(productsMap.values()) });
    } catch (error) {
      console.error("Error fetching Stripe products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  // Get the Pro tier price ID directly (bypasses name/metadata matching)
  app.get("/api/stripe/pro-price-id", async (req: Request, res: Response) => {
    const PRO_PRODUCT_ID = 'prod_TpGvzRznydzDhy';
    try {
      // Try synced DB first
      const rows = await stripeService.listProductsWithPrices();
      if (rows && (rows as any[]).length > 0) {
        const proRow = (rows as any[]).find((r: any) => r.product_id === PRO_PRODUCT_ID && r.price_id);
        if (proRow) return res.json({ priceId: proRow.price_id });
      }
      // Fall back to Stripe API directly
      const stripe = await getUncachableStripeClient();
      const prices = await stripe.prices.list({ product: PRO_PRODUCT_ID, active: true, limit: 10 });
      const monthly = prices.data.find((p) => p.recurring?.interval === 'month') || prices.data[0];
      if (monthly) return res.json({ priceId: monthly.id });
      res.status(404).json({ error: 'Pro price not found' });
    } catch (error) {
      console.error("Error fetching Pro price ID:", error);
      res.status(500).json({ error: "Failed to fetch Pro price ID" });
    }
  });

  // Create checkout session for subscription
  app.post("/api/stripe/checkout", async (req: Request, res: Response) => {
    try {
      let { priceId, walletAddress, email, tier } = req.body;
      
      if (!walletAddress) {
        return res.status(400).json({ error: "Wallet address is required" });
      }

      // Auto-select the correct £50 price for AI Pro if no priceId provided
      if (!priceId) {
        const PRO_PRODUCT_ID = 'prod_TpGvzRznydzDhy';
        try {
          const stripe = await getUncachableStripeClient();
          const prices = await stripe.prices.list({ product: PRO_PRODUCT_ID, active: true, limit: 10 });
          // Prefer £50 (5000 pence), then highest amount as fallback
          const sorted = prices.data.sort((a, b) => (b.unit_amount || 0) - (a.unit_amount || 0));
          const monthly = sorted.find(p => p.recurring?.interval === 'month') || sorted[0];
          if (monthly) priceId = monthly.id;
        } catch (e) {
          console.error('Failed to auto-select price:', e);
        }
      }

      if (!priceId) {
        return res.status(400).json({ error: "No active price found for Pro plan" });
      }

      // Get or create wallet user
      let walletUser = await storage.getWalletUser(walletAddress);
      if (!walletUser) {
        walletUser = await storage.createWalletUser({ walletAddress, email });
      }
      void syncWalletUserToMongoCrm(walletAddress);

      // Create or get Stripe customer
      let customerId: string;
      const existingCustomer = email ? await stripeService.getCustomerByEmail(email) : null;
      
      if (existingCustomer) {
        customerId = (existingCustomer as any).id;
      } else {
        const customer = await stripeService.createCustomer(
          email || `${walletAddress}@wallet.equilibrium`,
          walletAddress
        );
        customerId = customer.id;
      }

      // Determine if this is a subscription or one-time payment
      // Default to 'subscription' — safer than defaulting to 'payment' for recurring prices
      let mode: 'subscription' | 'payment' = 'subscription';
      try {
        const price = await stripeService.getPrice(priceId);
        if (price && !(price as any)?.recurring) {
          mode = 'payment';
        }
      } catch {
        // Keep default 'subscription' mode
      }

      const baseUrl = getPublicAppBaseUrl();
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        walletAddress,
        `${baseUrl}/pricing?success=true&tier=${tier || 'pro'}`,
        `${baseUrl}/pricing?canceled=true`,
        mode
      );

      res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // Create customer portal session for managing subscription
  app.post("/api/stripe/portal", async (req: Request, res: Response) => {
    try {
      const { walletAddress, email } = req.body;
      
      if (!walletAddress && !email) {
        return res.status(400).json({ error: "Wallet address or email required" });
      }

      let customer = email ? await stripeService.getCustomerByEmail(email) : null;
      if (!customer && walletAddress) {
        customer = await stripeService.getCustomerByWalletAddress(walletAddress);
      }

      if (!customer) {
        return res.status(404).json({ error: "No subscription found for this account" });
      }

      const baseUrl = getPublicAppBaseUrl();
      const session = await stripeService.createCustomerPortalSession(
        (customer as any).id,
        `${baseUrl}/settings`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  return httpServer;
}
