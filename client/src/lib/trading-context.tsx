import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useWallet } from "./wallet-context";
import { getAccountState, getPositions, getOpenOrders, type Position as HLPosition, type OpenOrder, type AccountState } from "./hyperliquid-client";

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

export interface Order {
  id: string;
  coin: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage: number;
  status: "pending" | "filled" | "cancelled";
  createdAt: Date;
  filledAt?: Date;
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

interface OrderResult {
  success: boolean;
  error?: string;
}

interface TradingContextType {
  connected: boolean;
  address: string;
  balance: number;
  accountValue: number;
  marginUsed: number;
  positions: Position[];
  orders: Order[];
  tradeHistory: TradeRecord[];
  indicators: Indicator[];
  currentPrices: Record<string, number>;
  isPriceReady: (coin: string) => boolean;
  isLoadingAccount: boolean;
  connect: (address?: string) => void;
  disconnect: () => void;
  placeOrder: (order: Omit<Order, "id" | "status" | "createdAt">) => OrderResult;
  closePosition: (positionId: string) => void;
  cancelOrder: (orderId: string) => void;
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
  orders: "equilibrium_orders",
  tradeHistory: "equilibrium_trade_history",
  indicators: "equilibrium_indicators",
};

// Load from localStorage with default fallback
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    const parsed = JSON.parse(stored);
    // Handle date conversion for positions, orders, and trades
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
  const { address: walletAddress, isConnected: walletConnected } = useWallet();
  
  const [balance, setBalance] = useState(0);
  const [accountValue, setAccountValue] = useState(0);
  const [marginUsed, setMarginUsed] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>(() => loadFromStorage(STORAGE_KEYS.orders, []));
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => loadFromStorage(STORAGE_KEYS.tradeHistory, []));
  const [indicators, setIndicatorsState] = useState<Indicator[]>(() => loadFromStorage(STORAGE_KEYS.indicators, defaultIndicators));
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);

  const connected = walletConnected;
  const address = walletAddress || "";

  // Persist state changes to localStorage
  useEffect(() => { saveToStorage(STORAGE_KEYS.orders, orders); }, [orders]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.tradeHistory, tradeHistory); }, [tradeHistory]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.indicators, indicators); }, [indicators]);

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
        setAccountValue(accValue);
        setMarginUsed(margUsed);
        setBalance(accValue - margUsed);
      }

      // Convert Hyperliquid positions to our format
      const convertedPositions: Position[] = hlPositions.map((pos, idx) => ({
        id: `hl-${pos.coin}-${idx}`,
        coin: pos.coin,
        side: pos.side,
        size: pos.size,
        entryPrice: pos.entryPrice,
        markPrice: currentPrices[pos.coin] || pos.entryPrice,
        leverage: pos.leverage,
        margin: pos.marginUsed,
        unrealizedPnl: pos.unrealizedPnl,
        unrealizedPnlPercent: pos.marginUsed > 0 ? (pos.unrealizedPnl / pos.marginUsed) * 100 : 0,
        liquidationPrice: pos.liquidationPrice || 0,
        openedAt: new Date(),
      }));
      setPositions(convertedPositions);

    } catch (error) {
      console.error("Error fetching Hyperliquid account:", error);
    } finally {
      setIsLoadingAccount(false);
    }
  }, [walletAddress, currentPrices]);

  // Refresh account when wallet connects
  useEffect(() => {
    if (walletConnected && walletAddress) {
      refreshAccount();
    } else {
      setPositions([]);
      setBalance(0);
      setAccountValue(0);
      setMarginUsed(0);
    }
  }, [walletConnected, walletAddress]);

  // Periodically refresh positions (every 10 seconds)
  useEffect(() => {
    if (!walletConnected || !walletAddress) return;
    
    const interval = setInterval(refreshAccount, 10000);
    return () => clearInterval(interval);
  }, [walletConnected, walletAddress, refreshAccount]);

  // Connection is now handled by wallet context
  const connect = useCallback(() => {
    // Wallet connection is handled by WalletContext
    // This is kept for backward compatibility
  }, []);

  const disconnect = useCallback(() => {
    // Wallet disconnection is handled by WalletContext
    setPositions([]);
    setOrders([]);
  }, []);

  const createPositionFromOrder = useCallback((order: Order, fillPrice: number) => {
    const positionSide = order.side === "buy" ? "long" : "short";
    const margin = (order.quantity * fillPrice) / order.leverage;
    const liquidationDistance = fillPrice * (0.9 / order.leverage);
    const liquidationPrice = positionSide === "long" 
      ? fillPrice - liquidationDistance 
      : fillPrice + liquidationDistance;

    const newPosition: Position = {
      id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      coin: order.coin,
      side: positionSide,
      size: order.quantity,
      entryPrice: fillPrice,
      markPrice: fillPrice,
      leverage: order.leverage,
      margin: margin,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      liquidationPrice: liquidationPrice,
      openedAt: new Date(),
    };

    return { position: newPosition, margin };
  }, []);

  const placeOrder = useCallback((orderData: Omit<Order, "id" | "status" | "createdAt">): OrderResult => {
    const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();
    
    // For market orders, ALWAYS use authoritative price from context
    // For limit orders, use the user-specified price but validate context has data
    const livePrice = currentPrices[orderData.coin];
    
    if (!livePrice || livePrice <= 0) {
      return { success: false, error: `Price for ${orderData.coin} not available. Please wait for market data.` };
    }
    
    // Market orders use live price, limit orders use specified price
    const fillPrice = orderData.type === "market" ? livePrice : (orderData.price || livePrice);
    
    if (fillPrice <= 0) {
      return { success: false, error: "Invalid price. Please try again." };
    }
    
    const margin = (orderData.quantity * fillPrice) / orderData.leverage;

    if (margin <= 0) {
      return { success: false, error: "Invalid order amount." };
    }
    
    if (margin > balance) {
      return { success: false, error: "Insufficient balance for this order." };
    }

    if (orderData.type === "market") {
      const positionSide = orderData.side === "buy" ? "long" : "short";
      const liquidationDistance = fillPrice * (0.9 / orderData.leverage);
      const liquidationPrice = positionSide === "long" 
        ? fillPrice - liquidationDistance 
        : fillPrice + liquidationDistance;

      const newPosition: Position = {
        id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        coin: orderData.coin,
        side: positionSide,
        size: orderData.quantity,
        entryPrice: fillPrice,
        markPrice: fillPrice,
        leverage: orderData.leverage,
        margin: margin,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        liquidationPrice: liquidationPrice,
        openedAt: now,
      };

      setPositions(prev => [...prev, newPosition]);
      setBalance(prev => prev - margin);

      const tradeRecord: TradeRecord = {
        id: `trade-${Date.now()}`,
        coin: orderData.coin,
        side: orderData.side,
        size: orderData.quantity,
        price: fillPrice,
        fee: margin * 0.001,
        timestamp: now,
      };
      setTradeHistory(prev => [tradeRecord, ...prev]);
      return { success: true };
    } else {
      setBalance(prev => prev - margin);
      
      const newOrder: Order = {
        ...orderData,
        id: orderId,
        status: "pending",
        createdAt: now,
      };
      setOrders(prev => [...prev, newOrder]);
      return { success: true };
    }
  }, [balance, currentPrices]);

  const closePosition = useCallback((positionId: string) => {
    setPositions(prev => {
      const position = prev.find(p => p.id === positionId);
      if (position) {
        const realizedPnl = position.unrealizedPnl;
        const returnAmount = position.margin + realizedPnl;
        const fee = Math.abs(returnAmount) * 0.001;
        
        setBalance(b => b + returnAmount - fee);

        const tradeRecord: TradeRecord = {
          id: `trade-${Date.now()}`,
          coin: position.coin,
          side: position.side === "long" ? "sell" : "buy",
          size: position.size,
          price: position.markPrice,
          pnl: realizedPnl,
          fee: fee,
          timestamp: new Date(),
        };
        setTradeHistory(th => [tradeRecord, ...th]);
      }
      return prev.filter(p => p.id !== positionId);
    });
  }, []);

  const cancelOrder = useCallback((orderId: string) => {
    setOrders(prev => {
      const order = prev.find(o => o.id === orderId);
      if (order && order.status === "pending" && order.price) {
        const margin = (order.quantity * order.price) / order.leverage;
        setBalance(b => b + margin);
      }
      return prev.map(o => 
        o.id === orderId ? { ...o, status: "cancelled" as const } : o
      );
    });
  }, []);

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

    setOrders(prev => {
      const updatedOrders: Order[] = [];
      const filledOrders: Order[] = [];
      
      prev.forEach(order => {
        if (order.status !== "pending" || !order.price) {
          updatedOrders.push(order);
          return;
        }
        
        const currentPrice = currentPrices[order.coin];
        if (!currentPrice) {
          updatedOrders.push(order);
          return;
        }

        const shouldFill = order.side === "buy" 
          ? currentPrice <= order.price
          : currentPrice >= order.price;

        if (shouldFill) {
          filledOrders.push(order);
          updatedOrders.push({ ...order, status: "filled", filledAt: new Date() });
        } else {
          updatedOrders.push(order);
        }
      });

      if (filledOrders.length > 0) {
        filledOrders.forEach(order => {
          const { position } = createPositionFromOrder(order, order.price!);
          setPositions(p => [...p, position]);
          
          const tradeRecord: TradeRecord = {
            id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
            coin: order.coin,
            side: order.side,
            size: order.quantity,
            price: order.price!,
            fee: (order.quantity * order.price!) / order.leverage * 0.001,
            timestamp: new Date(),
          };
          setTradeHistory(th => [tradeRecord, ...th]);
        });
      }

      return updatedOrders;
    });
  }, [currentPrices, createPositionFromOrder]);

  return (
    <TradingContext.Provider value={{
      connected,
      address,
      balance,
      accountValue,
      marginUsed,
      positions,
      orders,
      tradeHistory,
      indicators,
      currentPrices,
      isPriceReady,
      isLoadingAccount,
      connect,
      disconnect,
      placeOrder,
      closePosition,
      cancelOrder,
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
