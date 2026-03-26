/**
 * Hyperliquid L1 onboarding checks (referral / builder fee / API agent).
 * Maps product language "builder protocol" to HL referral + maxBuilderFee + extraAgents.
 */
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { getAddress, type JsonRpcSigner } from "ethers";
import {
  HL_BUILDER_ADDRESS,
  HL_BUILDER_MAX_FEE_RATE,
  HL_REFERRAL_CODE,
  isBuilderFeeConfigured,
} from "@/lib/hyperliquid-platform-config";

export type HlReferralStatus = "none" | "platform" | "other";

export interface ApexHlOnboardingSnapshot {
  referral: HlReferralStatus;
  /** True when builder fee is not configured, or on-chain max fee meets platform minimum. */
  builderFeeOk: boolean;
  /** Raw max builder fee from HL info (when configured). */
  maxBuilderFeeApproved: number | null;
  /**
   * Stored agent address is listed on L1 with validUntil in the future.
   * Requires the browser-stored agent address (if any).
   */
  agentOnL1: boolean;
}

function normalizeCode(code: string | undefined | null): string {
  return (code ?? "").trim().toUpperCase();
}

/**
 * Aggregates public L1 state for the connected wallet (Info API).
 * @param localAgentAddress — address of the delegated key from local storage, if any.
 */
export async function fetchApexHlOnboardingSnapshot(
  userAddress: string,
  localAgentAddress: string | null,
): Promise<ApexHlOnboardingSnapshot> {
  const transport = new HttpTransport({ isTestnet: false });
  const info = new InfoClient({ transport });
  const user = getAddress(userAddress) as `0x${string}`;

  const ref = await info.referral({ user });
  let referral: HlReferralStatus = "none";
  if (ref.referredBy?.code) {
    referral =
      normalizeCode(ref.referredBy.code) === normalizeCode(HL_REFERRAL_CODE) ? "platform" : "other";
  }

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

  return { referral, builderFeeOk, maxBuilderFeeApproved, agentOnL1 };
}

/**
 * One-time L1 link: set referral code to the platform code (Hyperliquid `setReferrer`).
 * No-op success if the user already has a different referrer (handled by HL error — surface to UI).
 */
export async function linkHyperliquidReferralCode(
  signer: JsonRpcSigner,
  code: string = HL_REFERRAL_CODE,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Referral code is not configured." };
  }
  try {
    const transport = new HttpTransport({ isTestnet: false });
    const client = new ExchangeClient({ transport, wallet: signer });
    await client.setReferrer({ code: trimmed });
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already|referr/i.test(msg)) {
      return { ok: true };
    }
    return { ok: false, error: msg };
  }
}
