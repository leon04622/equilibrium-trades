import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerChatRoutes } from "./replit_integrations/chat";
import { analyzePatterns, getMarketCondition } from "./pattern-detection";
import { 
  getAvailableCoins, 
  getAllTickers, 
  getOrderBook, 
  getRecentTrades,
  getCandles 
} from "./hyperliquid";
import { scanForSignals, getSMAStatus } from "./sma-detection";
import { gradeTrade } from "./trade-grading";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register OpenAI chat routes
  registerChatRoutes(app);

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

  // Get available coins from Hyperliquid
  app.get("/api/hyperliquid/coins", async (req: Request, res: Response) => {
    try {
      const meta = await getAvailableCoins();
      res.json(meta.universe);
    } catch (error) {
      console.error("Error fetching Hyperliquid coins:", error);
      res.status(500).json({ error: "Failed to fetch coins" });
    }
  });

  // Get all tickers with prices
  app.get("/api/hyperliquid/tickers", async (req: Request, res: Response) => {
    try {
      const tickers = await getAllTickers();
      res.json(tickers);
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
      const { interval, startTime, endTime } = req.query;
      const candles = await getCandles(
        req.params.coin,
        (interval as string) || "1m",
        startTime ? parseInt(startTime as string) : undefined,
        endTime ? parseInt(endTime as string) : undefined
      );
      res.json(candles);
    } catch (error) {
      console.error("Error fetching candles:", error);
      res.status(500).json({ error: "Failed to fetch candles" });
    }
  });

  // ============ SMA CROSSOVER SIGNALS ============

  // Scan for real-time SMA crossover signals
  app.get("/api/signals/crossover", async (req: Request, res: Response) => {
    try {
      const coinsParam = req.query.coins as string;
      const timeframesParam = req.query.timeframes as string;
      
      const coins = coinsParam 
        ? coinsParam.split(",") 
        : ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK", "ARB", "SUI"];
      
      const timeframes = timeframesParam 
        ? timeframesParam.split(",") 
        : ["1m", "5m", "15m"];
      
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

  app.post("/api/videos", async (req: Request, res: Response) => {
    try {
      const { insertVideoSchema } = await import("@shared/schema");
      const validated = insertVideoSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid input", details: validated.error.errors });
      }
      const video = await storage.createVideo(validated.data);
      res.json(video);
    } catch (error) {
      console.error("Error creating video:", error);
      res.status(500).json({ error: "Failed to create video" });
    }
  });

  app.delete("/api/videos/:id", async (req: Request, res: Response) => {
    try {
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

  return httpServer;
}
