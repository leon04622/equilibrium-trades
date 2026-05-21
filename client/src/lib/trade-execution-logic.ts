export {
  checkSubscription,
  type SubscriptionCheckResult,
  type TradeReadinessGate,
  TRADE_HANDSHAKE_USER_MESSAGE,
  EQUILIBRIUM_HL_BUILDER_ADDRESS,
  runEquilibriumLifetimeHandshake,
  hasLocalLifetimeHandshakeDone,
  markLocalLifetimeHandshakeDone,
  lifetimeHandshakeStorageKey,
  saveTradeToJournal,
} from "@/lib/TradeExecution";
export {
  ARBITRUM_CHAIN_ID,
  isTradingHandshakeComplete,
  isFullyTradeReady,
  ensureWalletOnArbitrum,
  type TradeReadinessSnapshot,
} from "@/lib/trade-readiness";
