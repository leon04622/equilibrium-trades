import type { CctpBridgeProgressSync } from "@/context/AuthContext";

/** Circle message already minted on HyperEVM (stale attestation, replay, etc.). */
export function isLikelyMintConsumedError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    (m.includes("nonce") && (m.includes("used") || m.includes("already"))) ||
    m.includes("already received") ||
    m.includes("message already") ||
    m.includes("not attester") ||
    m.includes("invalid signature") ||
    m.includes("message hash already used")
  );
}

const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function progressAgeMs(progress: CctpBridgeProgressSync): number | null {
  const raw = progress.updatedAt;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? Date.now() - ms : null;
}

/** Burn already sent — resume attestation/mint only (no new Arbitrum sign + send). */
export function isCctpPostBurnResumeEligible(
  progress: CctpBridgeProgressSync | null | undefined,
): boolean {
  if (!progress?.messageHash?.trim() || !progress?.cctpMessageHex?.trim()) return false;
  const age = progressAgeMs(progress);
  if (age != null && age > RESUME_MAX_AGE_MS) return false;
  const stage = String(progress.stage || "").toLowerCase();
  if (stage === "done" || stage === "completed") return false;
  const postBurn = new Set([
    "wait_attestation",
    "attestation",
    "attestation_complete",
    "mint",
    "error",
    "error_mint",
    "failed_mint",
  ]);
  if (postBurn.has(stage) || stage.startsWith("error") || stage.startsWith("failed")) {
    return true;
  }
  if (progress.attestationHex?.trim()) return true;
  if (progress.burnTxHash?.trim() || progress.txHash?.trim()) return true;
  return false;
}
