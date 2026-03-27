export function journalEntryGrade(patternStatus: string | null | undefined): "A" | "Speculative" {
  if (patternStatus === "developed") return "A";
  return "Speculative";
}

/**
 * Planned reward:risk from entry vs SL/TP. "Negative R:R" when reward distance is less than risk distance.
 */
export function computePlannedRewardRisk(
  side: "long" | "short",
  entryPrice: number,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined,
): { negativeRR: boolean; rewardRiskRatio: number | null } {
  const sl = stopLoss != null && Number.isFinite(stopLoss) ? stopLoss : null;
  const tp = takeProfit != null && Number.isFinite(takeProfit) ? takeProfit : null;
  if (sl == null || tp == null) {
    return { negativeRR: false, rewardRiskRatio: null };
  }

  if (side === "long") {
    const risk = entryPrice - sl;
    const reward = tp - entryPrice;
    if (risk <= 0 || reward <= 0) {
      return { negativeRR: false, rewardRiskRatio: null };
    }
    const rewardRiskRatio = reward / risk;
    return { negativeRR: reward < risk, rewardRiskRatio };
  }

  const risk = sl - entryPrice;
  const reward = entryPrice - tp;
  if (risk <= 0 || reward <= 0) {
    return { negativeRR: false, rewardRiskRatio: null };
  }
  const rewardRiskRatio = reward / risk;
  return { negativeRR: reward < risk, rewardRiskRatio };
}
