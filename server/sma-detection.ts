// SMA Crossover Detection System
// Based on the 21/200 SMA Crossover Strategy from cryptolifer.com

import { getCandles, HyperliquidCandle } from "./hyperliquid";

export interface SMAValues {
  sma21: number;
  sma200: number;
  price: number;
  timestamp: number;
}

export interface CrossoverSignal {
  id: string;
  coin: string;
  type: "bullish_crossover" | "bearish_crossover" | "bullish_setup" | "bearish_setup";
  status: "forming" | "confirmed" | "active";
  timeframe: string;
  sma21: number;
  sma200: number;
  currentPrice: number;
  entryPrice: number;
  suggestedSL: number;
  suggestedTP: number;
  confidence: number;
  detectedAt: Date;
  description: string;
  patternType?: string;
}

// Calculate Simple Moving Average
function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

// Get SMA values for multiple periods from candle data
export function calculateSMAFromCandles(candles: HyperliquidCandle[]): SMAValues | null {
  if (candles.length < 200) return null;
  
  const closePrices = candles.map(c => parseFloat(c.c));
  const sma21 = calculateSMA(closePrices, 21);
  const sma200 = calculateSMA(closePrices, 200);
  const lastCandle = candles[candles.length - 1];
  
  if (!sma21 || !sma200) return null;
  
  return {
    sma21,
    sma200,
    price: parseFloat(lastCandle.c),
    timestamp: lastCandle.t,
  };
}

// Detect crossovers by comparing current and previous SMA positions
export function detectCrossover(
  currentSMA: SMAValues,
  previousSMA: SMAValues | null
): "bullish_crossover" | "bearish_crossover" | null {
  if (!previousSMA) return null;
  
  const currentDiff = currentSMA.sma21 - currentSMA.sma200;
  const previousDiff = previousSMA.sma21 - previousSMA.sma200;
  
  // Bullish crossover: 21 SMA was below 200 SMA, now above
  if (previousDiff < 0 && currentDiff >= 0) {
    return "bullish_crossover";
  }
  
  // Bearish crossover: 21 SMA was above 200 SMA, now below
  if (previousDiff > 0 && currentDiff <= 0) {
    return "bearish_crossover";
  }
  
  return null;
}

// Detect if price action suggests an imminent crossover
export function detectFormingCrossover(sma: SMAValues): "bullish_forming" | "bearish_forming" | null {
  const gap = Math.abs(sma.sma21 - sma.sma200);
  const gapPercent = (gap / sma.sma200) * 100;
  
  // If gap is less than 0.5%, crossover may be forming
  if (gapPercent < 0.5) {
    // Check direction based on momentum
    if (sma.price > sma.sma21 && sma.sma21 < sma.sma200) {
      return "bullish_forming"; // Price pushing 21 SMA up toward 200
    }
    if (sma.price < sma.sma21 && sma.sma21 > sma.sma200) {
      return "bearish_forming"; // Price pushing 21 SMA down toward 200
    }
  }
  
  return null;
}

// Detect continuation setup after crossover
export function detectSetup(sma: SMAValues): "bullish_setup" | "bearish_setup" | null {
  // Bullish setup: 21 SMA above 200 SMA, price pulled back to near 21 SMA
  if (sma.sma21 > sma.sma200) {
    const pullbackPercent = ((sma.sma21 - sma.price) / sma.price) * 100;
    if (pullbackPercent >= -0.5 && pullbackPercent <= 2) {
      return "bullish_setup"; // Price near or just below 21 SMA - potential long entry
    }
  }
  
  // Bearish setup: 21 SMA below 200 SMA, price pulled back to near 21 SMA
  if (sma.sma21 < sma.sma200) {
    const pullbackPercent = ((sma.price - sma.sma21) / sma.price) * 100;
    if (pullbackPercent >= -0.5 && pullbackPercent <= 2) {
      return "bearish_setup"; // Price near or just above 21 SMA - potential short entry
    }
  }
  
  return null;
}

// Analyze a coin for SMA crossover signals
export async function analyzeCoinForSignals(
  coin: string,
  timeframe: string = "1m"
): Promise<CrossoverSignal | null> {
  try {
    // Map timeframe to Hyperliquid interval format
    const intervalMap: Record<string, string> = {
      "1m": "1m",
      "5m": "5m", 
      "15m": "15m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
    };
    
    const interval = intervalMap[timeframe] || "1m";
    
    // Calculate how much historical data we need (at least 250 candles for 200 SMA)
    const candleMinutes: Record<string, number> = {
      "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440,
    };
    
    const minutes = candleMinutes[timeframe] || 1;
    const requiredCandles = 250;
    const durationMs = requiredCandles * minutes * 60 * 1000;
    
    const endTime = Date.now();
    const startTime = endTime - durationMs;
    
    const candles = await getCandles(coin, interval, startTime, endTime);
    
    if (candles.length < 210) {
      // Not enough data for 200 SMA
      return null;
    }
    
    // Calculate current SMA values
    const currentSMA = calculateSMAFromCandles(candles);
    if (!currentSMA) return null;
    
    // Calculate previous SMA (from 5 candles ago to detect recent crossover)
    const previousCandles = candles.slice(0, -5);
    const previousSMA = calculateSMAFromCandles(previousCandles);
    
    // Check for crossover
    const crossover = detectCrossover(currentSMA, previousSMA);
    
    // Check for forming crossover
    const forming = detectFormingCrossover(currentSMA);
    
    // Check for continuation setup
    const setup = detectSetup(currentSMA);
    
    // Only return signals when something actionable is happening
    if (!crossover && !forming && !setup) {
      return null;
    }
    
    // Determine signal type and parameters
    let signalType: CrossoverSignal["type"];
    let status: CrossoverSignal["status"];
    let confidence: number;
    let description: string;
    let patternType: string | undefined;
    let suggestedSL: number;
    let suggestedTP: number;
    
    if (crossover) {
      signalType = crossover;
      status = "confirmed";
      confidence = 85;
      
      if (crossover === "bullish_crossover") {
        description = `21 SMA crossed ABOVE 200 SMA on ${timeframe} - Bullish signal confirmed. Look for continuation patterns like bull flags or ascending triangles.`;
        suggestedSL = currentSMA.sma200 * 0.99; // SL below 200 SMA
        suggestedTP = currentSMA.price * 1.03; // 3% take profit
        patternType = "Bull Flag / Ascending Triangle";
      } else {
        description = `21 SMA crossed BELOW 200 SMA on ${timeframe} - Bearish signal confirmed. Look for continuation patterns like bear flags or descending triangles.`;
        suggestedSL = currentSMA.sma200 * 1.01; // SL above 200 SMA
        suggestedTP = currentSMA.price * 0.97; // 3% take profit
        patternType = "Bear Flag / Descending Triangle";
      }
    } else if (forming) {
      signalType = forming === "bullish_forming" ? "bullish_crossover" : "bearish_crossover";
      status = "forming";
      confidence = 65;
      
      if (forming === "bullish_forming") {
        description = `21 SMA approaching 200 SMA from below on ${timeframe} - Potential bullish crossover forming. Wait for confirmation before entry.`;
        suggestedSL = currentSMA.sma200 * 0.985;
        suggestedTP = currentSMA.price * 1.025;
        patternType = "Potential Bull Flag";
      } else {
        description = `21 SMA approaching 200 SMA from above on ${timeframe} - Potential bearish crossover forming. Wait for confirmation before entry.`;
        suggestedSL = currentSMA.sma200 * 1.015;
        suggestedTP = currentSMA.price * 0.975;
        patternType = "Potential Bear Flag";
      }
    } else if (setup) {
      signalType = setup;
      status = "active";
      confidence = 75;
      
      if (setup === "bullish_setup") {
        description = `Price pulled back to 21 SMA while 21 > 200 SMA on ${timeframe} - Bullish continuation setup. Consider long entry with stop below 21 SMA.`;
        suggestedSL = currentSMA.sma21 * 0.99; // SL below 21 SMA
        suggestedTP = currentSMA.price * 1.02; // 2% take profit
        patternType = "Bull Flag / Pullback Entry";
      } else {
        description = `Price pulled back to 21 SMA while 21 < 200 SMA on ${timeframe} - Bearish continuation setup. Consider short entry with stop above 21 SMA.`;
        suggestedSL = currentSMA.sma21 * 1.01; // SL above 21 SMA
        suggestedTP = currentSMA.price * 0.98; // 2% take profit
        patternType = "Bear Flag / Pullback Entry";
      }
    } else {
      return null;
    }
    
    return {
      id: `${coin}-${timeframe}-${Date.now()}`,
      coin,
      type: signalType,
      status,
      timeframe,
      sma21: currentSMA.sma21,
      sma200: currentSMA.sma200,
      currentPrice: currentSMA.price,
      entryPrice: currentSMA.price,
      suggestedSL,
      suggestedTP,
      confidence,
      detectedAt: new Date(),
      description,
      patternType,
    };
  } catch (error) {
    console.error(`Error analyzing ${coin} for signals:`, error);
    return null;
  }
}

// Scan multiple coins for signals
export async function scanForSignals(
  coins: string[] = ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK", "ARB", "SUI", "OP"],
  timeframes: string[] = ["1m", "5m", "15m"]
): Promise<CrossoverSignal[]> {
  const signals: CrossoverSignal[] = [];
  
  // Scan each coin on each timeframe
  for (const coin of coins) {
    for (const timeframe of timeframes) {
      try {
        const signal = await analyzeCoinForSignals(coin, timeframe);
        if (signal) {
          signals.push(signal);
        }
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error scanning ${coin} ${timeframe}:`, error);
      }
    }
  }
  
  // Sort by confidence (highest first) and then by recency
  signals.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });
  
  return signals;
}

// Get current SMA status for a coin (for display purposes)
export async function getSMAStatus(
  coin: string,
  timeframe: string = "1m"
): Promise<{
  sma21: number;
  sma200: number;
  price: number;
  trend: "bullish" | "bearish" | "neutral";
  crossoverProximity: number;
} | null> {
  try {
    const intervalMap: Record<string, string> = {
      "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d",
    };
    const interval = intervalMap[timeframe] || "1m";
    
    const candleMinutes: Record<string, number> = {
      "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440,
    };
    const minutes = candleMinutes[timeframe] || 1;
    const requiredCandles = 250;
    const durationMs = requiredCandles * minutes * 60 * 1000;
    
    const endTime = Date.now();
    const startTime = endTime - durationMs;
    
    const candles = await getCandles(coin, interval, startTime, endTime);
    const sma = calculateSMAFromCandles(candles);
    
    if (!sma) return null;
    
    const trend = sma.sma21 > sma.sma200 ? "bullish" : sma.sma21 < sma.sma200 ? "bearish" : "neutral";
    const crossoverProximity = Math.abs((sma.sma21 - sma.sma200) / sma.sma200) * 100;
    
    return {
      sma21: sma.sma21,
      sma200: sma.sma200,
      price: sma.price,
      trend,
      crossoverProximity,
    };
  } catch (error) {
    console.error(`Error getting SMA status for ${coin}:`, error);
    return null;
  }
}
