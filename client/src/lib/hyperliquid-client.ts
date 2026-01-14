import { JsonRpcSigner, keccak256, TypedDataDomain, TypedDataField } from "ethers";
import { encode as msgpackEncode } from "@msgpack/msgpack";

const INFO_API_URL = "https://api.hyperliquid.xyz/info";
const EXCHANGE_API_URL = "https://api.hyperliquid.xyz/exchange";

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
  marginUsed: number;
}

export interface AccountState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
  };
  crossMarginSummary?: {
    accountValue: string;
    totalNtlPos: string;
  };
  assetPositions: Array<{
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
      marginUsed: string;
    };
    type: string;
  }>;
}

export interface OpenOrder {
  coin: string;
  oid: number;
  side: string;
  sz: string;
  limitPx: string;
  timestamp: number;
  origSz: string;
}

let assetCache: Map<string, number> | null = null;

async function getAssetIndex(coin: string): Promise<number | null> {
  if (!assetCache) {
    try {
      const response = await fetch(INFO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "meta" }),
      });
      
      if (!response.ok) return null;
      
      const meta = await response.json();
      assetCache = new Map();
      meta.universe.forEach((asset: any, index: number) => {
        assetCache!.set(asset.name, index);
      });
    } catch {
      return null;
    }
  }
  
  return assetCache.get(coin) ?? null;
}

async function getMidPrice(coin: string): Promise<number | null> {
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

export async function getAccountState(address: string): Promise<AccountState | null> {
  try {
    const response = await fetch(INFO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "clearinghouseState",
        user: address,
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

export async function getPositions(address: string): Promise<Position[]> {
  const state = await getAccountState(address);
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
      marginUsed: parseFloat(ap.position.marginUsed || "0"),
    }));
}

export async function getOpenOrders(address: string): Promise<OpenOrder[]> {
  try {
    const response = await fetch(INFO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "openOrders",
        user: address,
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

function floatToWire(x: number): string {
  const rounded = Math.round(x * 1e8) / 1e8;
  if (Math.abs(rounded) < 1e-8) return "0";
  let str = rounded.toString();
  if (str.includes('.')) {
    str = str.replace(/\.?0+$/, '');
  }
  return str;
}

function orderTypeToWire(orderType: "market" | "limit"): { limit: { tif: string } } {
  if (orderType === "market") {
    return { limit: { tif: "Ioc" } };
  }
  return { limit: { tif: "Gtc" } };
}

function actionHash(action: any, vaultAddress: string | null, nonce: number): Uint8Array {
  const actionBytes = msgpackEncode(action);
  
  const vaultBytes = new Uint8Array(20);
  if (vaultAddress) {
    const addr = vaultAddress.startsWith('0x') ? vaultAddress.slice(2) : vaultAddress;
    for (let i = 0; i < 20; i++) {
      vaultBytes[i] = parseInt(addr.slice(i * 2, i * 2 + 2), 16);
    }
  }
  
  const nonceBytes = new Uint8Array(8);
  const nonceView = new DataView(nonceBytes.buffer);
  nonceView.setBigUint64(0, BigInt(nonce), false);
  
  const combined = new Uint8Array(actionBytes.length + vaultBytes.length + nonceBytes.length);
  combined.set(new Uint8Array(actionBytes), 0);
  combined.set(vaultBytes, actionBytes.length);
  combined.set(nonceBytes, actionBytes.length + vaultBytes.length);
  
  return combined;
}

async function signL1Action(
  signer: JsonRpcSigner,
  action: any,
  nonce: number,
  vaultAddress: string | null = null
): Promise<{ r: string; s: string; v: number }> {
  const hashData = actionHash(action, vaultAddress, nonce);
  const connectionId = keccak256(hashData);

  const domain: TypedDataDomain = {
    name: "Exchange",
    version: "1",
    chainId: 1337,
    verifyingContract: "0x0000000000000000000000000000000000000000",
  };

  const types: Record<string, TypedDataField[]> = {
    Agent: [
      { name: "source", type: "string" },
      { name: "connectionId", type: "bytes32" },
    ],
  };

  const message = {
    source: "a",
    connectionId,
  };

  const signature = await signer.signTypedData(domain, types, message);
  
  const r = signature.slice(0, 66);
  const s = "0x" + signature.slice(66, 130);
  const v = parseInt(signature.slice(130, 132), 16);
  
  return { r, s, v };
}

export async function placeOrder(
  signer: JsonRpcSigner,
  order: OrderRequest
): Promise<OrderResponse> {
  try {
    const assetIndex = await getAssetIndex(order.coin);
    if (assetIndex === null) {
      return { success: false, error: `Unknown asset: ${order.coin}` };
    }

    let limitPrice = order.price;
    
    if (order.orderType === "market" || !limitPrice) {
      const midPrice = await getMidPrice(order.coin);
      if (!midPrice) {
        return { success: false, error: "Could not get current price" };
      }
      const slippage = order.slippage || 0.02;
      limitPrice = order.isBuy 
        ? midPrice * (1 + slippage) 
        : midPrice * (1 - slippage);
    }

    const nonce = Date.now();
    
    const orderWire = {
      a: assetIndex,
      b: order.isBuy,
      p: floatToWire(limitPrice),
      s: floatToWire(order.size),
      r: order.reduceOnly || false,
      t: orderTypeToWire(order.orderType),
    };

    const action = {
      type: "order",
      orders: [orderWire],
      grouping: "na",
    };

    const signature = await signL1Action(signer, action, nonce, null);

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
      const error = statuses.find((s: any) => s.error);
      
      if (error) {
        return { success: false, error: error.error };
      }
      
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
      error: result.response?.data || result.error || JSON.stringify(result) 
    };
  } catch (error: any) {
    console.error("Place order error:", error);
    return { success: false, error: error.message || "Failed to place order" };
  }
}

export async function cancelOrder(
  signer: JsonRpcSigner,
  coin: string,
  orderId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const assetIndex = await getAssetIndex(coin);
    if (assetIndex === null) {
      return { success: false, error: `Unknown asset: ${coin}` };
    }

    const nonce = Date.now();
    
    const action = {
      type: "cancel",
      cancels: [{
        a: assetIndex,
        o: orderId,
      }],
    };

    const signature = await signL1Action(signer, action, nonce, null);

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

export async function cancelAllOrders(
  signer: JsonRpcSigner,
  address: string,
  coin?: string
): Promise<{ success: boolean; cancelled: number; error?: string }> {
  try {
    const orders = await getOpenOrders(address);
    const ordersToCancel = coin 
      ? orders.filter(o => o.coin === coin)
      : orders;

    let cancelled = 0;
    for (const order of ordersToCancel) {
      const result = await cancelOrder(signer, order.coin, order.oid);
      if (result.success) cancelled++;
    }

    return { success: true, cancelled };
  } catch (error: any) {
    console.error("Cancel all orders error:", error);
    return { success: false, cancelled: 0, error: error.message };
  }
}

export interface TriggerOrderRequest {
  coin: string;
  isBuy: boolean;
  size: number;
  triggerPrice: number;
  orderPrice?: number;
  isStopLoss: boolean;
  reduceOnly?: boolean;
}

export async function placeTriggerOrder(
  signer: JsonRpcSigner,
  order: TriggerOrderRequest
): Promise<OrderResponse> {
  try {
    const assetIndex = await getAssetIndex(order.coin);
    if (assetIndex === null) {
      return { success: false, error: `Unknown asset: ${order.coin}` };
    }

    const nonce = Date.now();
    
    const tpsl = order.isStopLoss ? "sl" : "tp";
    const limitPrice = order.orderPrice || order.triggerPrice;
    
    const orderWire = {
      a: assetIndex,
      b: order.isBuy,
      p: floatToWire(limitPrice),
      s: floatToWire(order.size),
      r: order.reduceOnly !== false,
      t: {
        trigger: {
          isMarket: !order.orderPrice,
          triggerPx: floatToWire(order.triggerPrice),
          tpsl,
        },
      },
    };

    const action = {
      type: "order",
      orders: [orderWire],
      grouping: "na",
    };

    const signature = await signL1Action(signer, action, nonce, null);

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
      const resting = statuses.find((s: any) => s.resting);
      const error = statuses.find((s: any) => s.error);
      
      if (error) {
        return { success: false, error: error.error };
      }
      
      return {
        success: true,
        orderId: resting?.resting?.oid?.toString() || "unknown",
        status: "open",
      };
    }

    return { 
      success: false, 
      error: result.response?.data || result.error || JSON.stringify(result) 
    };
  } catch (error: any) {
    console.error("Place trigger order error:", error);
    return { success: false, error: error.message || "Failed to place trigger order" };
  }
}

export async function closePosition(
  signer: JsonRpcSigner,
  coin: string,
  size: number,
  isLong: boolean
): Promise<OrderResponse> {
  // To close a position, place opposite market order with reduceOnly
  return placeOrder(signer, {
    coin,
    isBuy: !isLong, // Opposite direction to close
    size,
    orderType: "market",
    reduceOnly: true,
    slippage: 0.03, // 3% slippage for market close
  });
}

export async function setLeverage(
  signer: JsonRpcSigner,
  coin: string,
  leverage: number,
  isCross: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const assetIndex = await getAssetIndex(coin);
    if (assetIndex === null) {
      return { success: false, error: `Unknown asset: ${coin}` };
    }

    const nonce = Date.now();
    
    const action = {
      type: "updateLeverage",
      asset: assetIndex,
      isCross,
      leverage,
    };

    const signature = await signL1Action(signer, action, nonce, null);

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

    return { success: false, error: result.response?.data || "Failed to set leverage" };
  } catch (error: any) {
    console.error("Set leverage error:", error);
    return { success: false, error: error.message || "Failed to set leverage" };
  }
}
