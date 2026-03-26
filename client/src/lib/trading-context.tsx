import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useWallet } from "./wallet-context";
import {
  getAccountState,
  getPositions,
  getOpenOrders,
  closePosition as hlClosePosition,
  cancelOrder as hlCancelOrder,
  placeTriggerOrder,
  type AccountState,
} from "./hyperliquid-client";

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
}

interface TradingContextType {
  connected: boolean;
  address: string;
  balance: number;
  withdrawable: number;
  accountValue: number;
  marginUsed: number;
  positions: Position[];
  openOrders: HLOpenOrder[];
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
  placeTPSL: (coin: string, size: number, isLong: boolean, tpPrice?: number, slPrice?: number, entryPriceOverride?: number) => Promise<{ success: boolean; error?: string }>;
  setIndicators: (indicators: Indicator[]) => void;
  updatePrices: (prices: Record<string, number>) => void;
  refreshAccount: () => Promise<void>;
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
  const [marginUsed, setMarginUsed] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<HLOpenOrder[]>([]);
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => loadFromStorage(STORAGE_KEYS.tradeHistory, []));
  const [indicators, setIndicatorsState] = useState<Indicator[]>(() => loadFromStorage(STORAGE_KEYS.indicators, defaultIndicators));
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [isClosingPosition, setIsClosingPosition] = useState(false);
  const isPlacingTPSLRef = useRef(false);
  /** Latest mids for mark display — avoids tying refreshAccount to currentPrices identity (prevents interval churn). */
  const currentPricesRef = useRef<Record<string, number>>({});

  const connected = walletConnected;
  const address = walletAddress || "";

  // Persist state changes to localStorage
  useEffect(() => { saveToStorage(STORAGE_KEYS.tradeHistory, tradeHistory); }, [tradeHistory]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.indicators, indicators); }, [indicators]);
  useEffect(() => {
    currentPricesRef.current = currentPrices;
  }, [currentPrices]);

  // Fetch account data from Hyperliquid when wallet connects
  const refreshAccount = useCallback(async () => {
    if (!walletAddress) return;
    
    setIsLoadingAccount(true);
    try {
      const [accountState, hlPositions, hlOrders] = await Promise.all([
        getAccountState(walletAddress),
        getPositions(walletAddress),
        getOpenOrders(walletAddress),
      ]);

      if (accountState) {
        const accValue = parseFloat(accountState.marginSummary.accountValue || "0");
        const margUsed = parseFloat(accountState.marginSummary.totalMarginUsed || "0");
        const withdrawableVal = parseFloat(accountState.withdrawable || "0");
        setAccountValue(accValue);
        setMarginUsed(margUsed);
        setBalance(accValue - margUsed);
        setWithdrawable(withdrawableVal > 0 ? withdrawableVal : Math.max(0, accValue - margUsed));
      }

      const mids = currentPricesRef.current;

      // Convert Hyperliquid positions to our format
      const convertedPositions: Position[] = hlPositions.map((pos, idx) => ({
        id: `hl-${pos.coin}-${idx}`,
        coin: pos.coin,
        side: pos.side,
        size: pos.size,
        entryPrice: pos.entryPrice,
        markPrice: mids[pos.coin] || pos.entryPrice,
        leverage: pos.leverage,
        margin: pos.marginUsed,
        unrealizedPnl: pos.unrealizedPnl,
        unrealizedPnlPercent: pos.marginUsed > 0 ? (pos.unrealizedPnl / pos.marginUsed) * 100 : 0,
        liquidationPrice: pos.liquidationPrice || 0,
        openedAt: new Date(),
      }));
      setPositions(convertedPositions);
      console.log("[positions] fetched from API:", convertedPositions.map(p => ({ coin: p.coin, side: p.side, size: p.size, entryPrice: p.entryPrice, pnl: p.unrealizedPnl })));

      // Store open orders from Hyperliquid (includes SL/TP trigger orders via frontendOpenOrders)
      const triggerOrds = (hlOrders || []).filter((o: any) => o.isTrigger || o.triggerPx);
      if (triggerOrds.length > 0) {
        console.log("[openOrders] trigger orders raw:", JSON.stringify(triggerOrds.map((o: any) => ({
          coin: o.coin, orderType: o.orderType, triggerCondition: o.triggerCondition, tpsl: o.tpsl,
          triggerPx: o.triggerPx, limitPx: o.limitPx, isTrigger: o.isTrigger,
        }))));
      }
      const convertedOrders: HLOpenOrder[] = (hlOrders || []).map((ord: any) => {
        let orderType: "limit" | "stop_loss" | "take_profit" = "limit";
        // Use Hyperliquid's orderType string first (most reliable)
        const ot = (ord.orderType || "").toLowerCase();
        const tc = (ord.triggerCondition || ord.tpsl || "").toLowerCase();
        if (ord.isStopLoss === true) {
          orderType = "stop_loss";
        } else if (ord.tpsl === "sl" || tc === "sl") {
          orderType = "stop_loss";
        } else if (ord.tpsl === "tp" || tc === "tp") {
          orderType = "take_profit";
        } else if (ot.includes("take profit")) {
          orderType = "take_profit";
        } else if (ot.includes("stop")) {
          orderType = "stop_loss";
        } else if (tc.includes("above")) {
          orderType = "take_profit";
        } else if (tc.includes("below")) {
          orderType = "stop_loss";
        }
        return {
          coin: ord.coin,
          oid: ord.oid,
          side: ord.side,
          sz: ord.sz,
          limitPx: ord.limitPx,
          timestamp: ord.timestamp,
          origSz: ord.origSz,
          orderType,
          triggerPx: ord.triggerPx,
        };
      });
      // Replace entirely — Hyperliquid is source of truth (no merge with previous openOrders).
      setOpenOrders(convertedOrders);

    } catch (error) {
      console.error("Error fetching Hyperliquid account:", error);
    } finally {
      setIsLoadingAccount(false);
    }
  }, [walletAddress]);

  // Refresh account when wallet connects
  useEffect(() => {
    if (walletConnected && walletAddress) {
      refreshAccount();
    } else {
      setPositions([]);
      setOpenOrders([]);
      setBalance(0);
      setWithdrawable(0);
      setAccountValue(0);
      setMarginUsed(0);
    }
  }, [walletConnected, walletAddress]);

  // Poll Hyperliquid open orders + positions; also refresh when tab becomes visible (catch external cancels).
  useEffect(() => {
    if (!walletConnected || !walletAddress) return;

    const interval = setInterval(refreshAccount, 5000);

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
      // Close position on Hyperliquid by placing opposite market order with reduceOnly
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
      
      // Refresh positions from Hyperliquid to get updated state
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
    
    try {
      const result = await hlCancelOrder(signer, coin, oid);
      if (result.success) {
        await refreshAccount();
      }
      return result;
    } catch (error: any) {
      console.error("Error cancelling order:", error);
      return { success: false, error: error.message || "Failed to cancel order" };
    }
  }, [signer, refreshAccount]);

  const placeTPSL = useCallback(async (
    coin: string, 
    size: number, 
    isLong: boolean, 
    tpPrice?: number, 
    slPrice?: number,
    entryPriceOverride?: number
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
        const slResult = await placeTriggerOrder(signer, {
          coin,
          isBuy: !isLong,
          size,
          triggerPrice: slPrice,
          isStopLoss: true,
          reduceOnly: true,
        });
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
      marginUsed,
      positions,
      openOrders,
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
