// SMA Crossover & Flag Pattern Detection System
// Based on the 21/200 SMA Crossover Strategy from cryptolifer.com
// 
// METHODOLOGY:
// 1. Determine bias: 21 SMA > 200 SMA = bullish, look for bull flags
//                    21 SMA < 200 SMA = bearish, look for bear flags
// 2. Identify the POLE: Strong impulse move in the direction of bias
// 3. Identify the FLAG: Consolidation/pullback forming a channel
// 4. Wait for BREAKOUT: Price breaks above flag (bull) or below flag (bear)
// 5. ONLY signal entry after breakout is confirmed

import { getCandles, HyperliquidCandle } from "./hyperliquid";

export interface SMAValues {
  sma21: number;
  sma200: number;
  price: number;
  timestamp: number;
}

export interface FlagPattern {
  type: "bull_flag" | "bear_flag";
  status: "forming" | "breakout_pending" | "breakout_confirmed";
  poleStart: number;
  poleEnd: number;
  poleHeight: number;
  flagHigh: number;
  flagLow: number;
  breakoutLevel: number;
  currentPrice: number;
}

export interface CrossoverSignal {
  id: string;
  coin: string;
  type: "bullish_crossover" | "bearish_crossover" | "bullish_setup" | "bearish_setup";
  status: "forming" | "confirmed" | "active" | "breakout";
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

// Detect the "pole" - a strong impulse move
function detectPole(candles: HyperliquidCandle[], isBullish: boolean): { start: number; end: number; height: number } | null {
  if (candles.length < 30) return null;
  
  // Look at the last 30-50 candles for a strong move
  const recentCandles = candles.slice(-50);
  const closePrices = recentCandles.map(c => parseFloat(c.c));
  const highPrices = recentCandles.map(c => parseFloat(c.h));
  const lowPrices = recentCandles.map(c => parseFloat(c.l));
  
  // Find the swing low/high that starts the pole
  let poleStart = 0;
  let poleEnd = 0;
  
  if (isBullish) {
    // For bull flag, find the lowest point followed by strong up move
    const minIndex = lowPrices.indexOf(Math.min(...lowPrices.slice(0, 30)));
    const maxAfterMin = Math.max(...highPrices.slice(minIndex));
    const maxIndex = minIndex + highPrices.slice(minIndex).indexOf(maxAfterMin);
    
    const poleHeight = maxAfterMin - lowPrices[minIndex];
    const avgPrice = closePrices.reduce((a, b) => a + b, 0) / closePrices.length;
    const heightPercent = (poleHeight / avgPrice) * 100;
    
    // Pole should be at least 1% move
    if (heightPercent >= 1 && maxIndex > minIndex) {
      return {
        start: lowPrices[minIndex],
        end: maxAfterMin,
        height: poleHeight,
      };
    }
  } else {
    // For bear flag, find the highest point followed by strong down move
    const maxIndex = highPrices.indexOf(Math.max(...highPrices.slice(0, 30)));
    const minAfterMax = Math.min(...lowPrices.slice(maxIndex));
    const minIndex = maxIndex + lowPrices.slice(maxIndex).indexOf(minAfterMax);
    
    const poleHeight = highPrices[maxIndex] - minAfterMax;
    const avgPrice = closePrices.reduce((a, b) => a + b, 0) / closePrices.length;
    const heightPercent = (poleHeight / avgPrice) * 100;
    
    if (heightPercent >= 1 && minIndex > maxIndex) {
      return {
        start: highPrices[maxIndex],
        end: minAfterMax,
        height: poleHeight,
      };
    }
  }
  
  return null;
}

// Detect the "flag" - consolidation after the pole
function detectFlag(candles: HyperliquidCandle[], pole: { start: number; end: number; height: number }, isBullish: boolean): FlagPattern | null {
  if (candles.length < 10) return null;
  
  // Look at the most recent 5-15 candles for consolidation
  const flagCandles = candles.slice(-15);
  const closePrices = flagCandles.map(c => parseFloat(c.c));
  const highPrices = flagCandles.map(c => parseFloat(c.h));
  const lowPrices = flagCandles.map(c => parseFloat(c.l));
  
  const flagHigh = Math.max(...highPrices);
  const flagLow = Math.min(...lowPrices);
  const flagRange = flagHigh - flagLow;
  const currentPrice = closePrices[closePrices.length - 1];
  
  // Flag should be smaller than the pole (consolidation)
  const flagToPoleRatio = flagRange / pole.height;
  
  // Flag should be 20-60% of pole height typically
  if (flagToPoleRatio > 0.7) {
    return null; // Flag is too large, not a consolidation
  }
  
  // Check if flag is forming in the right direction
  if (isBullish) {
    // Bull flag: consolidation should be below or near pole end (pullback)
    // Flag should show lower highs or sideways movement
    const isConsolidating = flagHigh <= pole.end * 1.01;
    const breakoutLevel = flagHigh;
    
    // Determine status
    let status: FlagPattern["status"] = "forming";
    
    // Check if breakout is happening
    if (currentPrice > flagHigh) {
      const breakoutPercent = ((currentPrice - flagHigh) / flagHigh) * 100;
      if (breakoutPercent > 0.2) {
        status = "breakout_confirmed";
      } else {
        status = "breakout_pending";
      }
    }
    
    if (isConsolidating) {
      return {
        type: "bull_flag",
        status,
        poleStart: pole.start,
        poleEnd: pole.end,
        poleHeight: pole.height,
        flagHigh,
        flagLow,
        breakoutLevel,
        currentPrice,
      };
    }
  } else {
    // Bear flag: consolidation should be above or near pole end (pullback up)
    const isConsolidating = flagLow >= pole.end * 0.99;
    const breakoutLevel = flagLow;
    
    let status: FlagPattern["status"] = "forming";
    
    // Check if breakout is happening (break below)
    if (currentPrice < flagLow) {
      const breakoutPercent = ((flagLow - currentPrice) / flagLow) * 100;
      if (breakoutPercent > 0.2) {
        status = "breakout_confirmed";
      } else {
        status = "breakout_pending";
      }
    }
    
    if (isConsolidating) {
      return {
        type: "bear_flag",
        status,
        poleStart: pole.start,
        poleEnd: pole.end,
        poleHeight: pole.height,
        flagHigh,
        flagLow,
        breakoutLevel,
        currentPrice,
      };
    }
  }
  
  return null;
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

// Analyze a coin for SMA crossover signals with proper flag pattern detection
export async function analyzeCoinForSignals(
  coin: string,
  timeframe: string = "1m"
): Promise<CrossoverSignal | null> {
  try {
    const intervalMap: Record<string, string> = {
      "1m": "1m",
      "5m": "5m", 
      "15m": "15m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
    };
    
    const interval = intervalMap[timeframe] || "1m";
    
    const candleMinutes: Record<string, number> = {
      "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440,
    };
    
    const minutes = candleMinutes[timeframe] || 1;
    const requiredCandles = 300; // Need more candles for pattern detection
    const durationMs = requiredCandles * minutes * 60 * 1000;
    
    const endTime = Date.now();
    const startTime = endTime - durationMs;
    
    const candles = await getCandles(coin, interval, startTime, endTime);
    
    if (candles.length < 210) {
      return null;
    }
    
    // Calculate current SMA values
    const currentSMA = calculateSMAFromCandles(candles);
    if (!currentSMA) return null;
    
    // Determine market bias from SMAs
    const isBullish = currentSMA.sma21 > currentSMA.sma200;
    
    // Calculate previous SMA for crossover detection
    const previousCandles = candles.slice(0, -5);
    const previousSMA = calculateSMAFromCandles(previousCandles);
    const crossover = detectCrossover(currentSMA, previousSMA);
    
    // Detect pole (impulse move)
    const pole = detectPole(candles, isBullish);
    
    // Detect flag pattern (consolidation + breakout status)
    const flag = pole ? detectFlag(candles, pole, isBullish) : null;
    
    // Build signal based on what we found
    let signalType: CrossoverSignal["type"];
    let status: CrossoverSignal["status"];
    let confidence: number;
    let description: string;
    let patternType: string;
    let suggestedSL: number;
    let suggestedTP: number;
    let entryPrice: number;
    
    // Priority 1: Crossover just happened
    if (crossover) {
      signalType = crossover;
      status = "confirmed";
      confidence = 85;
      entryPrice = currentSMA.price;
      
      if (crossover === "bullish_crossover") {
        description = `21 SMA crossed ABOVE 200 SMA on ${timeframe}. Bullish bias confirmed. Now look for bull flag patterns to form before entry.`;
        suggestedSL = currentSMA.sma200 * 0.99;
        suggestedTP = currentSMA.price * 1.03;
        patternType = "SMA Crossover - Bullish";
      } else {
        description = `21 SMA crossed BELOW 200 SMA on ${timeframe}. Bearish bias confirmed. Now look for bear flag patterns to form before entry.`;
        suggestedSL = currentSMA.sma200 * 1.01;
        suggestedTP = currentSMA.price * 0.97;
        patternType = "SMA Crossover - Bearish";
      }
    }
    // Priority 2: Flag pattern with breakout confirmed - ENTRY SIGNAL
    else if (flag && flag.status === "breakout_confirmed") {
      signalType = isBullish ? "bullish_setup" : "bearish_setup";
      status = "breakout";
      confidence = 80;
      
      if (isBullish) {
        description = `BULL FLAG BREAKOUT on ${timeframe}! Flag formed and price broke above ${flag.flagHigh.toFixed(2)}. Entry confirmed with stop below flag low.`;
        suggestedSL = flag.flagLow * 0.995;
        suggestedTP = flag.breakoutLevel + (flag.poleHeight * 0.8); // Target is pole height projection
        entryPrice = currentSMA.price;
        patternType = "Bull Flag Breakout";
      } else {
        description = `BEAR FLAG BREAKOUT on ${timeframe}! Flag formed and price broke below ${flag.flagLow.toFixed(2)}. Entry confirmed with stop above flag high.`;
        suggestedSL = flag.flagHigh * 1.005;
        suggestedTP = flag.breakoutLevel - (flag.poleHeight * 0.8);
        entryPrice = currentSMA.price;
        patternType = "Bear Flag Breakout";
      }
    }
    // Priority 3: Flag pattern forming but NOT broken out - DO NOT ENTER YET
    else if (flag && (flag.status === "forming" || flag.status === "breakout_pending")) {
      signalType = isBullish ? "bullish_setup" : "bearish_setup";
      status = "forming";
      confidence = 50; // Lower confidence because we're waiting
      
      if (isBullish) {
        description = `Bull flag FORMING on ${timeframe}. Consolidating between ${flag.flagLow.toFixed(2)}-${flag.flagHigh.toFixed(2)}. WAIT for breakout above ${flag.flagHigh.toFixed(2)} before entry!`;
        suggestedSL = flag.flagLow * 0.995;
        suggestedTP = flag.flagHigh + (flag.poleHeight * 0.8);
        entryPrice = flag.breakoutLevel; // Entry would be at breakout level
        patternType = "Bull Flag Forming - WAIT";
      } else {
        description = `Bear flag FORMING on ${timeframe}. Consolidating between ${flag.flagLow.toFixed(2)}-${flag.flagHigh.toFixed(2)}. WAIT for breakout below ${flag.flagLow.toFixed(2)} before entry!`;
        suggestedSL = flag.flagHigh * 1.005;
        suggestedTP = flag.flagLow - (flag.poleHeight * 0.8);
        entryPrice = flag.breakoutLevel;
        patternType = "Bear Flag Forming - WAIT";
      }
    }
    // No actionable pattern
    else {
      return null;
    }
    
    return {
      id: `${coin}-${timeframe}-${Date.now()}`,
      coin,
      type: signalType!,
      status: status!,
      timeframe,
      sma21: currentSMA.sma21,
      sma200: currentSMA.sma200,
      currentPrice: currentSMA.price,
      entryPrice: entryPrice!,
      suggestedSL: suggestedSL!,
      suggestedTP: suggestedTP!,
      confidence: confidence!,
      detectedAt: new Date(),
      description: description!,
      patternType: patternType!,
    };
  } catch (error) {
    console.error(`Error analyzing ${coin} for signals:`, error);
    return null;
  }
}

// Scan multiple coins for signals across all timeframes
export async function scanForSignals(
  coins: string[] = ["BTC", "ETH", "SOL", "DOGE", "AVAX", "LINK", "ARB", "SUI", "OP"],
  timeframes: string[] = ["1m", "5m", "15m", "1h", "4h", "1d"]
): Promise<CrossoverSignal[]> {
  const signals: CrossoverSignal[] = [];
  
  for (const coin of coins) {
    for (const timeframe of timeframes) {
      try {
        const signal = await analyzeCoinForSignals(coin, timeframe);
        if (signal) {
          signals.push(signal);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error scanning ${coin} ${timeframe}:`, error);
      }
    }
  }
  
  // Sort: breakouts first, then by confidence
  signals.sort((a, b) => {
    // Breakout signals first
    if (a.status === "breakout" && b.status !== "breakout") return -1;
    if (b.status === "breakout" && a.status !== "breakout") return 1;
    // Then by confidence
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });
  
  return signals;
}

// Get current SMA status for a coin
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
