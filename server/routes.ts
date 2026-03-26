import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerLocalUploadRoutes } from "./local-upload-routes";
import { analyzePatterns, getMarketCondition } from "./pattern-detection";
import { 
  getAvailableCoins, 
  getAllTickers,
  getSpotTickers,
  getOrderBook, 
  getRecentTrades,
  getCandles,
  getPerpUniverseCoinNames,
  getPerpExchangeAggregates,
} from "./hyperliquid";
import { scanForSignals, getSMAStatus } from "./sma-detection";
import { scanForEducationalPatterns } from "./universal-scanner";
import { gradeTrade } from "./trade-grading";
import { stripeService } from "./stripeService";
import { getStripePublishableKey, getUncachableStripeClient } from "./stripeClient";
import { getPublicAppBaseUrl } from "./public-url";
import { isAdminAddress } from "./admin-access";
import { requireMasterAdminWallet, isMasterAdminAddress, getMasterAdminAddress } from "./master-admin";
import { issueCommandCenterWsToken } from "./command-center-ws-token";
import { pushAdminLog } from "./admin-log-bus";
import {
  createAdminEquilibriumChallenge,
  verifyAdminEquilibriumSignature,
  validateAdminEquilibriumToken,
  revokeAdminEquilibriumToken,
  getMasterAdminWallet,
} from "./admin-equilibrium-auth";
import { SCAN_ALL_TIMEFRAMES } from "@shared/scan-timeframes";

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

async function resolveScanCoins(coinsParam?: string): Promise<string[]> {
  if (coinsParam?.trim()) {
    return coinsParam.split(",").map((c) => c.trim()).filter(Boolean);
  }
  const live = await getPerpUniverseCoinNames();
  if (live.length > 0) return live;
  return ["BTC", "ETH", "SOL"];
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/wallet/is-admin", async (req: Request, res: Response) => {
    const walletAddress = req.headers["x-wallet-address"] as string | undefined;
    res.json({ isAdmin: isAdminAddress(walletAddress) });
  });

  // Register OpenAI chat routes
  registerChatRoutes(app);

  // Replit GCS presigned URLs when enabled; otherwise local disk (same API shape as useUpload).
  const useReplitObjectStorage = process.env.USE_REPLIT_OBJECT_STORAGE === "1";
  if (useReplitObjectStorage) {
    try {
      registerObjectStorageRoutes(app);
    } catch (error) {
      console.warn(
        "Failed to initialize Replit object storage routes, falling back to local uploads:",
        error,
      );
      registerLocalUploadRoutes(app);
    }
  } else {
    registerLocalUploadRoutes(app);
  }

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
      const candles = await getCandles(
        req.params.coin,
        (interval as string) || "1m",
        startTime ? parseInt(startTime as string) : undefined,
        endTime ? parseInt(endTime as string) : undefined,
        limit ? parseInt(limit as string) : 500
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

  // Scan for educational patterns (no entry/SL/TP - for learning)
  app.get("/api/signals/patterns", async (req: Request, res: Response) => {
    try {
      const coinsParam = req.query.coins as string;
      const timeframesParam = req.query.timeframes as string;

      const coins = await resolveScanCoins(coinsParam);
      const timeframes = timeframesParam?.trim()
        ? timeframesParam.split(",").map((t) => t.trim()).filter(Boolean)
        : [...SCAN_ALL_TIMEFRAMES];

      const patterns = await scanForEducationalPatterns(coins, timeframes);
      res.json(patterns);
    } catch (error) {
      console.error("Error scanning for educational patterns:", error);
      res.status(500).json({ error: "Failed to scan for patterns" });
    }
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

  // Tutorial Videos API
  app.get("/api/videos", async (req: Request, res: Response) => {
    try {
      const videos = await storage.getAllVideos();
      res.json(videos);
    } catch (error) {
      console.error("Error fetching videos:", error);
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  // Create video - admin only
  app.post("/api/videos", async (req: Request, res: Response) => {
    try {
      const { insertVideoSchema } = await import("@shared/schema");
      const walletAddress = req.headers["x-wallet-address"] as string | undefined;
      
      if (!walletAddress || !isAdminAddress(walletAddress)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const validated = insertVideoSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid input", details: validated.error.errors });
      }
      const video = await storage.createVideo(validated.data);
      res.json(video);
    } catch (error) {
      console.error("Error creating video:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create video";
      res.status(500).json({ error: message });
    }
  });

  // Delete video - admin only
  app.delete("/api/videos/:id", async (req: Request, res: Response) => {
    try {
      const walletAddress = req.headers["x-wallet-address"] as string | undefined;
      
      if (!walletAddress || !isAdminAddress(walletAddress)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const deleted = await storage.deleteVideo(req.params.id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Video not found" });
      }
    } catch (error) {
      console.error("Error deleting video:", error);
      res.status(500).json({ error: "Failed to delete video" });
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
        email: user.email,
        createdAt: user.createdAt
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
        return res.json({ 
          success: true, 
          message: "User already registered",
          user: existing 
        });
      }

      const user = await storage.createWalletUser(validated.data);
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
      const tsMatch = /^Timestamp: (\d+)$/.exec(lines[2] ?? "");
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
      if (!(lines[3] ?? "").includes("EQUILIBRIUM_BUILDER")) {
        return res.status(400).json({ error: "Sign-in message is missing builder authorization line" });
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
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error recording instant trading handshake:", error);
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
      
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error updating wallet user email:", error);
      res.status(500).json({ error: "Failed to update email" });
    }
  });

  // Admin: Get all wallet users
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    try {
      const walletAddress = req.headers["x-wallet-address"] as string | undefined;
      
      if (!walletAddress || !isAdminAddress(walletAddress)) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const users = await storage.getAllWalletUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get subscription status for a wallet
  app.get("/api/stripe/subscription/:walletAddress", async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.params;
      
      // Admin wallets get full product access (same as Mentoring tier)
      if (isAdminAddress(walletAddress)) {
        return res.json({ tier: "mentoring", active: true, expiresAt: null });
      }

      // Check Stripe directly for real-time subscription status
      const stripeSubscription = await stripeService.getActiveSubscriptionByWalletAddress(walletAddress);
      if (stripeSubscription) {
        // Keep walletUsers table in sync
        const user = await storage.getWalletUser(walletAddress);
        if (user && (user.subscriptionTier !== stripeSubscription.tier || !user.subscriptionActive)) {
          await storage.updateWalletUserSubscription(
            walletAddress,
            stripeSubscription.tier,
            true,
            stripeSubscription.expiresAt ? new Date(stripeSubscription.expiresAt) : null
          );
        }
        return res.json(stripeSubscription);
      }

      const user = await storage.getWalletUser(walletAddress);
      if (!user) {
        return res.json({ tier: 'free', active: false, expiresAt: null });
      }

      // Admin "Grant Pro" bypass: honor tier even if subscriptionActive was cleared in legacy rows
      if (user.manualProOverride && user.subscriptionTier !== "free") {
        return res.json({
          tier: user.subscriptionTier,
          active: true,
          expiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
        });
      }

      // DB-backed Pro/Mentoring (admin grant) when Stripe has no active subscription
      if (user.subscriptionActive && user.subscriptionTier !== 'free') {
        return res.json({
          tier: user.subscriptionTier,
          active: true,
          expiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
        });
      }

      res.json({ tier: 'free', active: false, expiresAt: null });
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ error: "Failed to fetch subscription status" });
    }
  });

  // Admin: Update user subscription
  app.patch("/api/admin/users/:walletAddress/subscription", async (req: Request, res: Response) => {
    try {
      const adminWallet = req.headers["x-wallet-address"] as string | undefined;
      const { updateSubscriptionSchema } = await import("@shared/schema");
      
      if (!adminWallet || !isAdminAddress(adminWallet)) {
        return res.status(403).json({ error: "Admin access required" });
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

  // Get all leads - admin only
  app.get("/api/leads", async (req: Request, res: Response) => {
    try {
      const adminWallet = req.headers["x-wallet-address"] as string | undefined;
      if (!adminWallet || !isAdminAddress(adminWallet)) {
        return res.status(403).json({ error: "Admin access required" });
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
      const walletAddress = req.headers["x-wallet-address"] as string | undefined;
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

  // Send a message — end-users / guests, or master admin (support replies from bubble)
  app.post("/api/support/messages", async (req: Request, res: Response) => {
    try {
      const { insertSupportMessageSchema } = await import("@shared/schema");
      const walletAddress = req.headers["x-wallet-address"] as string | undefined;
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
      if (!asAdmin) {
        const { notifyTelegramUserSupportMessage, isTelegramConfigured } = await import("./telegram-notify");
        if (isTelegramConfigured()) {
          const w = (walletAddress || sessionId || conversationId).toLowerCase();
          void notifyTelegramUserSupportMessage(w, String(validated.data.message || ""));
        }
      }
      res.json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  /** Preferred user support path: wallet + timestamp + body → support_tickets + Telegram. */
  async function handleSupportSendRequest(req: Request, res: Response): Promise<void> {
    try {
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

      if (!asAdmin) {
        const { notifyTelegramUserSupportMessage, isTelegramConfigured } = await import("./telegram-notify");
        if (isTelegramConfigured()) {
          void notifyTelegramUserSupportMessage(bodyWallet.toLowerCase(), parsed.data.message);
        } else {
          pushAdminLog({
            channel: "telegram",
            level: "warn",
            message: "User message saved but Telegram is not configured (no phone alert)",
          });
        }
      }

      res.json(message);
    } catch (error) {
      console.error("support/send:", error);
      pushAdminLog({ channel: "support", level: "error", message: String(error) });
      res.status(500).json({ error: "Failed to send message" });
    }
  }

  app.post("/api/support/send", handleSupportSendRequest);

  /** Alias for clients that POST `walletAddress` + `messageContent` (JSON). Same persistence + Telegram as /api/support/send. */
  app.post("/api/support/message", async (req: Request, res: Response) => {
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
      const isAdmin = isAdminAddress(req.params.walletAddress);
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

  app.patch("/api/command-center/users/:walletAddress/subscription", async (req: Request, res: Response) => {
    const auth = requireMasterAdminWallet(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    try {
      const { updateSubscriptionSchema } = await import("@shared/schema");
      const paramWallet = decodeURIComponent(req.params.walletAddress);
      const validated = updateSubscriptionSchema.safeParse({ walletAddress: paramWallet, ...req.body });
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid subscription data", details: validated.error.errors });
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
      res.json({ success: true, user });
    } catch (error) {
      console.error("command-center subscription:", error);
      res.status(500).json({ error: "Failed to update user" });
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
