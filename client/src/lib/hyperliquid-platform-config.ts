/**
 * Single source of truth for platform revenue on Hyperliquid.
 * Override with VITE_BUILDER_ADDRESS / VITE_HL_REFERRAL_CODE in `.env` or `.env.production` (rebuild after change).
 */

/** Production builder wallet (HL-registered) — earns 0.03% builder fee on routed orders when users approve on HL. */
const DEFAULT_BUILDER_ADDRESS = "0xad9be64fd7a35d99a138b87cb212baefbcdcf045";

export const HL_REFERRAL_CODE = (
  import.meta.env.VITE_HL_REFERRAL_CODE || "BANKS"
).trim();

const rawBuilder = (
  import.meta.env.VITE_BUILDER_ADDRESS || DEFAULT_BUILDER_ADDRESS
).trim();
export const HL_BUILDER_ADDRESS = rawBuilder.toLowerCase();

/** Order wire `f` and EIP-712 maxFeeRate must stay in sync (0.03%). */
export const HL_BUILDER_FEE_F = 3 as const;
export const HL_BUILDER_MAX_FEE_RATE = "0.0003" as const;

export function isBuilderFeeConfigured(): boolean {
  return HL_BUILDER_ADDRESS.startsWith("0x") && HL_BUILDER_ADDRESS.length >= 42;
}

export function isReferralConfigured(): boolean {
  return HL_REFERRAL_CODE.length > 0;
}
