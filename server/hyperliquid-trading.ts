import { ethers } from "ethers";

const EXCHANGE_API_URL = "https://api.hyperliquid.xyz/exchange";
const INFO_API_URL = "https://api.hyperliquid.xyz/info";

export interface OrderRequest {
  coin: string;
  isBuy: boolean;
  size: number;
  price?: number;
  orderType: "market" | "limit";
  reduceOnly?: boolean;
  slippage?: number;
}

export interface OrderResponse {
  success: boolean;
  orderId?: string;
  status?: string;
  error?: string;
  filledSize?: number;
  avgPrice?: number;
}

export interface Position {
  coin: string;
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice?: number;
  side: "long" | "short";
}

export interface AccountState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
  };
  assetPositions: {
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      unrealizedPnl: string;
      leverage: {
        type: string;
        value: number;
      };
      liquidationPx: string | null;
    };
    type: string;
  }[];
}

export class HyperliquidTrading {
  private wallet: ethers.Wallet | null = null;
  private walletAddress: string | null = null;
  private testnet: boolean = false;

  constructor(testnet: boolean = false) {
    this.testnet = testnet;
  }

  async initialize(privateKey: string): Promise<{ success: boolean; address?: string; error?: string }> {
    try {
      if (!privateKey.startsWith("0x")) {
        privateKey = "0x" + privateKey;
      }
      
      this.wallet = new ethers.Wallet(privateKey);
      this.walletAddress = this.wallet.address;
      
      return { success: true, address: this.walletAddress };
    } catch (error: any) {
      console.error("Hyperliquid init error:", error);
      return { success: false, error: error.message || "Failed to initialize wallet" };
    }
  }

  isConnected(): boolean {
    return this.wallet !== null && this.walletAddress !== null;
  }

  getWalletAddress(): string | null {
    return this.walletAddress;
  }

  async getAccountState(): Promise<AccountState | null> {
    if (!this.walletAddress) return null;
    
    try {
      const response = await fetch(INFO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "clearinghouseState",
          user: this.walletAddress,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Error fetching account state:", error);
      return null;
    }
  }

  async getPositions(): Promise<Position[]> {
    const state = await this.getAccountState();
    if (!state) return [];
    
    return state.assetPositions
      .filter(ap => parseFloat(ap.position.szi) !== 0)
      .map(ap => ({
        coin: ap.position.coin,
        size: Math.abs(parseFloat(ap.position.szi)),
        entryPrice: parseFloat(ap.position.entryPx),
        unrealizedPnl: parseFloat(ap.position.unrealizedPnl),
        leverage: ap.position.leverage?.value || 1,
        liquidationPrice: ap.position.liquidationPx ? parseFloat(ap.position.liquidationPx) : undefined,
        side: parseFloat(ap.position.szi) > 0 ? "long" as const : "short" as const,
      }));
  }

  async getOpenOrders(): Promise<any[]> {
    if (!this.walletAddress) return [];
    
    try {
      const response = await fetch(INFO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "openOrders",
          user: this.walletAddress,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Error fetching open orders:", error);
      return [];
    }
  }

  private async signL1Action(action: any, nonce: number): Promise<{ r: string; s: string; v: number }> {
    if (!this.wallet) {
      throw new Error("Wallet not initialized");
    }

    const domain = {
      name: "Exchange",
      version: "1",
      chainId: 42161,
      verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    };

    const types = {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    };

    const connectionId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint64"],
        [this.walletAddress, nonce]
      )
    );

    const message = {
      source: this.testnet ? "b" : "a",
      connectionId,
    };

    const signature = await this.wallet.signTypedData(domain, types, message);
    const sig = ethers.Signature.from(signature);
    
    return {
      r: sig.r,
      s: sig.s,
      v: sig.v,
    };
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    if (!this.wallet || !this.walletAddress) {
      return { success: false, error: "Not connected to Hyperliquid" };
    }

    try {
      let limitPrice = order.price;
      
      if (order.orderType === "market") {
        const ticker = await this.getTickerPrice(order.coin);
        if (!ticker) {
          return { success: false, error: "Could not get current price" };
        }
        const slippage = order.slippage || 0.02;
        limitPrice = order.isBuy 
          ? ticker * (1 + slippage) 
          : ticker * (1 - slippage);
      }

      if (!limitPrice) {
        return { success: false, error: "Price is required for limit orders" };
      }

      const assetIndex = await this.getAssetIndex(order.coin);
      if (assetIndex === null) {
        return { success: false, error: `Unknown asset: ${order.coin}` };
      }

      const nonce = Date.now();
      
      const orderWire = {
        a: assetIndex,
        b: order.isBuy,
        p: limitPrice.toString(),
        s: order.size.toString(),
        r: order.reduceOnly || false,
        t: order.orderType === "market" 
          ? { market: {} }
          : { limit: { tif: "Gtc" } },
      };

      const action = {
        type: "order",
        orders: [orderWire],
        grouping: "na",
      };

      const signature = await this.signL1Action(action, nonce);

      const payload = {
        action,
        nonce,
        signature,
        vaultAddress: null,
      };

      const response = await fetch(EXCHANGE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.status === "ok") {
        const statuses = result.response?.data?.statuses || [];
        const filled = statuses.find((s: any) => s.filled);
        const resting = statuses.find((s: any) => s.resting);
        
        return {
          success: true,
          orderId: filled?.filled?.oid?.toString() || resting?.resting?.oid?.toString() || "unknown",
          status: filled ? "filled" : resting ? "open" : "submitted",
          filledSize: filled?.filled?.totalSz ? parseFloat(filled.filled.totalSz) : undefined,
          avgPrice: filled?.filled?.avgPx ? parseFloat(filled.filled.avgPx) : undefined,
        };
      }

      return { 
        success: false, 
        error: result.response?.data || result.error || "Order failed" 
      };
    } catch (error: any) {
      console.error("Place order error:", error);
      return { success: false, error: error.message || "Failed to place order" };
    }
  }

  async cancelOrder(coin: string, orderId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.wallet || !this.walletAddress) {
      return { success: false, error: "Not connected to Hyperliquid" };
    }

    try {
      const assetIndex = await this.getAssetIndex(coin);
      if (assetIndex === null) {
        return { success: false, error: `Unknown asset: ${coin}` };
      }

      const nonce = Date.now();
      
      const action = {
        type: "cancel",
        cancels: [{
          a: assetIndex,
          o: parseInt(orderId),
        }],
      };

      const signature = await this.signL1Action(action, nonce);

      const payload = {
        action,
        nonce,
        signature,
        vaultAddress: null,
      };

      const response = await fetch(EXCHANGE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.status === "ok") {
        return { success: true };
      }

      return { success: false, error: result.response?.data || "Failed to cancel order" };
    } catch (error: any) {
      console.error("Cancel order error:", error);
      return { success: false, error: error.message || "Failed to cancel order" };
    }
  }

  async cancelAllOrders(coin?: string): Promise<{ success: boolean; cancelled: number; error?: string }> {
    try {
      const orders = await this.getOpenOrders();
      const ordersToCancel = coin 
        ? orders.filter(o => o.coin === coin)
        : orders;

      let cancelled = 0;
      for (const order of ordersToCancel) {
        const result = await this.cancelOrder(order.coin, order.oid.toString());
        if (result.success) cancelled++;
      }

      return { success: true, cancelled };
    } catch (error: any) {
      console.error("Cancel all orders error:", error);
      return { success: false, cancelled: 0, error: error.message };
    }
  }

  private async getTickerPrice(coin: string): Promise<number | null> {
    try {
      const response = await fetch(INFO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" }),
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      const price = data[coin];
      return price ? parseFloat(price) : null;
    } catch {
      return null;
    }
  }

  private assetCache: Map<string, number> | null = null;
  
  private async getAssetIndex(coin: string): Promise<number | null> {
    if (!this.assetCache) {
      try {
        const response = await fetch(INFO_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "meta" }),
        });
        
        if (!response.ok) return null;
        
        const meta = await response.json();
        this.assetCache = new Map();
        meta.universe.forEach((asset: any, index: number) => {
          this.assetCache!.set(asset.name, index);
        });
      } catch {
        return null;
      }
    }
    
    return this.assetCache.get(coin) ?? null;
  }

  disconnect(): void {
    this.wallet = null;
    this.walletAddress = null;
  }
}

let tradingInstance: HyperliquidTrading | null = null;

export function getTradingInstance(): HyperliquidTrading {
  if (!tradingInstance) {
    tradingInstance = new HyperliquidTrading(false);
  }
  return tradingInstance;
}

export function resetTradingInstance(): void {
  if (tradingInstance) {
    tradingInstance.disconnect();
  }
  tradingInstance = null;
}
