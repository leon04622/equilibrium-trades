export { checkSubscription, type SubscriptionCheckResult } from "@/lib/check-subscription";

/** Shown in the first-trade handshake modal (Sovereign Protocol + HL agent). */
export const TRADE_HANDSHAKE_USER_MESSAGE =
  "One-time setup: Activate gas-free trading and link to the Sovereign Protocol to execute this trade.";

/**
 * Call from order entry (LONG/SHORT) before building or sending an order.
 * Resolves true only after wallet, Equilibrium sign-in, and Hyperliquid session are ready.
 */
export type TradeReadinessGate = () => Promise<boolean>;
