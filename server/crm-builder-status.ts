import type { WalletUser } from "@shared/schema";

/** Fields needed for admin CRM “Builder status” column. */
export type CrmBuilderStatusInput = Pick<
  WalletUser,
  "isBuilderLinked" | "builderCodeApproved" | "instantTradingCompletedAt" | "referralBuilderStatus"
>;

/**
 * Admin CRM label — distinct from `builderCodeApproved` (EIP-191 sign-in only).
 * “Linked” means Hyperliquid agent + builder fee handshake was recorded (`isBuilderLinked`).
 */
export function crmBuilderStatusFromUser(u: CrmBuilderStatusInput): string {
  if (u.isBuilderLinked) return "Linked";
  if (u.referralBuilderStatus === "builder_linked") return "Linked";
  /** Older rows: HL handshake timestamp without `isBuilderLinked` flag yet. */
  if (u.builderCodeApproved && u.instantTradingCompletedAt) return "Linked";
  if (u.builderCodeApproved) return "Sign-in only";
  return "Not linked";
}
