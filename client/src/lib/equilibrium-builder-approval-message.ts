import { getAddress } from "ethers";

/** Public builder id (not secret); included so the signed text describes scope. */
export const EQUILIBRIUM_BUILDER_CODE = "EQUILIBRIUM_BUILDER";

/** Must match venue `approveBuilderFee` / order builder field (server validates substring). */
export const EQUILIBRIUM_HL_BUILDER_ADDRESS_CHECKSUM =
  "0xad9be64fd7a35d99a138b87cb212baefbcdcf045" as const;

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
    `By signing, I authorize Equilibrium (${EQUILIBRIUM_BUILDER_CODE}) as my builder for order attribution on the connected execution venue only.`,
    `Builder address (approveBuilderFee): ${EQUILIBRIUM_HL_BUILDER_ADDRESS_CHECKSUM}`,
  ].join("\n");
}
