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

  return httpServer;
}
