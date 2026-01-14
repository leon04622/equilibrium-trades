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

// Timeframe-specific thresholds
function getThresholds(timeframe: string) {
  // Lower timeframes need smaller percentage thresholds
  const thresholds: Record<string, { minPolePercent: number; minBreakoutPercent: number; flagLookback: number; poleLookback: number }> = {
    "1m":  { minPolePercent: 0.15, minBreakoutPercent: 0.05, flagLookback: 10, poleLookback: 30 },
    "5m":  { minPolePercent: 0.25, minBreakoutPercent: 0.08, flagLookback: 12, poleLookback: 35 },
    "15m": { minPolePercent: 0.4,  minBreakoutPercent: 0.10, flagLookback: 12, poleLookback: 40 },
    "1h":  { minPolePercent: 0.6,  minBreakoutPercent: 0.15, flagLookback: 15, poleLookback: 50 },
    "4h":  { minPolePercent: 1.0,  minBreakoutPercent: 0.20, flagLookback: 15, poleLookback: 50 },
    "1d":  { minPolePercent: 2.0,  minBreakoutPercent: 0.30, flagLookback: 15, poleLookback: 50 },
  };
  return thresholds[timeframe] || thresholds["1h"];
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
function detectPole(candles: HyperliquidCandle[], isBullish: boolean, timeframe: string): { start: number; end: number; height: number; startIdx: number; endIdx: number } | null {
  const thresholds = getThresholds(timeframe);
  const lookback = Math.min(thresholds.poleLookback, candles.length - 20);
  
  if (candles.length < lookback + 20) return null;
  
  // Look at candles before the most recent consolidation area
  const startIdx = candles.length - lookback - 15;
  const endIdx = candles.length - 15; // Leave last 15 for flag detection
  const searchCandles = candles.slice(startIdx, endIdx);
  
  const closePrices = searchCandles.map(c => parseFloat(c.c));
  const highPrices = searchCandles.map(c => parseFloat(c.h));
  const lowPrices = searchCandles.map(c => parseFloat(c.l));
  
  if (isBullish) {
    // For bull flag: find a strong upward impulse
    // Look for lowest point followed by highest point
    let bestPole = null;
    let bestHeight = 0;
    
    for (let i = 0; i < closePrices.length - 5; i++) {
      const localLow = lowPrices[i];
      const subsequentHighs = highPrices.slice(i + 1);
      const maxHigh = Math.max(...subsequentHighs);
      const maxHighIdx = i + 1 + subsequentHighs.indexOf(maxHigh);
      
      const poleHeight = maxHigh - localLow;
      const heightPercent = (poleHeight / localLow) * 100;
      
      if (heightPercent >= thresholds.minPolePercent && poleHeight > bestHeight) {
        bestPole = {
          start: localLow,
          end: maxHigh,
          height: poleHeight,
          startIdx: startIdx + i,
          endIdx: startIdx + maxHighIdx,
        };
        bestHeight = poleHeight;
      }
    }
    
    return bestPole;
  } else {
    // For bear flag: find a strong downward impulse
    let bestPole = null;
    let bestHeight = 0;
    
    for (let i = 0; i < closePrices.length - 5; i++) {
      const localHigh = highPrices[i];
      const subsequentLows = lowPrices.slice(i + 1);
      const minLow = Math.min(...subsequentLows);
      const minLowIdx = i + 1 + subsequentLows.indexOf(minLow);
      
      const poleHeight = localHigh - minLow;
      const heightPercent = (poleHeight / localHigh) * 100;
      
      if (heightPercent >= thresholds.minPolePercent && poleHeight > bestHeight) {
        bestPole = {
          start: localHigh,
          end: minLow,
          height: poleHeight,
          startIdx: startIdx + i,
          endIdx: startIdx + minLowIdx,
        };
        bestHeight = poleHeight;
      }
    }
    
    return bestPole;
  }
}

// Detect the "flag" - consolidation after the pole
function detectFlag(candles: HyperliquidCandle[], pole: { start: number; end: number; height: number; startIdx: number; endIdx: number }, isBullish: boolean, timeframe: string): FlagPattern | null {
  const thresholds = getThresholds(timeframe);
  
  // Flag should be in the most recent candles after the pole
  const flagStartIdx = Math.max(pole.endIdx, candles.length - thresholds.flagLookback);
  const flagCandles = candles.slice(flagStartIdx);
  
  if (flagCandles.length < 3) return null;
  
  const closePrices = flagCandles.map(c => parseFloat(c.c));
  const highPrices = flagCandles.map(c => parseFloat(c.h));
  const lowPrices = flagCandles.map(c => parseFloat(c.l));
  
  const flagHigh = Math.max(...highPrices);
  const flagLow = Math.min(...lowPrices);
  const flagRange = flagHigh - flagLow;
  const currentPrice = closePrices[closePrices.length - 1];
  
  // Flag should be a consolidation (smaller range than the pole)
  const flagToPoleRatio = flagRange / pole.height;
  
  // Flag consolidation should be 10-70% of pole height
  if (flagToPoleRatio > 0.75 || flagToPoleRatio < 0.05) {
    return null;
  }
  
  if (isBullish) {
    // Bull flag: price should be consolidating below or near the pole high
    // Flag should show sideways or slight downward movement (pullback)
    const isValidFlag = flagHigh <= pole.end * 1.005 && flagLow >= pole.end * 0.95;
    
    if (!isValidFlag) return null;
    
    const breakoutLevel = flagHigh;
    let status: FlagPattern["status"] = "forming";
    
    // Check if breakout is happening
    const breakoutPercent = ((currentPrice - flagHigh) / flagHigh) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice > flagHigh) {
      status = "breakout_pending";
    }
    
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
  } else {
    // Bear flag: price should be consolidating above or near the pole low
    const isValidFlag = flagLow >= pole.end * 0.995 && flagHigh <= pole.end * 1.05;
    
    if (!isValidFlag) return null;
    
    const breakoutLevel = flagLow;
    let status: FlagPattern["status"] = "forming";
    
    // Check if breakout is happening (break below)
    const breakoutPercent = ((flagLow - currentPrice) / flagLow) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice < flagLow) {
      status = "breakout_pending";
    }
    
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

// Detect crossovers by comparing current and previous SMA positions
export function detectCrossover(
  currentSMA: SMAValues,
  previousSMA: SMAValues | null
): "bullish_crossover" | "bearish_crossover" | null {
  if (!previousSMA) return null;
  
  const currentDiff = currentSMA.sma21 - currentSMA.sma200;
  const previousDiff = previousSMA.sma21 - previousSMA.sma200;
  
  if (previousDiff < 0 && currentDiff >= 0) {
    return "bullish_crossover";
  }
  
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
    const requiredCandles = 350; // Need plenty of candles for pattern detection
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
    const pole = detectPole(candles, isBullish, timeframe);
    
    // Detect flag pattern (consolidation + breakout status)
    const flag = pole ? detectFlag(candles, pole, isBullish, timeframe) : null;
    
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
        description = `BULL FLAG BREAKOUT on ${timeframe}! Flag formed and price broke above ${flag.flagHigh.toFixed(2)}. ENTER NOW with stop below flag low.`;
        suggestedSL = flag.flagLow * 0.998;
        suggestedTP = flag.breakoutLevel + (flag.poleHeight * 0.75);
        entryPrice = currentSMA.price;
        patternType = "Bull Flag Breakout - ENTRY NOW";
      } else {
        description = `BEAR FLAG BREAKOUT on ${timeframe}! Flag formed and price broke below ${flag.flagLow.toFixed(2)}. ENTER NOW with stop above flag high.`;
        suggestedSL = flag.flagHigh * 1.002;
        suggestedTP = flag.breakoutLevel - (flag.poleHeight * 0.75);
        entryPrice = currentSMA.price;
        patternType = "Bear Flag Breakout - ENTRY NOW";
      }
    }
    // Priority 3: Flag pattern forming but NOT broken out - DO NOT ENTER YET
    else if (flag && (flag.status === "forming" || flag.status === "breakout_pending")) {
      signalType = isBullish ? "bullish_setup" : "bearish_setup";
      status = "forming";
      confidence = 55;
      
      if (isBullish) {
        description = `Bull flag FORMING on ${timeframe}. Consolidating between $${flag.flagLow.toFixed(2)}-$${flag.flagHigh.toFixed(2)}. WAIT for breakout above $${flag.flagHigh.toFixed(2)} before entry!`;
        suggestedSL = flag.flagLow * 0.998;
        suggestedTP = flag.flagHigh + (flag.poleHeight * 0.75);
        entryPrice = flag.breakoutLevel;
        patternType = "Bull Flag Forming - WAIT";
      } else {
        description = `Bear flag FORMING on ${timeframe}. Consolidating between $${flag.flagLow.toFixed(2)}-$${flag.flagHigh.toFixed(2)}. WAIT for breakout below $${flag.flagLow.toFixed(2)} before entry!`;
        suggestedSL = flag.flagHigh * 1.002;
        suggestedTP = flag.flagLow - (flag.poleHeight * 0.75);
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
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Error scanning ${coin} ${timeframe}:`, error);
      }
    }
  }
  
  // Sort: breakouts first, then by confidence
  signals.sort((a, b) => {
    if (a.status === "breakout" && b.status !== "breakout") return -1;
    if (b.status === "breakout" && a.status !== "breakout") return 1;
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
