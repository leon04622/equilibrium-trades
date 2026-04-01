import type { MarketCondition } from "@shared/schema";
import { getOpenAIOrNull } from "./openai-client";
import { getCandles } from "./hyperliquid";
import { calculateSMAFromCandles } from "./sma-detection";

interface DetectedPatternResult {
  patternId: string;
  patternName: string;
  type: "continuation" | "reversal";
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  description: string;
}

function calculateSmmaFromPrices(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  let smma = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  for (let i = period; i < prices.length; i++) {
    smma = (smma * (period - 1) + prices[i]) / period;
  }
  return smma;
}

function buildSmmaTrendSummary(prices: number[]): string {
  const smma21 = calculateSmmaFromPrices(prices, 21);
  const smma200 = calculateSmmaFromPrices(prices, 200);
  if (smma21 == null || smma200 == null) {
    return "There is not enough history to confirm the 21/200 SMMA trend, so do not assume a bullish or bearish bias.";
  }

  const delta = smma21 - smma200;
  const threshold = Math.max(Math.abs(smma200) * 0.0005, 1e-9);
  if (delta > threshold) {
    return `The 21 SMMA is above the 200 SMMA (${smma21.toFixed(2)} vs ${smma200.toFixed(2)}), suggesting bullish trend context.`;
  }
  if (delta < -threshold) {
    return `The 21 SMMA is below the 200 SMMA (${smma21.toFixed(2)} vs ${smma200.toFixed(2)}), suggesting bearish trend context.`;
  }
  return `The 21 SMMA is very close to the 200 SMMA (${smma21.toFixed(2)} vs ${smma200.toFixed(2)}), suggesting neutral trend context.`;
}

const PATTERN_DETECTION_PROMPT = `You are an expert technical analyst specializing in chart pattern recognition. Analyze the given market data and identify any trading patterns that may be forming or confirmed.

Focus on these patterns (use EXACTLY these pattern IDs):
- bull-flag (Bull Flag)
- bear-flag (Bear Flag)
- ascending-triangle (Ascending Triangle)
- descending-triangle (Descending Triangle)
- symmetrical-triangle (Symmetrical Triangle)
- pennant (Pennant)
- cup-and-handle (Cup and Handle)
- head-and-shoulders (Head and Shoulders)
- inverse-head-and-shoulders (Inverse Head and Shoulders)
- double-top (Double Top)
- double-bottom (Double Bottom)
- triple-top (Triple Top)
- triple-bottom (Triple Bottom)
- diamond (Diamond Pattern)
- rising-wedge (Rising Wedge)
- falling-wedge (Falling Wedge)
- rounding-bottom (Rounding Bottom)
- bullish-engulfing (Bullish Engulfing)
- bearish-engulfing (Bearish Engulfing)

For each pattern detected, provide:
1. Pattern ID (MUST be one of the exact IDs listed above like "bull-flag", "ascending-triangle")
2. Pattern name
3. Type (continuation or reversal)
4. Direction (bullish, bearish, or neutral)
5. Confidence score (0-100)
6. Entry price suggestion (if applicable)
7. Stop loss suggestion (if applicable)
8. Take profit suggestion (if applicable)
9. Brief description of why this pattern was identified

Respond with a JSON array of detected patterns. If no patterns are found, return an empty array.`;

export async function analyzePatterns(
  symbol: string,
  timeframe: string,
  priceData?: number[]
): Promise<DetectedPatternResult[]> {
  try {
    const openai = getOpenAIOrNull();
    if (!openai) {
      return [];
    }
    if (!priceData?.length) {
      return [];
    }
    const mockPriceData = priceData;
    const smmaTrendSummary = buildSmmaTrendSummary(mockPriceData);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: PATTERN_DETECTION_PROMPT },
        { 
          role: "user", 
          content: `Analyze this market data for ${symbol} on the ${timeframe} timeframe.

Recent price data (last 50 candles close prices):
${JSON.stringify(mockPriceData.slice(-50))}

Current price: ${mockPriceData[mockPriceData.length - 1]}
High: ${Math.max(...mockPriceData.slice(-20))}
Low: ${Math.min(...mockPriceData.slice(-20))}

${smmaTrendSummary}

Identify any patterns forming or confirmed in this data.`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    const patterns = parsed.patterns || parsed;
    
    // Valid pattern IDs from our library
    const validPatternIds = [
      "bull-flag", "bear-flag", "ascending-triangle", "descending-triangle",
      "symmetrical-triangle", "pennant", "cup-and-handle", "head-and-shoulders",
      "inverse-head-and-shoulders", "double-top", "double-bottom", "triple-top",
      "triple-bottom", "diamond", "rising-wedge", "falling-wedge", "rounding-bottom",
      "bullish-engulfing", "bearish-engulfing"
    ];

    if (Array.isArray(patterns)) {
      const mappedPatterns: DetectedPatternResult[] = [];
      for (const p of patterns) {
        const rawId = p.patternId || p.pattern_id || "";
        const normalizedId = rawId.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
        const patternId = validPatternIds.includes(normalizedId) ? normalizedId : null;
        
        if (patternId) {
          mappedPatterns.push({
            patternId,
            patternName: p.patternName || p.pattern_name || "Unknown Pattern",
            type: p.type || "continuation",
            direction: p.direction || "neutral",
            confidence: Math.min(100, Math.max(0, p.confidence || 50)),
            entryPrice: p.entryPrice || p.entry_price,
            stopLoss: p.stopLoss || p.stop_loss,
            takeProfit: p.takeProfit || p.take_profit,
            description: p.description || "",
          });
        }
      }
      return mappedPatterns;
    }

    return [];
  } catch (error) {
    console.error("Pattern analysis error:", error);
    // Return empty array on error - don't store demo patterns as real detections
    return [];
  }
}

function normalizeMarketCoin(symbol: string): string | null {
  let s = symbol.trim().toUpperCase();
  if (s.includes(":")) s = s.split(":").pop()!;
  s = s.replace(/\/USDT$/i, "").replace(/USDT$/i, "").replace(/\//g, "");
  if (s.startsWith("@")) return null;
  return s || "BTC";
}

const EMPTY_MARKET: MarketCondition = {
  symbol: "",
  currentPrice: 0,
  sma21_1m: 0,
  sma200_1m: 0,
  sma200_5m: 0,
  trend: "neutral",
  crossoverActive: false,
  above5mSma200: false,
};

/** Live SMMA 21/200 from Hyperliquid candles (matches in-app Hyperliquid chart math). */
export async function getMarketCondition(symbol: string): Promise<MarketCondition> {
  const coin = normalizeMarketCoin(symbol);
  if (!coin) {
    return { ...EMPTY_MARKET, symbol };
  }

  try {
    const now = Date.now();
    const span1m = 250 * 60 * 1000;
    const span5m = 250 * 5 * 60 * 1000;
    const [c1, c5] = await Promise.all([
      getCandles(coin, "1m", now - span1m, now, 250),
      getCandles(coin, "5m", now - span5m, now, 250),
    ]);
    const s1 = calculateSMAFromCandles(c1);
    const s5 = calculateSMAFromCandles(c5);
    if (!s1 || !s5) {
      return { ...EMPTY_MARKET, symbol: coin };
    }

    const currentPrice = s1.price;
    const crossoverActive = s1.sma21 > s1.sma200;
    const above5mSma200 = currentPrice > s5.sma200;

    let trend: "bullish" | "bearish" | "neutral";
    if (crossoverActive && above5mSma200) trend = "bullish";
    else if (!crossoverActive && !above5mSma200) trend = "bearish";
    else trend = "neutral";

    return {
      symbol: coin,
      currentPrice,
      sma21_1m: s1.sma21,
      sma200_1m: s1.sma200,
      sma200_5m: s5.sma200,
      trend,
      crossoverActive,
      above5mSma200,
    };
  } catch (e) {
    console.error("[getMarketCondition]", coin, e);
    return { ...EMPTY_MARKET, symbol: coin };
  }
}
