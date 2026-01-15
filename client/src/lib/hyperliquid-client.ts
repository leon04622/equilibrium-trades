import { JsonRpcSigner, Wallet } from "ethers";
import { signL1Action as sdkSignL1Action, PrivateKeySigner } from "@nktkas/hyperliquid/signing";

const INFO_API_URL = "https://api.hyperliquid.xyz/info";
const EXCHANGE_API_URL = "https://api.hyperliquid.xyz/exchange";
const AGENT_STORAGE_KEY = "hyperliquid_agent";

// Agent key management for browser wallet trading
// This uses Hyperliquid's agent authorization flow:
// 1. Generate a local keypair (agent)
// 2. User signs an "approveAgent" action with their browser wallet
// 3. Agent key can then sign L1 actions with chainId 1337
interface StoredAgent {
  privateKey: string;
  address: string;
  authorizedBy: string; // User address that authorized this agent
  expiry?: number;
}

function getStoredAgent(userAddress: string): StoredAgent | null {
  try {
    const stored = localStorage.getItem(`${AGENT_STORAGE_KEY}_${userAddress.toLowerCase()}`);
    if (!stored) return null;
    const agent = JSON.parse(stored) as StoredAgent;
    if (agent.authorizedBy.toLowerCase() !== userAddress.toLowerCase()) return null;
    return agent;
  } catch {
    return null;
  }
}

function storeAgent(userAddress: string, agent: StoredAgent): void {
  localStorage.setItem(`${AGENT_STORAGE_KEY}_${userAddress.toLowerCase()}`, JSON.stringify(agent));
}

function generateAgentKey(): { privateKey: string; address: string } {
  const wallet = Wallet.createRandom();
  return {
    privateKey: wallet.privateKey,
    address: wallet.address.toLowerCase(),
  };
}

// Authorize a new agent - user signs with browser wallet
async function authorizeAgent(
  signer: JsonRpcSigner,
  agentAddress: string
): Promise<boolean> {
  const nonce = Date.now();
  const signatureChainId = "0xa4b1"; // Arbitrum One chainId in hex
  
  // ApproveAgent uses EIP-712 with the user's network chainId
  // The signatureChainId in the action tells Hyperliquid which chainId was used for signing
  const domain = {
    name: "HyperliquidSignTransaction",
    version: "1",
    chainId: parseInt(signatureChainId, 16), // 42161 for Arbitrum
    verifyingContract: "0x0000000000000000000000000000000000000000",
  };

  // EIP-712 types - must match SDK's ApproveAgentTypes exactly
  // Primary type is "HyperliquidTransaction:ApproveAgent"
  const types = {
    "HyperliquidTransaction:ApproveAgent": [
      { name: "hyperliquidChain", type: "string" },
      { name: "agentAddress", type: "address" },
      { name: "agentName", type: "string" },
      { name: "nonce", type: "uint64" },
    ],
  };

  // Message contains only the fields defined in the type (NOT type or signatureChainId)
  const message = {
    hyperliquidChain: "Mainnet",
    agentAddress: agentAddress,
    agentName: "Equilibrium",
    nonce: nonce,
  };

  console.log("Requesting agent authorization signature...");
  console.log("Domain:", domain);
  console.log("Types:", types);
  console.log("Message:", message);
  
  try {
    const signature = await signer.signTypedData(domain, types, message);
    console.log("Agent authorization signature:", signature);
    
    // Parse signature
    const r = signature.slice(0, 66);
    const s = "0x" + signature.slice(66, 130);
    const v = parseInt(signature.slice(130, 132), 16);
    
    // Submit to Hyperliquid - action includes ALL fields
    const action = {
      type: "approveAgent",
      signatureChainId: signatureChainId,
      hyperliquidChain: "Mainnet",
      agentAddress: agentAddress,
      agentName: "Equilibrium",
      nonce: nonce,
    };
    
    const response = await fetch(EXCHANGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        signature: { r, s, v },
        nonce,
      }),
    });
    
    const result = await response.json();
    console.log("Agent authorization response:", result);
    
    if (result.status === "ok") {
      return true;
    } else {
      console.error("Agent authorization failed:", result);
      return false;
    }
  } catch (error) {
    console.error("Agent authorization error:", error);
    return false;
  }
}

// Get or create an authorized agent for trading
export async function getOrCreateAgent(signer: JsonRpcSigner): Promise<{ privateKey: string; address: string } | null> {
  const userAddress = await signer.getAddress();
  
  // Check for existing agent
  const stored = getStoredAgent(userAddress);
  if (stored) {
    console.log("Using existing agent:", stored.address);
    return { privateKey: stored.privateKey, address: stored.address };
  }
  
  // Generate new agent
  console.log("Generating new agent key...");
  const agent = generateAgentKey();
  console.log("New agent address:", agent.address);
  
  // Authorize the agent
  const authorized = await authorizeAgent(signer, agent.address);
  if (!authorized) {
    return null;
  }
  
  // Store the agent
  storeAgent(userAddress, {
    ...agent,
    authorizedBy: userAddress,
  });
  
  return agent;
}

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

// Monotonic nonce generator - ensures each nonce is unique and increasing
let lastNonce = 0;
function getUniqueNonce(): number {
  const now = Date.now();
  // Ensure nonce is always greater than the last one used
  lastNonce = Math.max(now, lastNonce + 1);
  return lastNonce;
}

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

// Sign L1 action using agent key (not browser wallet)
// The agent key can sign with chainId 1337 which Hyperliquid requires
async function signL1ActionWithAgent(
  agentPrivateKey: string,
  action: any,
  nonce: number,
  vaultAddress: string | null = null
): Promise<{ r: string; s: string; v: number }> {
  console.log("Signing action with agent key...");
  console.log("Action:", JSON.stringify(action));
  console.log("Nonce:", nonce);
  
  // Create a PrivateKeySigner from the agent key
  const agentSigner = new PrivateKeySigner(agentPrivateKey as `0x${string}`);
  
  // Use the SDK's signL1Action with the agent key
  // This handles chainId 1337, correct action hashing, and phantom agent construction
  const signature = await sdkSignL1Action({
    wallet: agentSigner,
    action,
    nonce,
    vaultAddress: vaultAddress ? vaultAddress as `0x${string}` : undefined,
    isTestnet: false,
  });
  
  console.log("Agent signature:", signature);
  return signature;
}

export async function placeOrder(
  signer: JsonRpcSigner,
  order: OrderRequest
): Promise<OrderResponse> {
  try {
    console.log("placeOrder called with:", order);
    
    // Get the signer's address
    const signerAddress = await signer.getAddress();
    console.log("Signer address:", signerAddress);
    
    // Verify the user has an account on Hyperliquid
    const accountState = await getAccountState(signerAddress);
    console.log("Account state:", accountState);
    
    if (!accountState || !accountState.marginSummary) {
      return { 
        success: false, 
        error: `Wallet ${signerAddress} not found on Hyperliquid. Please deposit funds at app.hyperliquid.xyz first.` 
      };
    }
    
    // Get or create an authorized agent for signing
    const agent = await getOrCreateAgent(signer);
    if (!agent) {
      return { 
        success: false, 
        error: "Failed to authorize trading agent. Please try again." 
      };
    }
    console.log("Using agent:", agent.address);
    
    const assetIndex = await getAssetIndex(order.coin);
    if (assetIndex === null) {
      console.error("Unknown asset:", order.coin);
      return { success: false, error: `Unknown asset: ${order.coin}` };
    }
    console.log("Asset index:", assetIndex);

    let limitPrice = order.price;
    
    if (order.orderType === "market" || !limitPrice) {
      const midPrice = await getMidPrice(order.coin);
      if (!midPrice) {
        console.error("Could not get mid price for:", order.coin);
        return { success: false, error: "Could not get current price" };
      }
      const slippage = order.slippage || 0.02;
      limitPrice = order.isBuy 
        ? midPrice * (1 + slippage) 
        : midPrice * (1 - slippage);
      console.log("Market order - midPrice:", midPrice, "limitPrice with slippage:", limitPrice);
    }

    const orderWire = {
      a: assetIndex,
      b: order.isBuy,
      p: floatToWire(limitPrice),
      s: floatToWire(order.size),
      r: order.reduceOnly || false,
      t: orderTypeToWire(order.orderType),
    };
    console.log("Order wire:", orderWire);
    
    // Generate nonce right before signing to ensure freshness
    const nonce = getUniqueNonce();
    console.log("Using nonce:", nonce);

    const action = {
      type: "order",
      orders: [orderWire],
      grouping: "na",
    };

    console.log("Requesting signature for action:", action);
    const signature = await signL1ActionWithAgent(agent.privateKey, action, nonce, null);
    console.log("Signature received:", signature);

    const payload = {
      action,
      nonce,
      signature,
      vaultAddress: null,
    };

    console.log("Sending order to Hyperliquid:", JSON.stringify(payload));
    const response = await fetch(EXCHANGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("Hyperliquid response:", result);

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
    // Get or create an authorized agent
    const agent = await getOrCreateAgent(signer);
    if (!agent) {
      return { success: false, error: "Failed to authorize trading agent" };
    }
    
    const assetIndex = await getAssetIndex(coin);
    if (assetIndex === null) {
      return { success: false, error: `Unknown asset: ${coin}` };
    }

    const nonce = getUniqueNonce();
    
    const action = {
      type: "cancel",
      cancels: [{
        a: assetIndex,
        o: orderId,
      }],
    };

    const signature = await signL1ActionWithAgent(agent.privateKey, action, nonce, null);

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
    // Get or create an authorized agent
    const agent = await getOrCreateAgent(signer);
    if (!agent) {
      return { success: false, error: "Failed to authorize trading agent" };
    }
    
    const assetIndex = await getAssetIndex(order.coin);
    if (assetIndex === null) {
      return { success: false, error: `Unknown asset: ${order.coin}` };
    }

    const nonce = getUniqueNonce();
    
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

    const signature = await signL1ActionWithAgent(agent.privateKey, action, nonce, null);

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
  console.log("closePosition called:", { coin, size, isLong });
  // To close a position, place opposite market order with reduceOnly
  const result = await placeOrder(signer, {
    coin,
    isBuy: !isLong, // Opposite direction to close
    size,
    orderType: "market",
    reduceOnly: true,
    slippage: 0.03, // 3% slippage for market close
  });
  console.log("closePosition result:", result);
  return result;
}

export async function setLeverage(
  signer: JsonRpcSigner,
  coin: string,
  leverage: number,
  isCross: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get or create an authorized agent
    const agent = await getOrCreateAgent(signer);
    if (!agent) {
      return { success: false, error: "Failed to authorize trading agent" };
    }
    
    const assetIndex = await getAssetIndex(coin);
    if (assetIndex === null) {
      return { success: false, error: `Unknown asset: ${coin}` };
    }

    const nonce = getUniqueNonce();
    
    const action = {
      type: "updateLeverage",
      asset: assetIndex,
      isCross,
      leverage,
    };

    const signature = await signL1ActionWithAgent(agent.privateKey, action, nonce, null);

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
