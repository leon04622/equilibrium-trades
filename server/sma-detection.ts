// SMA Crossover & Pattern Detection System
// Based on the 21/200 SMA Crossover Strategy from cryptolifer.com
// 
// PATTERNS DETECTED:
// Continuation: Bull Flag, Bear Flag, Pennant, Ascending/Descending/Symmetrical Triangles
// Reversal: Double Top/Bottom, Head & Shoulders, Wedges
//
// METHODOLOGY:
// 1. Determine bias: 21 SMA > 200 SMA = bullish, 21 SMA < 200 SMA = bearish
// 2. Identify pattern formation
// 3. Wait for BREAKOUT confirmation
// 4. ONLY signal entry after breakout is confirmed

import { getCandles, HyperliquidCandle } from "./hyperliquid";

export interface SMAValues {
  sma21: number;
  sma200: number;
  price: number;
  timestamp: number;
}

export type PatternName = 
  | "bull_flag" | "bear_flag" 
  | "bullish_pennant" | "bearish_pennant"
  | "ascending_triangle" | "descending_triangle" | "symmetrical_triangle"
  | "double_bottom" | "double_top"
  | "rising_wedge" | "falling_wedge"
  | "cup_and_handle";

export interface DetectedPattern {
  name: PatternName;
  displayName: string;
  status: "forming" | "breakout_pending" | "breakout_confirmed";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  breakoutLevel: number;
  currentPrice: number;
  confidence: number;
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
  const thresholds: Record<string, { minMovePercent: number; minBreakoutPercent: number; lookback: number }> = {
    "1m":  { minMovePercent: 0.15, minBreakoutPercent: 0.05, lookback: 30 },
    "5m":  { minMovePercent: 0.25, minBreakoutPercent: 0.08, lookback: 35 },
    "15m": { minMovePercent: 0.4,  minBreakoutPercent: 0.10, lookback: 40 },
    "1h":  { minMovePercent: 0.6,  minBreakoutPercent: 0.15, lookback: 50 },
    "4h":  { minMovePercent: 1.0,  minBreakoutPercent: 0.20, lookback: 50 },
    "1d":  { minMovePercent: 2.0,  minBreakoutPercent: 0.30, lookback: 50 },
  };
  return thresholds[timeframe] || thresholds["1h"];
}

function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

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

// Find swing highs and lows
function findSwingPoints(candles: HyperliquidCandle[], lookback: number = 5): { highs: { price: number; idx: number }[]; lows: { price: number; idx: number }[] } {
  const highs: { price: number; idx: number }[] = [];
  const lows: { price: number; idx: number }[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = parseFloat(candles[i].h);
    const currentLow = parseFloat(candles[i].l);
    
    let isSwingHigh = true;
    let isSwingLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (parseFloat(candles[i - j].h) >= currentHigh || parseFloat(candles[i + j].h) >= currentHigh) {
        isSwingHigh = false;
      }
      if (parseFloat(candles[i - j].l) <= currentLow || parseFloat(candles[i + j].l) <= currentLow) {
        isSwingLow = false;
      }
    }
    
    if (isSwingHigh) highs.push({ price: currentHigh, idx: i });
    if (isSwingLow) lows.push({ price: currentLow, idx: i });
  }
  
  return { highs, lows };
}

// Detect Bull/Bear Flag patterns
function detectFlagPattern(candles: HyperliquidCandle[], isBullish: boolean, timeframe: string): DetectedPattern | null {
  const thresholds = getThresholds(timeframe);
  if (candles.length < 50) return null;
  
  const recentCandles = candles.slice(-50);
  const closePrices = recentCandles.map(c => parseFloat(c.c));
  const highPrices = recentCandles.map(c => parseFloat(c.h));
  const lowPrices = recentCandles.map(c => parseFloat(c.l));
  
  // Find the pole (impulse move)
  let poleStart = 0, poleEnd = 0, poleHeight = 0;
  
  if (isBullish) {
    const minIdx = lowPrices.slice(0, 30).indexOf(Math.min(...lowPrices.slice(0, 30)));
    const maxAfterMin = Math.max(...highPrices.slice(minIdx, 35));
    const maxIdx = minIdx + highPrices.slice(minIdx, 35).indexOf(maxAfterMin);
    
    poleStart = lowPrices[minIdx];
    poleEnd = maxAfterMin;
    poleHeight = poleEnd - poleStart;
    
    const heightPercent = (poleHeight / poleStart) * 100;
    if (heightPercent < thresholds.minMovePercent) return null;
    
    // Check for flag consolidation in last 15 candles
    const flagCandles = recentCandles.slice(-15);
    const flagHigh = Math.max(...flagCandles.map(c => parseFloat(c.h)));
    const flagLow = Math.min(...flagCandles.map(c => parseFloat(c.l)));
    const currentPrice = closePrices[closePrices.length - 1];
    
    const flagRange = flagHigh - flagLow;
    if (flagRange / poleHeight > 0.7) return null; // Flag too large
    
    let status: DetectedPattern["status"] = "forming";
    const breakoutPercent = ((currentPrice - flagHigh) / flagHigh) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice > flagHigh) {
      status = "breakout_pending";
    }
    
    const slBuffer = flagRange * 0.1;
    return {
      name: "bull_flag",
      displayName: "Bull Flag",
      status,
      entryPrice: status === "breakout_confirmed" ? currentPrice : flagHigh,
      stopLoss: flagLow - slBuffer,
      takeProfit: flagHigh + poleHeight,
      breakoutLevel: flagHigh,
      currentPrice,
      confidence: status === "breakout_confirmed" ? 80 : 55,
    };
  } else {
    const maxIdx = highPrices.slice(0, 30).indexOf(Math.max(...highPrices.slice(0, 30)));
    const minAfterMax = Math.min(...lowPrices.slice(maxIdx, 35));
    
    poleStart = highPrices[maxIdx];
    poleEnd = minAfterMax;
    poleHeight = poleStart - poleEnd;
    
    const heightPercent = (poleHeight / poleStart) * 100;
    if (heightPercent < thresholds.minMovePercent) return null;
    
    const flagCandles = recentCandles.slice(-15);
    const flagHigh = Math.max(...flagCandles.map(c => parseFloat(c.h)));
    const flagLow = Math.min(...flagCandles.map(c => parseFloat(c.l)));
    const currentPrice = closePrices[closePrices.length - 1];
    
    const flagRange = flagHigh - flagLow;
    if (flagRange / poleHeight > 0.7) return null;
    
    let status: DetectedPattern["status"] = "forming";
    const breakoutPercent = ((flagLow - currentPrice) / flagLow) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice < flagLow) {
      status = "breakout_pending";
    }
    
    const slBuffer = flagRange * 0.1;
    return {
      name: "bear_flag",
      displayName: "Bear Flag",
      status,
      entryPrice: status === "breakout_confirmed" ? currentPrice : flagLow,
      stopLoss: flagHigh + slBuffer,
      takeProfit: flagLow - poleHeight,
      breakoutLevel: flagLow,
      currentPrice,
      confidence: status === "breakout_confirmed" ? 80 : 55,
    };
  }
}

// Detect Triangle patterns (Ascending, Descending, Symmetrical)
function detectTrianglePattern(candles: HyperliquidCandle[], isBullish: boolean, timeframe: string): DetectedPattern | null {
  if (candles.length < 40) return null;
  
  const thresholds = getThresholds(timeframe);
  const recentCandles = candles.slice(-40);
  const { highs, lows } = findSwingPoints(recentCandles, 3);
  
  if (highs.length < 2 || lows.length < 2) return null;
  
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  
  if (recentHighs.length < 2 || recentLows.length < 2) return null;
  
  // Calculate trendlines
  const highSlope = (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) / (recentHighs[recentHighs.length - 1].idx - recentHighs[0].idx || 1);
  const lowSlope = (recentLows[recentLows.length - 1].price - recentLows[0].price) / (recentLows[recentLows.length - 1].idx - recentLows[0].idx || 1);
  
  const currentPrice = parseFloat(recentCandles[recentCandles.length - 1].c);
  const resistance = recentHighs[recentHighs.length - 1].price;
  const support = recentLows[recentLows.length - 1].price;
  const range = resistance - support;
  
  let patternName: PatternName | null = null;
  let displayName = "";
  
  // Ascending Triangle: flat resistance, rising support
  if (Math.abs(highSlope) < 0.001 && lowSlope > 0) {
    patternName = "ascending_triangle";
    displayName = "Ascending Triangle";
  }
  // Descending Triangle: falling resistance, flat support
  else if (highSlope < 0 && Math.abs(lowSlope) < 0.001) {
    patternName = "descending_triangle";
    displayName = "Descending Triangle";
  }
  // Symmetrical Triangle: converging lines
  else if (highSlope < 0 && lowSlope > 0) {
    patternName = "symmetrical_triangle";
    displayName = "Symmetrical Triangle";
  }
  
  if (!patternName) return null;
  
  let status: DetectedPattern["status"] = "forming";
  let breakoutLevel: number;
  let stopLoss: number;
  let takeProfit: number;
  
  if (isBullish && (patternName === "ascending_triangle" || patternName === "symmetrical_triangle")) {
    breakoutLevel = resistance;
    const breakoutPercent = ((currentPrice - resistance) / resistance) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    }
    stopLoss = support - (range * 0.1);
    takeProfit = resistance + range;
  } else if (!isBullish && (patternName === "descending_triangle" || patternName === "symmetrical_triangle")) {
    breakoutLevel = support;
    const breakoutPercent = ((support - currentPrice) / support) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    }
    stopLoss = resistance + (range * 0.1);
    takeProfit = support - range;
  } else {
    return null;
  }
  
  return {
    name: patternName,
    displayName,
    status,
    entryPrice: status === "breakout_confirmed" ? currentPrice : breakoutLevel,
    stopLoss,
    takeProfit,
    breakoutLevel,
    currentPrice,
    confidence: status === "breakout_confirmed" ? 75 : 50,
  };
}

// Detect Double Top/Bottom patterns
function detectDoublePattern(candles: HyperliquidCandle[], isBullish: boolean, timeframe: string): DetectedPattern | null {
  if (candles.length < 50) return null;
  
  const thresholds = getThresholds(timeframe);
  const recentCandles = candles.slice(-50);
  const { highs, lows } = findSwingPoints(recentCandles, 4);
  
  if (isBullish && lows.length >= 2) {
    // Double Bottom - bullish reversal
    const lastTwoLows = lows.slice(-2);
    const priceDiff = Math.abs(lastTwoLows[0].price - lastTwoLows[1].price);
    const avgLow = (lastTwoLows[0].price + lastTwoLows[1].price) / 2;
    
    if ((priceDiff / avgLow) * 100 < 1) { // Lows within 1%
      const neckline = Math.max(...highs.filter(h => h.idx > lastTwoLows[0].idx && h.idx < lastTwoLows[1].idx).map(h => h.price)) || avgLow * 1.02;
      const currentPrice = parseFloat(recentCandles[recentCandles.length - 1].c);
      const patternHeight = neckline - avgLow;
      
      let status: DetectedPattern["status"] = "forming";
      const breakoutPercent = ((currentPrice - neckline) / neckline) * 100;
      if (breakoutPercent > thresholds.minBreakoutPercent) {
        status = "breakout_confirmed";
      }
      
      return {
        name: "double_bottom",
        displayName: "Double Bottom",
        status,
        entryPrice: status === "breakout_confirmed" ? currentPrice : neckline,
        stopLoss: avgLow - (patternHeight * 0.1),
        takeProfit: neckline + patternHeight,
        breakoutLevel: neckline,
        currentPrice,
        confidence: status === "breakout_confirmed" ? 75 : 50,
      };
    }
  } else if (!isBullish && highs.length >= 2) {
    // Double Top - bearish reversal
    const lastTwoHighs = highs.slice(-2);
    const priceDiff = Math.abs(lastTwoHighs[0].price - lastTwoHighs[1].price);
    const avgHigh = (lastTwoHighs[0].price + lastTwoHighs[1].price) / 2;
    
    if ((priceDiff / avgHigh) * 100 < 1) {
      const neckline = Math.min(...lows.filter(l => l.idx > lastTwoHighs[0].idx && l.idx < lastTwoHighs[1].idx).map(l => l.price)) || avgHigh * 0.98;
      const currentPrice = parseFloat(recentCandles[recentCandles.length - 1].c);
      const patternHeight = avgHigh - neckline;
      
      let status: DetectedPattern["status"] = "forming";
      const breakoutPercent = ((neckline - currentPrice) / neckline) * 100;
      if (breakoutPercent > thresholds.minBreakoutPercent) {
        status = "breakout_confirmed";
      }
      
      return {
        name: "double_top",
        displayName: "Double Top",
        status,
        entryPrice: status === "breakout_confirmed" ? currentPrice : neckline,
        stopLoss: avgHigh + (patternHeight * 0.1),
        takeProfit: neckline - patternHeight,
        breakoutLevel: neckline,
        currentPrice,
        confidence: status === "breakout_confirmed" ? 75 : 50,
      };
    }
  }
  
  return null;
}

// Detect Wedge patterns (Rising/Falling)
function detectWedgePattern(candles: HyperliquidCandle[], isBullish: boolean, timeframe: string): DetectedPattern | null {
  if (candles.length < 40) return null;
  
  const thresholds = getThresholds(timeframe);
  const recentCandles = candles.slice(-40);
  const { highs, lows } = findSwingPoints(recentCandles, 3);
  
  if (highs.length < 3 || lows.length < 3) return null;
  
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  
  const highSlope = (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) / (recentHighs[recentHighs.length - 1].idx - recentHighs[0].idx || 1);
  const lowSlope = (recentLows[recentLows.length - 1].price - recentLows[0].price) / (recentLows[recentLows.length - 1].idx - recentLows[0].idx || 1);
  
  const currentPrice = parseFloat(recentCandles[recentCandles.length - 1].c);
  const resistance = recentHighs[recentHighs.length - 1].price;
  const support = recentLows[recentLows.length - 1].price;
  const range = resistance - support;
  
  // Rising Wedge (bearish) - both lines rising, converging
  if (highSlope > 0 && lowSlope > 0 && highSlope < lowSlope && !isBullish) {
    let status: DetectedPattern["status"] = "forming";
    const breakoutPercent = ((support - currentPrice) / support) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    }
    
    return {
      name: "rising_wedge",
      displayName: "Rising Wedge (Bearish)",
      status,
      entryPrice: status === "breakout_confirmed" ? currentPrice : support,
      stopLoss: resistance + (range * 0.1),
      takeProfit: support - range,
      breakoutLevel: support,
      currentPrice,
      confidence: status === "breakout_confirmed" ? 70 : 45,
    };
  }
  
  // Falling Wedge (bullish) - both lines falling, converging
  if (highSlope < 0 && lowSlope < 0 && highSlope > lowSlope && isBullish) {
    let status: DetectedPattern["status"] = "forming";
    const breakoutPercent = ((currentPrice - resistance) / resistance) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    }
    
    return {
      name: "falling_wedge",
      displayName: "Falling Wedge (Bullish)",
      status,
      entryPrice: status === "breakout_confirmed" ? currentPrice : resistance,
      stopLoss: support - (range * 0.1),
      takeProfit: resistance + range,
      breakoutLevel: resistance,
      currentPrice,
      confidence: status === "breakout_confirmed" ? 70 : 45,
    };
  }
  
  return null;
}

// Detect crossovers
export function detectCrossover(
  currentSMA: SMAValues,
  previousSMA: SMAValues | null
): "bullish_crossover" | "bearish_crossover" | null {
  if (!previousSMA) return null;
  
  const currentDiff = currentSMA.sma21 - currentSMA.sma200;
  const previousDiff = previousSMA.sma21 - previousSMA.sma200;
  
  if (previousDiff < 0 && currentDiff >= 0) return "bullish_crossover";
  if (previousDiff > 0 && currentDiff <= 0) return "bearish_crossover";
  
  return null;
}

// Main analysis function - scans for ALL pattern types
export async function analyzeCoinForSignals(
  coin: string,
  timeframe: string = "1m"
): Promise<CrossoverSignal | null> {
  try {
    const intervalMap: Record<string, string> = {
      "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d",
    };
    
    const interval = intervalMap[timeframe] || "1m";
    const candleMinutes: Record<string, number> = {
      "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440,
    };
    
    const minutes = candleMinutes[timeframe] || 1;
    const requiredCandles = 350;
    const durationMs = requiredCandles * minutes * 60 * 1000;
    
    const endTime = Date.now();
    const startTime = endTime - durationMs;
    
    const candles = await getCandles(coin, interval, startTime, endTime);
    
    if (candles.length < 210) return null;
    
    const currentSMA = calculateSMAFromCandles(candles);
    if (!currentSMA) return null;
    
    const isBullish = currentSMA.sma21 > currentSMA.sma200;
    
    // Check for SMA crossover first
    const previousCandles = candles.slice(0, -5);
    const previousSMA = calculateSMAFromCandles(previousCandles);
    const crossover = detectCrossover(currentSMA, previousSMA);
    
    if (crossover) {
      return {
        id: `${coin}-${timeframe}-${Date.now()}`,
        coin,
        type: crossover,
        status: "confirmed",
        timeframe,
        sma21: currentSMA.sma21,
        sma200: currentSMA.sma200,
        currentPrice: currentSMA.price,
        entryPrice: currentSMA.price,
        suggestedSL: crossover === "bullish_crossover" ? currentSMA.sma200 * 0.99 : currentSMA.sma200 * 1.01,
        suggestedTP: crossover === "bullish_crossover" ? currentSMA.price * 1.03 : currentSMA.price * 0.97,
        confidence: 85,
        detectedAt: new Date(),
        description: `21 SMA crossed ${crossover === "bullish_crossover" ? "ABOVE" : "BELOW"} 200 SMA on ${timeframe}. ${crossover === "bullish_crossover" ? "Bullish" : "Bearish"} bias confirmed. Look for pattern setups!`,
        patternType: `SMA Crossover - ${crossover === "bullish_crossover" ? "Bullish" : "Bearish"}`,
      };
    }
    
    // Scan for all pattern types (prioritize breakouts)
    const patterns: DetectedPattern[] = [];
    
    // Try all pattern detectors
    const flagPattern = detectFlagPattern(candles, isBullish, timeframe);
    if (flagPattern) patterns.push(flagPattern);
    
    const trianglePattern = detectTrianglePattern(candles, isBullish, timeframe);
    if (trianglePattern) patterns.push(trianglePattern);
    
    const doublePattern = detectDoublePattern(candles, isBullish, timeframe);
    if (doublePattern) patterns.push(doublePattern);
    
    const wedgePattern = detectWedgePattern(candles, isBullish, timeframe);
    if (wedgePattern) patterns.push(wedgePattern);
    
    if (patterns.length === 0) return null;
    
    // Sort: breakouts first, then by confidence
    patterns.sort((a, b) => {
      if (a.status === "breakout_confirmed" && b.status !== "breakout_confirmed") return -1;
      if (b.status === "breakout_confirmed" && a.status !== "breakout_confirmed") return 1;
      return b.confidence - a.confidence;
    });
    
    const bestPattern = patterns[0];
    const risk = Math.abs(bestPattern.entryPrice - bestPattern.stopLoss);
    const reward = Math.abs(bestPattern.takeProfit - bestPattern.entryPrice);
    const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : "0";
    
    let description: string;
    let status: CrossoverSignal["status"];
    
    if (bestPattern.status === "breakout_confirmed") {
      status = "breakout";
      description = `${bestPattern.displayName} BREAKOUT on ${timeframe}! Entry $${bestPattern.entryPrice.toFixed(2)}, SL $${bestPattern.stopLoss.toFixed(2)}, TP $${bestPattern.takeProfit.toFixed(2)}. R:R ${rrRatio}:1`;
    } else {
      status = "forming";
      description = `${bestPattern.displayName} FORMING on ${timeframe}. Breakout level: $${bestPattern.breakoutLevel.toFixed(2)}. WAIT for confirmation! Potential R:R ${rrRatio}:1`;
    }
    
    return {
      id: `${coin}-${timeframe}-${Date.now()}`,
      coin,
      type: isBullish ? "bullish_setup" : "bearish_setup",
      status,
      timeframe,
      sma21: currentSMA.sma21,
      sma200: currentSMA.sma200,
      currentPrice: currentSMA.price,
      entryPrice: bestPattern.entryPrice,
      suggestedSL: bestPattern.stopLoss,
      suggestedTP: bestPattern.takeProfit,
      confidence: bestPattern.confidence,
      detectedAt: new Date(),
      description,
      patternType: bestPattern.status === "breakout_confirmed" 
        ? `${bestPattern.displayName} - ENTRY NOW` 
        : `${bestPattern.displayName} - WAIT`,
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
