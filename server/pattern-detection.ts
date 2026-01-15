import OpenAI from "openai";
import type { MarketCondition } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
    // Generate mock price data if not provided
    const mockPriceData = priceData || generateMockPriceData();
    
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

The 21 SMA is currently above the 200 SMA, suggesting a bullish trend.

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

function generateMockPriceData(): number[] {
  const basePrice = 98000 + Math.random() * 2000;
  const prices: number[] = [];
  let currentPrice = basePrice;
  
  for (let i = 0; i < 100; i++) {
    const change = (Math.random() - 0.48) * 100; // Slight bullish bias
    currentPrice = Math.max(90000, currentPrice + change);
    prices.push(Math.round(currentPrice * 100) / 100);
  }
  
  return prices;
}

function getDemoPatterns(symbol: string, timeframe: string): DetectedPatternResult[] {
  const patterns: DetectedPatternResult[] = [];
  const basePrice = symbol.includes("BTC") ? 98500 : 
                    symbol.includes("ETH") ? 3420 : 
                    symbol.includes("SOL") ? 187 : 100;

  // Randomly select 1-3 patterns
  const numPatterns = Math.floor(Math.random() * 3) + 1;
  
  const demoPatterns: DetectedPatternResult[] = [
    {
      patternId: "bull-flag",
      patternName: "Bull Flag",
      type: "continuation",
      direction: "bullish",
      confidence: 75 + Math.floor(Math.random() * 15),
      entryPrice: basePrice * 1.002,
      stopLoss: basePrice * 0.995,
      takeProfit: basePrice * 1.015,
      description: "Price consolidating in a downward channel after a strong upward move. Volume decreasing during consolidation."
    },
    {
      patternId: "ascending-triangle",
      patternName: "Ascending Triangle",
      type: "continuation",
      direction: "bullish",
      confidence: 65 + Math.floor(Math.random() * 20),
      entryPrice: basePrice * 1.003,
      stopLoss: basePrice * 0.992,
      takeProfit: basePrice * 1.018,
      description: "Flat resistance with rising support line. Buyers becoming more aggressive at each dip."
    },
    {
      patternId: "pennant",
      patternName: "Pennant",
      type: "continuation",
      direction: "bullish",
      confidence: 70 + Math.floor(Math.random() * 15),
      entryPrice: basePrice * 1.001,
      stopLoss: basePrice * 0.994,
      takeProfit: basePrice * 1.012,
      description: "Small symmetrical triangle forming after strong upward movement. Expecting continuation."
    },
    {
      patternId: "bear-flag",
      patternName: "Bear Flag",
      type: "continuation",
      direction: "bearish",
      confidence: 60 + Math.floor(Math.random() * 20),
      entryPrice: basePrice * 0.998,
      stopLoss: basePrice * 1.005,
      takeProfit: basePrice * 0.985,
      description: "Price bouncing in an upward channel after sharp decline. Watch for breakdown."
    }
  ];

  for (let i = 0; i < numPatterns; i++) {
    const idx = Math.floor(Math.random() * demoPatterns.length);
    patterns.push({ ...demoPatterns[idx] });
    demoPatterns.splice(idx, 1);
  }

  return patterns;
}

export async function getMarketCondition(symbol: string): Promise<MarketCondition> {
  // Generate realistic demo market condition
  const isBTC = symbol.includes("BTC");
  const isETH = symbol.includes("ETH");
  const basePrice = isBTC ? 98432 : isETH ? 3421 : 100;
  
  const sma21_1m = basePrice * (0.997 + Math.random() * 0.006);
  const sma200_1m = basePrice * (0.993 + Math.random() * 0.006);
  const sma200_5m = basePrice * (0.99 + Math.random() * 0.008);
  
  const crossoverActive = sma21_1m > sma200_1m;
  const above5mSma200 = basePrice > sma200_5m;
  
  let trend: "bullish" | "bearish" | "neutral";
  if (crossoverActive && above5mSma200) {
    trend = "bullish";
  } else if (!crossoverActive && !above5mSma200) {
    trend = "bearish";
  } else {
    trend = "neutral";
  }

  return {
    symbol: symbol.replace("BINANCE:", "").replace("USDT", "/USDT"),
    currentPrice: Math.round(basePrice * 100) / 100,
    sma21_1m: Math.round(sma21_1m * 100) / 100,
    sma200_1m: Math.round(sma200_1m * 100) / 100,
    sma200_5m: Math.round(sma200_5m * 100) / 100,
    trend,
    crossoverActive,
    above5mSma200,
  };
}
