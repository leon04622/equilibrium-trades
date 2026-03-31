/**
 * Execution L1 checks for Apex Terminal readiness (builder fee + API agent on L1).
 * Platform referral / builder attribution runs in the background via {@link trySetReferrer} in hyperliquid-client.
 */
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { getAddress } from "ethers";
import {
  HL_BUILDER_ADDRESS,
  HL_BUILDER_MAX_FEE_RATE,
  isBuilderFeeConfigured,
} from "@/lib/hyperliquid-platform-config";

export interface ApexHlOnboardingSnapshot {
  /** When builder is configured, true if on-chain max fee meets platform minimum. */
  builderFeeOk: boolean;
  maxBuilderFeeApproved: number | null;
  /** Stored agent address appears in extraAgents with validUntil in the future. */
  agentOnL1: boolean;
}

/**
 * Public L1 snapshot for terminal gating (Info API).
 */
export async function fetchApexHlOnboardingSnapshot(
  userAddress: string,
  localAgentAddress: string | null,
): Promise<ApexHlOnboardingSnapshot> {
  const transport = new HttpTransport({ isTestnet: false });
  const info = new InfoClient({ transport });
  const user = getAddress(userAddress) as `0x${string}`;

  let builderFeeOk = true;
  let maxBuilderFeeApproved: number | null = null;
  if (isBuilderFeeConfigured()) {
    const builder = getAddress(HL_BUILDER_ADDRESS) as `0x${string}`;
    const max = await info.maxBuilderFee({ user, builder });
    maxBuilderFeeApproved = typeof max === "number" && Number.isFinite(max) ? max : null;
    const need = parseFloat(HL_BUILDER_MAX_FEE_RATE) || 0.0003;
    builderFeeOk = maxBuilderFeeApproved != null && maxBuilderFeeApproved >= need * 0.95;
  }

  let agentOnL1 = false;
  if (localAgentAddress) {
    const agents = await info.extraAgents({ user });
    const now = Date.now();
    const want = localAgentAddress.toLowerCase();
    agentOnL1 = agents.some(
      (a) => a.address.toLowerCase() === want && Number(a.validUntil) > now,
    );
  }

  return { builderFeeOk, maxBuilderFeeApproved, agentOnL1 };
}
