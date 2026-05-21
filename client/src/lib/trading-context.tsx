import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useWallet } from "./wallet-context";
import {
  getAccountState,
  getOpenOrders,
  getClearinghouseStateViaInfoClient,
  getSpotState,
  closePosition as hlClosePosition,
  cancelOrder as hlCancelOrder,
  placeTriggerOrder,
  placeTrailingStopMarketOrder,
  type AccountState,
} from "./hyperliquid-client";
import {
  convertRawFrontendOrdersToHl,
  mapClearinghouseAssetPositionsToDashboard,
  applyMarginSummaryFromAccountState,
} from "./hl-account-map";
import { fetchCctpDepositConfig, getArbitrumUsdcBalance } from "./cctp-deposit";
import { getArbitrumBridgedUsdcBalance, getArbitrumNativeUsdcBalance } from "./arbitrum-usdc";
import { SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";

export interface Position {
  id: string;
  coin: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  margin: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  liquidationPrice: number;
  openedAt: Date;
}

export interface TradeRecord {
  id: string;
  coin: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  pnl?: number;
  fee: number;
  timestamp: Date;
}

export interface Indicator {
  id: string;
  name: string;
  type: "overlay" | "oscillator";
  enabled: boolean;
  settings: Record<string, number | string | boolean>;
  color: string;
}

export interface PlaceTpslOptions {
  /**
   * When set with `slPrice`, attempts venue `trailingStopMarket` first (callback vs mark),
   * then falls back to a fixed reduce-only stop trigger at `slPrice`.
   */
  slTrailingCallbackRate?: number;
}

export interface HLOpenOrder {
  coin: string;
  oid: number;
  side: string;
  sz: string;
  limitPx: string;
  timestamp: number;
  origSz: string;
  orderType?: "limit" | "stop_loss" | "take_profit";
  triggerPx?: string;
  /** From HL `frontendOpenOrders` / WS when present — chart TP/SL mapping. */
  isTrigger?: boolean;
  reduceOnly?: boolean;
}

interface TradingContextType {
  connected: boolean;
  address: string;
  balance: number;
  withdrawable: number;
  accountValue: number;
  /** Native USDC total on spot (from `spotClearinghouseState`). */
  spotUsdcTotal: number;
  /** Perp account value + spot USDC total (unified HL equity). */
  unifiedAccountUsd: number;
  /** Native USDC on Arbitrum in the connected wallet (Revolut / external sends). */
  walletUsdcArbitrum: number;
  walletUsdcBridged: number;
  /** Trading + wallet USDC — what users see as "total balance". */
  displayTotalUsd: number;
  isLoadingWalletUsdc: boolean;
  refreshWalletUsdc: (options?: { silent?: boolean }) => Promise<{ native: number; bridged: number }>;
  marginUsed: number;
  positions: Position[];
  openOrders: HLOpenOrder[];
  /** Last `frontendOpenOrders` JSON from the venue info API. */
  hlFrontendOpenOrdersRaw: unknown;
  /** Unix ms when open orders + positions were last refreshed from HL (null = never / disconnected). */
  hlAccountSyncAt: number | null;
  /** Last refresh error message (debug). */
  hlAccountFetchError: string | null;
  tradeHistory: TradeRecord[];
  indicators: Indicator[];
  currentPrices: Record<string, number>;
  isPriceReady: (coin: string) => boolean;
  isLoadingAccount: boolean;
  isClosingPosition: boolean;
  connect: (address?: string) => void;
  disconnect: () => void;
  closePosition: (positionId: string) => Promise<{ success: boolean; error?: string }>;
  cancelHLOrder: (coin: string, oid: number) => Promise<{ success: boolean; error?: string }>;
  placeTPSL: (
    coin: string,
    size: number,
    isLong: boolean,
    tpPrice?: number,
    slPrice?: number,
    entryPriceOverride?: number,
    options?: PlaceTpslOptions,
  ) => Promise<{ success: boolean; error?: string }>;
  setIndicators: (indicators: Indicator[]) => void;
  updatePrices: (prices: Record<string, number>) => void;
  refreshAccount: (options?: { silent?: boolean }) => Promise<void>;
}

const defaultIndicators: Indicator[] = [
  {
    id: "sma21",
    name: "SMA 21",
    type: "overlay",
    enabled: true,
    settings: { period: 21 },
    color: "#3b82f6",
  },
  {
    id: "sma200",
    name: "SMA 200",
    type: "overlay",
    enabled: true,
    settings: { period: 200 },
    color: "#f59e0b",
  },
  {
    id: "ema9",
    name: "EMA 9",
    type: "overlay",
    enabled: false,
    settings: { period: 9 },
    color: "#8b5cf6",
  },
  {
    id: "rsi",
    name: "RSI",
    type: "oscillator",
    enabled: false,
    settings: { period: 14, overbought: 70, oversold: 30 },
    color: "#ec4899",
  },
  {
    id: "macd",
    name: "MACD",
    type: "oscillator",
    enabled: false,
    settings: { fast: 12, slow: 26, signal: 9 },
    color: "#06b6d4",
  },
  {
    id: "bb",
    name: "Bollinger Bands",
    type: "overlay",
    enabled: false,
    settings: { period: 20, stdDev: 2 },
    color: "#10b981",
  },
  {
    id: "vwap",
    name: "VWAP",
    type: "overlay",
    enabled: false,
    settings: {},
    color: "#f43f5e",
  },
];

const TradingContext = createContext<TradingContextType | undefined>(undefined);

// LocalStorage keys
const STORAGE_KEYS = {
  connected: "equilibrium_connected",
  address: "equilibrium_address",
  balance: "equilibrium_balance",
  positions: "equilibrium_positions",
  tradeHistory: "equilibrium_trade_history",
  indicators: "equilibrium_indicators",
};

/** Coalesce venue WS account + order snapshots for UI (perps overview / equity strip). */
const HL_ACCOUNT_UI_THROTTLE_MS = 3000;

// Load from localStorage with default fallback
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    const parsed = JSON.parse(stored);
    // Handle date conversion for positions and trades
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        ...item,
        openedAt: item.openedAt ? new Date(item.openedAt) : undefined,
        createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        filledAt: item.filledAt ? new Date(item.filledAt) : undefined,
        timestamp: item.timestamp ? new Date(item.timestamp) : undefined,
      })) as T;
    }
    return parsed;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

export function TradingProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress, isConnected: walletConnected, signer } = useWallet();
  
  const [balance, setBalance] = useState(0);
  const [withdrawable, setWithdrawable] = useState(0);
  const [accountValue, setAccountValue] = useState(0);
  const [spotUsdcTotal, setSpotUsdcTotal] = useState(0);
  const [unifiedAccountUsd, setUnifiedAccountUsd] = useState(0);
  const [walletUsdcArbitrum, setWalletUsdcArbitrum] = useState(0);
  const [walletUsdcBridged, setWalletUsdcBridged] = useState(0);
  const [isLoadingWalletUsdc, setIsLoadingWalletUsdc] = useState(false);
  const [marginUsed, setMarginUsed] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<HLOpenOrder[]>([]);
  const [hlFrontendOpenOrdersRaw, setHlFrontendOpenOrdersRaw] = useState<unknown>(null);
  const [hlAccountSyncAt, setHlAccountSyncAt] = useState<number | null>(null);
  const [hlAccountFetchError, setHlAccountFetchError] = useState<string | null>(null);
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => loadFromStorage(STORAGE_KEYS.tradeHistory, []));
  const [indicators, setIndicatorsState] = useState<Indicator[]>(() => loadFromStorage(STORAGE_KEYS.indicators, defaultIndicators));
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [isClosingPosition, setIsClosingPosition] = useState(false);
  const isPlacingTPSLRef = useRef(false);
  /** Latest mids for mark display — avoids tying refreshAccount to currentPrices identity (prevents interval churn). */
  const currentPricesRef = useRef<Record<string, number>>({});
  const wsSubsRef = useRef<Array<{ unsubscribe: () => Promise<void> }>>([]);
  const userEventsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHlBalanceSnapRef = useRef<string>("");
  const spotUsdcRef = useRef(0);
  useEffect(() => {
    spotUsdcRef.current = spotUsdcTotal;
  }, [spotUsdcTotal]);

  const connected = walletConnected;
  const address = walletAddress || "";
  const displayTotalUsd = unifiedAccountUsd + walletUsdcArbitrum;

  const refreshWalletUsdc = useCallback(async (options?: { silent?: boolean }): Promise<{ native: number; bridged: number }> => {
    if (!walletAddress) {
      setWalletUsdcArbitrum(0);
      setWalletUsdcBridged(0);
      return { native: 0, bridged: 0 };
    }
    const silent = options?.silent ?? false;
    if (!silent) setIsLoadingWalletUsdc(true);
    try {
      const cfg = await fetchCctpDepositConfig().catch(() => null);
      const [native, bridged] = await Promise.all([
        cfg
          ? getArbitrumUsdcBalance(walletAddress, cfg.usdc)
          : getArbitrumNativeUsdcBalance(walletAddress),
        getArbitrumBridgedUsdcBalance(walletAddress),
      ]);
      setWalletUsdcArbitrum(native);
      setWalletUsdcBridged(bridged);
      return { native, bridged };
    } catch (e) {
      console.warn("[wallet-usdc] balance refresh failed:", e);
      return { native: 0, bridged: 0 };
    } finally {
      if (!silent) setIsLoadingWalletUsdc(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      setWalletUsdcArbitrum(0);
      setWalletUsdcBridged(0);
      return;
    }
    void refreshWalletUsdc();
    const id = setInterval(() => void refreshWalletUsdc({ silent: true }), 20_000);
    return () => clearInterval(id);
  }, [walletAddress, refreshWalletUsdc]);

  useEffect(() => {
    const onDepositDone = () => void refreshWalletUsdc();
    window.addEventListener("equilibrium-deposit-confirmed", onDepositDone);
    return () => window.removeEventListener("equilibrium-deposit-confirmed", onDepositDone);
  }, [refreshWalletUsdc]);

  // Persist state changes to localStorage
  useEffect(() => { saveToStorage(STORAGE_KEYS.tradeHistory, tradeHistory); }, [tradeHistory]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.indicators, indicators); }, [indicators]);
  useEffect(() => {
    currentPricesRef.current = currentPrices;
  }, [currentPrices]);

  // Fetch account data from the venue when wallet connects
  const refreshAccount = useCallback(async (options?: { silent?: boolean }) => {
    if (!walletAddress) return;

    const silent = options?.silent ?? false;
    if (!silent) setIsLoadingAccount(true);
    setHlAccountFetchError(null);
    try {
      const [accountState, hlOrders, spotState] = await Promise.all([
        getClearinghouseStateViaInfoClient(walletAddress).then(
          (s) => s ?? getAccountState(walletAddress),
        ),
        getOpenOrders(walletAddress),
        getSpotState(walletAddress),
      ]);

      let spotUsdc = 0;
      const usdcRow = spotState?.balances?.find((b) => b.coin === "USDC");
      if (usdcRow) {
        spotUsdc = parseFloat(usdcRow.total || "0") || 0;
      }
      setSpotUsdcTotal(spotUsdc);

      if (accountState) {
        applyMarginSummaryFromAccountState(accountState, {
          setAccountValue,
          setMarginUsed,
          setBalance,
          setWithdrawable,
        });
        const perpVal = parseFloat(accountState.marginSummary?.accountValue || "0") || 0;
        setUnifiedAccountUsd(perpVal + spotUsdc);
      } else {
        setUnifiedAccountUsd(spotUsdc);
      }

      const perpForSnap = accountState
        ? parseFloat(accountState.marginSummary?.accountValue || "0") || 0
        : 0;
      const unifiedSnap = perpForSnap + spotUsdc;
      const snapKey = `${perpForSnap.toFixed(4)}|${spotUsdc.toFixed(4)}`;
      if (lastHlBalanceSnapRef.current !== snapKey) {
        lastHlBalanceSnapRef.current = snapKey;
        void fetch("/api/user/hl-balance-snapshot", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
            Authorization: `Bearer ${walletAddress}`,
          },
          body: JSON.stringify({
            perpAccountValue: perpForSnap,
            spotUsdc: spotUsdc,
            totalUsd: unifiedSnap,
          }),
        }).catch(() => {});
      }

      const mids = currentPricesRef.current;
      const hlRows = mapClearinghouseAssetPositionsToDashboard(accountState?.assetPositions, mids);
      const convertedPositions: Position[] = hlRows.map((pos, idx) => ({
        id: `hl-${pos.coin}-${idx}`,
        coin: pos.coin,
        side: pos.side,
        size: pos.size,
        entryPrice: pos.entryPrice,
        markPrice: pos.markPrice,
        leverage: pos.leverage,
        margin: pos.margin,
        unrealizedPnl: pos.unrealizedPnl,
        unrealizedPnlPercent: pos.unrealizedPnlPercent,
        liquidationPrice: pos.liquidationPrice,
        openedAt: new Date(),
      }));
      setPositions(convertedPositions);
      console.log("[positions] fetched from API:", convertedPositions.map(p => ({ coin: p.coin, side: p.side, size: p.size, entryPrice: p.entryPrice, pnl: p.unrealizedPnl })));

      const triggerOrds = (hlOrders || []).filter((o: any) => o.isTrigger || o.triggerPx);
      if (triggerOrds.length > 0) {
        console.log("[openOrders] trigger orders raw:", JSON.stringify(triggerOrds.map((o: any) => ({
          coin: o.coin, orderType: o.orderType, triggerCondition: o.triggerCondition, tpsl: o.tpsl,
          triggerPx: o.triggerPx, limitPx: o.limitPx, isTrigger: o.isTrigger,
        }))));
      }
      const convertedOrders = convertRawFrontendOrdersToHl(hlOrders || []);
      setOpenOrders(convertedOrders);
      setHlFrontendOpenOrdersRaw(
        Array.isArray(hlOrders) ? hlOrders.map((o: unknown) => (typeof o === "object" && o !== null ? { ...(o as object) } : o)) : [],
      );
      setHlAccountSyncAt(Date.now());
      setHlAccountFetchError(null);

    } catch (error) {
      console.error("Error fetching exchange account:", error);
      setHlAccountFetchError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!silent) setIsLoadingAccount(false);
    }
  }, [walletAddress]);

  // After a successful Arbitrum deposit, refresh HL balances (Trading + any consumer of useTrading).
  useEffect(() => {
    if (!walletConnected || !walletAddress) return;
    const onDepositConfirmed = () => {
      void refreshAccount({ silent: true });
      void refreshWalletUsdc({ silent: true });
    };
    window.addEventListener("equilibrium-deposit-confirmed", onDepositConfirmed);
    return () => window.removeEventListener("equilibrium-deposit-confirmed", onDepositConfirmed);
  }, [walletConnected, walletAddress, refreshAccount]);

  // Refresh account when wallet connects
  useEffect(() => {
    if (walletConnected && walletAddress) {
      refreshAccount();
    } else {
      setPositions([]);
      setOpenOrders([]);
      setHlFrontendOpenOrdersRaw(null);
      setHlAccountSyncAt(null);
      setHlAccountFetchError(null);
      setBalance(0);
      setWithdrawable(0);
      setAccountValue(0);
      setSpotUsdcTotal(0);
      setUnifiedAccountUsd(0);
      setMarginUsed(0);
      lastHlBalanceSnapRef.current = "";
    }
  }, [walletConnected, walletAddress]);

  // WebSocket: open orders + clearinghouse state — UI updates throttled to reduce main-thread churn (chart/scanner).
  useEffect(() => {
    if (!walletConnected || !walletAddress) return;
    let cancelled = false;
    let openUiTimer: ReturnType<typeof setTimeout> | null = null;
    let chUiTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const transport = new WebSocketTransport();
        const subClient = new SubscriptionClient({ transport });
        const user = walletAddress as `0x${string}`;
        const subs: Array<{ unsubscribe: () => Promise<void> }> = [];

        let lastOpenUi = 0;
        let pendingOpenRaw: unknown[] | null = null;

        const flushOpenOrders = () => {
          openUiTimer = null;
          if (cancelled || pendingOpenRaw === null) return;
          const raw = pendingOpenRaw;
          pendingOpenRaw = null;
          setOpenOrders(convertRawFrontendOrdersToHl(raw));
          setHlFrontendOpenOrdersRaw(
            Array.isArray(raw)
              ? raw.map((o: unknown) =>
                  typeof o === "object" && o !== null ? { ...(o as object) } : o,
                )
              : [],
          );
          setHlAccountSyncAt(Date.now());
          lastOpenUi = Date.now();
        };

        const sOpen = await subClient.openOrders({ user }, (evt) => {
          if (cancelled) return;
          const raw = (evt.orders ?? []) as unknown[];
          pendingOpenRaw = raw;
          const now = Date.now();
          if (now - lastOpenUi >= HL_ACCOUNT_UI_THROTTLE_MS) {
            flushOpenOrders();
            return;
          }
          if (!openUiTimer) {
            openUiTimer = setTimeout(flushOpenOrders, HL_ACCOUNT_UI_THROTTLE_MS - (now - lastOpenUi));
          }
        });
        subs.push(sOpen);

        let lastChUi = 0;
        let pendingCh: AccountState | null = null;

        const flushClearinghouse = () => {
          chUiTimer = null;
          if (cancelled || !pendingCh) return;
          const ch = pendingCh;
          pendingCh = null;
          applyMarginSummaryFromAccountState(ch, {
            setAccountValue,
            setMarginUsed,
            setBalance,
            setWithdrawable,
          });
          const mids = currentPricesRef.current;
          const hlRows = mapClearinghouseAssetPositionsToDashboard(ch?.assetPositions, mids);
          setPositions(
            hlRows.map((pos, idx) => ({
              id: `hl-${pos.coin}-${idx}`,
              coin: pos.coin,
              side: pos.side,
              size: pos.size,
              entryPrice: pos.entryPrice,
              markPrice: pos.markPrice,
              leverage: pos.leverage,
              margin: pos.margin,
              unrealizedPnl: pos.unrealizedPnl,
              unrealizedPnlPercent: pos.unrealizedPnlPercent,
              liquidationPrice: pos.liquidationPrice,
              openedAt: new Date(),
            })),
          );
          setHlAccountSyncAt(Date.now());
          lastChUi = Date.now();
        };

        const sCh = await subClient.clearinghouseState({ user }, (evt) => {
          if (cancelled) return;
          pendingCh = evt.clearinghouseState as unknown as AccountState;
          const now = Date.now();
          if (now - lastChUi >= HL_ACCOUNT_UI_THROTTLE_MS) {
            flushClearinghouse();
            return;
          }
          if (!chUiTimer) {
            chUiTimer = setTimeout(flushClearinghouse, HL_ACCOUNT_UI_THROTTLE_MS - (now - lastChUi));
          }
        });
        subs.push(sCh);

        const sUe = await subClient.userEvents({ user }, () => {
          if (cancelled) return;
          if (userEventsRefreshTimerRef.current) clearTimeout(userEventsRefreshTimerRef.current);
          userEventsRefreshTimerRef.current = setTimeout(() => {
            userEventsRefreshTimerRef.current = null;
            void refreshAccount();
          }, 500);
        });
        subs.push(sUe);

        wsSubsRef.current = subs;
      } catch (e) {
        console.warn("[HL] WebSocket subscription failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (openUiTimer) clearTimeout(openUiTimer);
      if (chUiTimer) clearTimeout(chUiTimer);
      if (userEventsRefreshTimerRef.current) {
        clearTimeout(userEventsRefreshTimerRef.current);
        userEventsRefreshTimerRef.current = null;
      }
      const subs = wsSubsRef.current;
      wsSubsRef.current = [];
      for (const s of subs) {
        void s.unsubscribe().catch(() => {});
      }
    };
  }, [walletConnected, walletAddress, refreshAccount]);

  // Slower REST fallback if WS misses an edge; visibility refocus still triggers immediate refresh.
  useEffect(() => {
    if (!walletConnected || !walletAddress) return;

    const interval = setInterval(refreshAccount, 10_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAccount();
    };
    const onFocus = () => refreshAccount();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [walletConnected, walletAddress, refreshAccount]);

  // Connection is now handled by wallet context
  const connect = useCallback(() => {
    // Wallet connection is handled by WalletContext
    // This is kept for backward compatibility
  }, []);

  const disconnect = useCallback(() => {
    // Wallet disconnection is handled by WalletContext
    setPositions([]);
    setOpenOrders([]);
    setHlFrontendOpenOrdersRaw(null);
    setHlAccountSyncAt(null);
    setHlAccountFetchError(null);
  }, []);

  const closePosition = useCallback(async (positionId: string): Promise<{ success: boolean; error?: string }> => {
    const position = positions.find(p => p.id === positionId);
    if (!position) {
      return { success: false, error: "Position not found" };
    }
    
    if (!signer) {
      return { success: false, error: "Wallet not connected" };
    }
    
    setIsClosingPosition(true);
    try {
      // Close position on the exchange by placing opposite market order with reduceOnly
      const result = await hlClosePosition(
        signer,
        position.coin,
        position.size,
        position.side === "long"
      );
      
      if (!result.success) {
        return { success: false, error: result.error || "Failed to close position" };
      }
      
      // Record the trade
      const exitPrice = result.avgPrice || position.markPrice;
      const realizedPnl = position.unrealizedPnl;
      const fee = position.size * position.markPrice * 0.001;
      
      const tradeRecord: TradeRecord = {
        id: `trade-${Date.now()}`,
        coin: position.coin,
        side: position.side === "long" ? "sell" : "buy",
        size: position.size,
        price: exitPrice,
        pnl: realizedPnl,
        fee: fee,
        timestamp: new Date(),
      };
      setTradeHistory(th => [tradeRecord, ...th]);
      
      // Auto-grade the trade (use real TP/SL trigger orders when present)
      try {
        const walletAddress = await signer.getAddress();
        const entry = position.entryPrice;
        const isLong = position.side === "long";

        const classify = (o: HLOpenOrder): "tp" | "sl" | "other" => {
          const ot = (o.orderType || "").toLowerCase();
          if (ot.includes("take profit") || ot === "take_profit") return "tp";
          if (ot.includes("stop") || ot === "stop_loss") return "sl";
          const trigPx = o.triggerPx ? parseFloat(o.triggerPx) : parseFloat(o.limitPx);
          if (!trigPx || isNaN(trigPx)) return "other";
          return isLong ? (trigPx > entry ? "tp" : "sl") : (trigPx < entry ? "tp" : "sl");
        };

        const coinOrders = openOrders.filter(o => o.coin === position.coin && o.triggerPx);
        const tpPx = coinOrders.find(o => classify(o) === "tp");
        const slPx = coinOrders.find(o => classify(o) === "sl");
        const tpFromOrder = tpPx ? parseFloat(tpPx.triggerPx || tpPx.limitPx) : NaN;
        const slFromOrder = slPx ? parseFloat(slPx.triggerPx || slPx.limitPx) : NaN;

        const slDistance = entry * 0.02;
        const tpDistance = entry * 0.04;
        const estimatedSL = isLong ? entry - slDistance : entry + slDistance;
        const estimatedTP = isLong ? entry + tpDistance : entry - tpDistance;

        const stopLoss =
          slFromOrder > 0 && !isNaN(slFromOrder) ? slFromOrder : Math.max(estimatedSL, 1e-8);
        const takeProfit =
          tpFromOrder > 0 && !isNaN(tpFromOrder) ? tpFromOrder : Math.max(estimatedTP, 1e-8);

        await fetch("/api/journal/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress,
            coin: position.coin,
            side: position.side,
            entryPrice: entry,
            exitPrice,
            stopLoss,
            takeProfit,
            leverage: position.leverage,
            size: position.size,
            patternType: "SMMA 21/200 trend",
            timeframe: "multi",
          }),
        });
      } catch (gradeError) {
        console.error("Error grading trade:", gradeError);
      }

      try {
        const walletAddress = await signer.getAddress();
        await fetch("/api/trade-journal/close-open", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
          },
          body: JSON.stringify({
            coin: position.coin,
            side: position.side,
            exitPrice,
            realizedPnl: position.unrealizedPnl,
          }),
        });
      } catch (journalCloseErr) {
        console.warn("[trade-journal] close-open:", journalCloseErr);
      }
      
      // Refresh positions from the exchange to get updated state
      await refreshAccount();
      
      return { success: true };
    } catch (error: any) {
      console.error("Error closing position:", error);
      return { success: false, error: error.message || "Failed to close position" };
    } finally {
      setIsClosingPosition(false);
    }
  }, [positions, signer, refreshAccount, openOrders]);

  const cancelHLOrder = useCallback(async (coin: string, oid: number): Promise<{ success: boolean; error?: string }> => {
    if (!signer) {
      return { success: false, error: "Wallet not connected" };
    }
    if (!oid || !Number.isFinite(oid)) {
      return { success: false, error: "Invalid order id" };
    }

    try {
      const result = await hlCancelOrder(signer, coin, oid);
      // Always refetch so UI matches HL (success, failure, or stale list).
      await refreshAccount();
      return result;
    } catch (error: any) {
      console.error("Error cancelling order:", error);
      await refreshAccount().catch(() => {});
      return { success: false, error: error.message || "Failed to cancel order" };
    }
  }, [signer, refreshAccount]);

  const placeTPSL = useCallback(async (
    coin: string, 
    size: number, 
    isLong: boolean, 
    tpPrice?: number, 
    slPrice?: number,
    entryPriceOverride?: number,
    options?: PlaceTpslOptions,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!signer) {
      return { success: false, error: "Wallet not connected" };
    }
    if (isPlacingTPSLRef.current) {
      console.warn("[placeTPSL] Already placing TP/SL, ignoring duplicate call");
      return { success: false, error: "TP/SL placement already in progress" };
    }
    isPlacingTPSLRef.current = true;

    try {
      // TP validates against entry price (direction must be correct relative to entry).
      // SL validates against current mark price — this allows setting SL at entry
      // (breakeven stop) or between mark and entry (lock in partial profit).
      const pos = positions.find(p => p.coin === coin);
      const refPrice = entryPriceOverride || pos?.entryPrice || currentPrices[coin] || 0;
      const markPrice = pos?.markPrice || currentPrices[coin] || refPrice;
      if (refPrice > 0) {
        const entryFmt = refPrice.toLocaleString(undefined, { maximumFractionDigits: 2 });
        if (tpPrice && tpPrice > 0) {
          if (isLong && tpPrice <= refPrice) {
            return { success: false, error: `Take Profit ($${tpPrice.toLocaleString()}) must be above entry price ($${entryFmt}) for a Long.` };
          }
          if (!isLong && tpPrice >= refPrice) {
            return { success: false, error: `Take Profit ($${tpPrice.toLocaleString()}) must be below entry price ($${entryFmt}) for a Short.` };
          }
        }
        if (slPrice && slPrice > 0) {
          const slRef = markPrice > 0 ? markPrice : refPrice;
          const slFmt = slRef.toLocaleString(undefined, { maximumFractionDigits: 2 });
          // Only guard instant trigger vs mark — SL may sit above entry (profit-lock / trailing).
          if (isLong && slPrice >= slRef) {
            return { success: false, error: `Stop Loss ($${slPrice.toLocaleString()}) must be below the current price ($${slFmt}) — it would trigger immediately.` };
          }
          if (!isLong && slPrice <= slRef) {
            return { success: false, error: `Stop Loss ($${slPrice.toLocaleString()}) must be above the current price ($${slFmt}) — it would trigger immediately.` };
          }
        }
      }

      // Cancel only the specific trigger order types that are being replaced.
      // If updating only TP, the existing SL is preserved (and vice-versa).
      const existingOrders = openOrders.filter(
        (o) =>
          o.coin === coin &&
          (o.triggerPx ||
            o.orderType === "stop_loss" ||
            o.orderType === "take_profit"),
      );
      const cancelRef = pos?.entryPrice || currentPrices[coin] || 0;
      for (const order of existingOrders) {
        const orderType = (() => {
          if (order.orderType === "stop_loss") return "sl";
          if (order.orderType === "take_profit") return "tp";
          if (cancelRef === 0) return "tp";
          const trigPx = parseFloat(order.triggerPx || order.limitPx);
          return isLong
            ? trigPx > cancelRef ? "tp" : "sl"
            : trigPx < cancelRef ? "tp" : "sl";
        })();
        const shouldCancel =
          (orderType === "tp" && tpPrice !== undefined) ||
          (orderType === "sl" && slPrice !== undefined);
        if (shouldCancel) {
          await hlCancelOrder(signer, coin, order.oid);
        }
      }

      const results: Array<{ success: boolean; error?: string }> = [];
      
      if (tpPrice && tpPrice > 0) {
        const tpResult = await placeTriggerOrder(signer, {
          coin,
          isBuy: !isLong,
          size,
          triggerPrice: tpPrice,
          isStopLoss: false,
          reduceOnly: true,
        });
        results.push(tpResult);
      }
      
      if (slPrice && slPrice > 0) {
        const cb = options?.slTrailingCallbackRate;
        let slResult: { success: boolean; error?: string } | Awaited<ReturnType<typeof placeTriggerOrder>>;
        if (cb != null && cb > 0) {
          slResult = await placeTrailingStopMarketOrder(signer, {
            coin,
            isBuy: !isLong,
            size,
            callbackRate: cb,
            anchorTriggerPx: slPrice,
          });
          if (!slResult.success) {
            slResult = await placeTriggerOrder(signer, {
              coin,
              isBuy: !isLong,
              size,
              triggerPrice: slPrice,
              isStopLoss: true,
              reduceOnly: true,
            });
          }
        } else {
          slResult = await placeTriggerOrder(signer, {
            coin,
            isBuy: !isLong,
            size,
            triggerPrice: slPrice,
            isStopLoss: true,
            reduceOnly: true,
          });
        }
        results.push(slResult);
      }
      
      await refreshAccount();
      
      const errors = results.filter(r => !r.success).map(r => r.error);
      if (errors.length > 0) {
        return { success: false, error: errors.join(", ") };
      }
      
      return { success: true };
    } catch (error: any) {
      console.error("Error placing TP/SL:", error);
      return { success: false, error: error.message || "Failed to place TP/SL" };
    } finally {
      isPlacingTPSLRef.current = false;
    }
  }, [signer, openOrders, positions, refreshAccount, currentPrices]);

  const setIndicators = useCallback((newIndicators: Indicator[]) => {
    setIndicatorsState(newIndicators);
  }, []);

  const updatePrices = useCallback((prices: Record<string, number>) => {
    setCurrentPrices(prices);
  }, []);

  const isPriceReady = useCallback((coin: string): boolean => {
    const price = currentPrices[coin];
    return typeof price === 'number' && price > 0;
  }, [currentPrices]);

  useEffect(() => {
    if (Object.keys(currentPrices).length === 0) return;

    setPositions(prev => prev.map(pos => {
      const markPrice = currentPrices[pos.coin] || pos.markPrice;
      const priceDiff = pos.side === "long" 
        ? markPrice - pos.entryPrice 
        : pos.entryPrice - markPrice;
      const unrealizedPnl = priceDiff * pos.size;
      const unrealizedPnlPercent = pos.margin > 0 ? (unrealizedPnl / pos.margin) * 100 : 0;
      
      return {
        ...pos,
        markPrice,
        unrealizedPnl,
        unrealizedPnlPercent,
      };
    }));
  }, [currentPrices]);

  return (
    <TradingContext.Provider value={{
      connected,
      address,
      balance,
      withdrawable,
      accountValue,
      spotUsdcTotal,
      unifiedAccountUsd,
      walletUsdcArbitrum,
      walletUsdcBridged,
      displayTotalUsd,
      isLoadingWalletUsdc,
      refreshWalletUsdc,
      marginUsed,
      positions,
      openOrders,
      hlFrontendOpenOrdersRaw,
      hlAccountSyncAt,
      hlAccountFetchError,
      tradeHistory,
      indicators,
      currentPrices,
      isPriceReady,
      isLoadingAccount,
      isClosingPosition,
      connect,
      disconnect,
      closePosition,
      cancelHLOrder,
      placeTPSL,
      setIndicators,
      updatePrices,
      refreshAccount,
    }}>
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error("useTrading must be used within a TradingProvider");
  }
  return context;
}
