/** EIP-191 message for Equilibrium platform builder approval (must match what the user signs). */
export const EQUILIBRIUM_BUILDER_CODE = "EQUILIBRIUM_BUILDER";

export function buildEquilibriumBuilderApprovalMessage(): string {
  return `I authorize Equilibrium (${EQUILIBRIUM_BUILDER_CODE}) to act as my builder on Hyperliquid. This approval allows Equilibrium to submit trading orders on my behalf. I understand that I remain in full control of my funds at all times.

After this message, you will be asked to approve a Hyperliquid trading agent and (if applicable) a one-time builder fee (0.03%) on Hyperliquid — both are required for the app to route orders with platform attribution. Those prompts happen once per device; later trades do not require a wallet signature.

Timestamp: ${new Date().toISOString().split("T")[0]}`;
}
