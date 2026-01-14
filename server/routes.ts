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
import { getTradingInstance, resetTradingInstance } from "./hyperliquid-trading";

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

  // ============ HYPERLIQUID TRADING ROUTES ============

  // Connect to Hyperliquid with private key
  app.post("/api/hyperliquid/connect", async (req: Request, res: Response) => {
    try {
      const { privateKey } = req.body;
      
      if (!privateKey) {
        return res.status(400).json({ error: "Private key is required" });
      }

      const trading = getTradingInstance();
      const result = await trading.initialize(privateKey);
      
      if (result.success) {
        res.json({ success: true, address: result.address });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error("Error connecting to Hyperliquid:", error);
      res.status(500).json({ error: error.message || "Failed to connect" });
    }
  });

  // Disconnect from Hyperliquid
  app.post("/api/hyperliquid/disconnect", async (req: Request, res: Response) => {
    try {
      resetTradingInstance();
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error disconnecting:", error);
      res.status(500).json({ error: error.message || "Failed to disconnect" });
    }
  });

  // Get connection status
  app.get("/api/hyperliquid/status", async (req: Request, res: Response) => {
    try {
      const trading = getTradingInstance();
      res.json({
        connected: trading.isConnected(),
        address: trading.getWalletAddress(),
      });
    } catch (error: any) {
      res.json({ connected: false, address: null });
    }
  });

  // Get account state (positions, margin, etc.)
  app.get("/api/hyperliquid/account", async (req: Request, res: Response) => {
    try {
      const trading = getTradingInstance();
      if (!trading.isConnected()) {
        return res.status(401).json({ error: "Not connected to Hyperliquid" });
      }
      
      const state = await trading.getAccountState();
      res.json(state);
    } catch (error: any) {
      console.error("Error fetching account state:", error);
      res.status(500).json({ error: error.message || "Failed to fetch account" });
    }
  });

  // Get positions
  app.get("/api/hyperliquid/positions", async (req: Request, res: Response) => {
    try {
      const trading = getTradingInstance();
      if (!trading.isConnected()) {
        return res.status(401).json({ error: "Not connected to Hyperliquid" });
      }
      
      const positions = await trading.getPositions();
      res.json(positions);
    } catch (error: any) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch positions" });
    }
  });

  // Get open orders
  app.get("/api/hyperliquid/orders", async (req: Request, res: Response) => {
    try {
      const trading = getTradingInstance();
      if (!trading.isConnected()) {
        return res.status(401).json({ error: "Not connected to Hyperliquid" });
      }
      
      const orders = await trading.getOpenOrders();
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: error.message || "Failed to fetch orders" });
    }
  });

  // Place order
  app.post("/api/hyperliquid/order", async (req: Request, res: Response) => {
    try {
      const trading = getTradingInstance();
      if (!trading.isConnected()) {
        return res.status(401).json({ error: "Not connected to Hyperliquid" });
      }
      
      const { coin, isBuy, size, price, orderType, reduceOnly, slippage } = req.body;
      
      if (!coin || typeof isBuy !== "boolean" || !size) {
        return res.status(400).json({ error: "Missing required fields: coin, isBuy, size" });
      }
      
      const result = await trading.placeOrder({
        coin,
        isBuy,
        size: parseFloat(size),
        price: price ? parseFloat(price) : undefined,
        orderType: orderType || "limit",
        reduceOnly: reduceOnly || false,
        slippage: slippage || 0.02,
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Error placing order:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to place order" });
    }
  });

  // Cancel order
  app.delete("/api/hyperliquid/order/:orderId", async (req: Request, res: Response) => {
    try {
      const trading = getTradingInstance();
      if (!trading.isConnected()) {
        return res.status(401).json({ error: "Not connected to Hyperliquid" });
      }
      
      const { coin } = req.query;
      if (!coin) {
        return res.status(400).json({ error: "Coin is required as query parameter" });
      }
      
      const result = await trading.cancelOrder(coin as string, req.params.orderId);
      res.json(result);
    } catch (error: any) {
      console.error("Error canceling order:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to cancel order" });
    }
  });

  // Cancel all orders
  app.delete("/api/hyperliquid/orders", async (req: Request, res: Response) => {
    try {
      const trading = getTradingInstance();
      if (!trading.isConnected()) {
        return res.status(401).json({ error: "Not connected to Hyperliquid" });
      }
      
      const { coin } = req.query;
      const result = await trading.cancelAllOrders(coin as string | undefined);
      res.json(result);
    } catch (error: any) {
      console.error("Error canceling orders:", error);
      res.status(500).json({ success: false, cancelled: 0, error: error.message });
    }
  });

  return httpServer;
}
