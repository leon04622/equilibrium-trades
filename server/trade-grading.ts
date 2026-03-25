import type { TradeGrade, InsertTradeGrade } from "@shared/schema";

interface TradeInput {
  walletAddress: string;
  coin: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  leverage: number;
  size: number;
  patternType?: string;
  timeframe?: string;
}

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function gradeTrade(input: TradeInput): InsertTradeGrade {
  const notes: string[] = [
    "Equilibrium lens: align with 21/200 SMMA bias on higher timeframes, plan R:R before entry, size for the stop — not the ego.",
  ];
  
  const pnl = input.side === "long" 
    ? (input.exitPrice - input.entryPrice) * input.size
    : (input.entryPrice - input.exitPrice) * input.size;
  
  const pnlPercent = ((input.exitPrice - input.entryPrice) / input.entryPrice) * 100 * 
    (input.side === "long" ? 1 : -1) * input.leverage;
  
  const risk = Math.abs(input.entryPrice - input.stopLoss);
  const reward = Math.abs(input.takeProfit - input.entryPrice);
  const plannedRR = risk > 0 ? reward / risk : 0;
  
  const actualReward = input.side === "long" 
    ? input.exitPrice - input.entryPrice 
    : input.entryPrice - input.exitPrice;
  const actualRR = risk > 0 ? actualReward / risk : 0;
  
  // 1. ENTRY SCORE (0-100)
  // Good entry = close to breakout level, not chasing
  let entryScore = 85;
  
  // If entry was at a reasonable distance from TP (not chasing)
  const entryToTPDistance = Math.abs(input.takeProfit - input.entryPrice);
  const totalMoveDistance = Math.abs(input.takeProfit - input.stopLoss);
  const entryQuality = totalMoveDistance > 0 ? entryToTPDistance / totalMoveDistance : 0;
  
  if (entryQuality >= 0.7) {
    entryScore = 95;
    notes.push("Excellent entry - close to breakout level");
  } else if (entryQuality >= 0.5) {
    entryScore = 80;
    notes.push("Good entry timing");
  } else if (entryQuality >= 0.3) {
    entryScore = 65;
    notes.push("Entry was slightly late - consider entering closer to breakout");
  } else {
    entryScore = 40;
    notes.push("Late entry - chased the move, higher risk");
  }
  
  // 2. STOP SCORE (0-100)
  // Good stop = proper distance, not too tight or wide
  let stopScore = 75;
  const stopPercent = (risk / input.entryPrice) * 100;
  
  // For crypto, 1-3% stop is generally good
  if (stopPercent >= 0.5 && stopPercent <= 2) {
    stopScore = 95;
    notes.push("Stop placement excellent - proper risk management");
  } else if (stopPercent > 2 && stopPercent <= 4) {
    stopScore = 80;
    notes.push("Stop is acceptable but could be tighter");
  } else if (stopPercent < 0.5) {
    stopScore = 50;
    notes.push("Stop too tight - may get stopped out prematurely");
  } else {
    stopScore = 40;
    notes.push("Stop too wide - risking too much per trade");
  }
  
  // 3. RR SCORE (0-100)
  // Good RR = at least 2:1, ideal 3:1
  let rrScore = 70;
  
  if (plannedRR >= 3) {
    rrScore = 100;
    notes.push(`Excellent R:R of ${plannedRR.toFixed(1)}:1`);
  } else if (plannedRR >= 2) {
    rrScore = 90;
    notes.push(`Good R:R of ${plannedRR.toFixed(1)}:1`);
  } else if (plannedRR >= 1.5) {
    rrScore = 70;
    notes.push(`Acceptable R:R of ${plannedRR.toFixed(1)}:1 - aim for 2:1 or better`);
  } else if (plannedRR >= 1) {
    rrScore = 50;
    notes.push(`Low R:R of ${plannedRR.toFixed(1)}:1 - not worth the risk`);
  } else {
    rrScore = 20;
    notes.push("Poor R:R - reward less than risk, avoid these setups");
  }
  
  // 4. LEVERAGE SCORE (0-100)
  // Appropriate leverage for the setup
  let leverageScore = 80;
  
  // Lower leverage is generally safer for beginners
  if (input.leverage <= 3) {
    leverageScore = 100;
    notes.push("Conservative leverage - great for capital preservation");
  } else if (input.leverage <= 5) {
    leverageScore = 90;
    notes.push("Moderate leverage - balanced risk/reward");
  } else if (input.leverage <= 10) {
    leverageScore = 70;
    notes.push("Higher leverage - be careful with position sizing");
  } else if (input.leverage <= 20) {
    leverageScore = 45;
    notes.push("High leverage - significant risk of liquidation");
  } else {
    leverageScore = 20;
    notes.push("Excessive leverage - gambling, not trading");
  }
  
  // 5. SETUP SCORE (0-100)
  // Valid pattern/setup identification
  let setupScore = 75;
  
  if (input.patternType) {
    // Has identified pattern - good
    if (input.patternType.toLowerCase().includes("flag") || 
        input.patternType.toLowerCase().includes("triangle") ||
        input.patternType.toLowerCase().includes("wedge")) {
      setupScore = 90;
      notes.push(`Valid continuation pattern: ${input.patternType}`);
    } else if (input.patternType.toLowerCase().includes("double") ||
               input.patternType.toLowerCase().includes("head")) {
      setupScore = 85;
      notes.push(`Valid reversal pattern: ${input.patternType}`);
    } else if (input.patternType.toLowerCase().includes("sma") ||
               input.patternType.toLowerCase().includes("crossover")) {
      setupScore = 88;
      notes.push("Trading with SMA crossover - following the trend");
    } else {
      setupScore = 70;
      notes.push(`Pattern identified: ${input.patternType}`);
    }
  } else {
    setupScore = 50;
    notes.push("No pattern identified - consider waiting for clearer setups");
  }
  
  // Calculate overall scores
  const totalScore = Math.round(
    (entryScore * 0.2) + 
    (stopScore * 0.2) + 
    (rrScore * 0.25) + 
    (leverageScore * 0.15) + 
    (setupScore * 0.2)
  );
  
  // Setup grade is based on entry, stop, RR, and pattern
  const setupAvg = (entryScore + rrScore + setupScore) / 3;
  // Execution grade is based on leverage and actual trade management
  const executionAvg = (stopScore + leverageScore) / 2;
  
  // Final outcome notes
  if (pnl > 0) {
    notes.push(`Winner: +$${pnl.toFixed(2)} (+${pnlPercent.toFixed(1)}%)`);
    if (actualRR >= plannedRR * 0.9) {
      notes.push("Hit target - excellent discipline!");
    } else if (actualRR > 0) {
      notes.push("Partial profit - consider letting winners run");
    }
  } else {
    notes.push(`Loser: -$${Math.abs(pnl).toFixed(2)} (${pnlPercent.toFixed(1)}%)`);
    if (Math.abs(actualReward) <= risk * 1.1) {
      notes.push("Stopped out at planned level - good discipline");
    } else {
      notes.push("Loss exceeded stop - improve stop discipline");
    }
  }
  
  return {
    walletAddress: input.walletAddress,
    coin: input.coin,
    side: input.side,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    leverage: input.leverage,
    size: input.size,
    pnl,
    pnlPercent,
    entryScore,
    stopScore,
    rrScore,
    leverageScore,
    setupScore,
    totalScore,
    setupGrade: scoreToGrade(setupAvg),
    executionGrade: scoreToGrade(executionAvg),
    patternType: input.patternType,
    timeframe: input.timeframe,
    notes,
    tradedAt: new Date(),
  };
}
