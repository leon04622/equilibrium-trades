/** EIP-191 message for Equilibrium platform builder approval (must match what the user signs). */
export const EQUILIBRIUM_BUILDER_CODE = "EQUILIBRIUM_BUILDER";

export function buildEquilibriumBuilderApprovalMessage(): string {
  return `I authorize Equilibrium (${EQUILIBRIUM_BUILDER_CODE}) to act as my builder on Hyperliquid. This approval allows Equilibrium to submit trading orders on my behalf. I understand that I remain in full control of my funds at all times.

When you place your first trade, your wallet will also ask you to approve a Hyperliquid builder fee (0.03%) paid to the platform on your fills — this is separate from this message and is required for the app to route orders with builder attribution.

Timestamp: ${new Date().toISOString().split("T")[0]}`;
}
