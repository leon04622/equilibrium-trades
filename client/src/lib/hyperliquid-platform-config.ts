/**
 * Single source of truth for platform revenue on the connected execution venue.
 * Builder address is fixed for Equilibrium Trading (HL `approveBuilderFee` / order `builder` field).
 * Referral code may still be overridden with VITE_HL_REFERRAL_CODE.
 */

/** Production builder wallet (HL-registered) — earns 0.03% builder fee on routed orders when users approve on HL. */
export const HL_BUILDER_ADDRESS =
  "0xad9be64fd7a35d99a138b87cb212baefbcdcf045".toLowerCase();

export const HL_REFERRAL_CODE = (
  import.meta.env.VITE_HL_REFERRAL_CODE || "BANKS"
).trim();

/** Order wire `f` in tenths of basis points (10 = 1 bp); 3 ≈ 0.3 bp per HL builder-code docs. */
export const HL_BUILDER_FEE_F = 3 as const;
/** HL `approveBuilderFee` / EIP-712 — percent string per exchange API (not a decimal). */
export const HL_BUILDER_MAX_FEE_RATE = "0.03%" as const;

/** Decimal fraction for comparing Info API `maxBuilderFee` (e.g. 0.03% → 0.0003). */
export function hlMaxFeeRateAsDecimal(rate: string = HL_BUILDER_MAX_FEE_RATE): number {
  const t = rate.trim();
  if (t.endsWith("%")) {
    const pct = parseFloat(t.slice(0, -1));
    return Number.isFinite(pct) ? pct / 100 : 0.0003;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0.0003;
}

export function isBuilderFeeConfigured(): boolean {
  return HL_BUILDER_ADDRESS.startsWith("0x") && HL_BUILDER_ADDRESS.length >= 42;
}

export function isReferralConfigured(): boolean {
  return HL_REFERRAL_CODE.length > 0;
}
