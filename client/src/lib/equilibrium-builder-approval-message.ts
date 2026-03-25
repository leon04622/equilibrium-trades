import { getAddress } from "ethers";

/** Public builder id (not secret); included so the signed text describes scope. */
export const EQUILIBRIUM_BUILDER_CODE = "EQUILIBRIUM_BUILDER";

/**
 * Plain UTF-8 EIP-191 message — exact bytes must be sent to POST /approve-builder-code.
 * Use one `timestampMs` for both signMessage() and the request body (never rebuild with a new timestamp).
 */
export function buildEquilibriumBuilderApprovalMessage(
  walletAddress: string,
  timestampMs: number,
): string {
  const wallet = getAddress(walletAddress.trim());
  return [
    "Sign in to Equilibrium Trading",
    `Wallet: ${wallet}`,
    `Timestamp: ${timestampMs}`,
    `By signing, I authorize Equilibrium (${EQUILIBRIUM_BUILDER_CODE}) as my Hyperliquid builder for order attribution only.`,
  ].join("\n");
}
