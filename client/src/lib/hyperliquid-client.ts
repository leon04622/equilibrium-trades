import { JsonRpcSigner, Wallet, getAddress } from "ethers";
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { ApiRequestError } from "@nktkas/hyperliquid/api/exchange";
import { signL1Action as sdkSignL1Action, PrivateKeySigner } from "@nktkas/hyperliquid/signing";
import {
  HL_BUILDER_ADDRESS as BUILDER_ADDRESS,
  HL_BUILDER_MAX_FEE_RATE,
  HL_BUILDER_FEE_F,
  HL_REFERRAL_CODE as PLATFORM_REFERRAL_CODE,
  isBuilderFeeConfigured,
} from "@/lib/hyperliquid-platform-config";
import { isUserRejectedWalletError } from "@/lib/wallet-errors";
import { signTypedDataHyperliquid } from "@/lib/eip712-typed-data";
import { fetchApexHlOnboardingSnapshot } from "@/lib/hyperliquid-onboarding";

type HlWalletAuthStep = "ok" | "user_cancelled" | "failed";

const INFO_API_URL = "https://api.hyperliquid.xyz/info";
const EXCHANGE_API_URL = "https://api.hyperliquid.xyz/exchange";
const AGENT_STORAGE_KEY = "hyperliquid_agent";
const BUILDER_FEE_STORAGE_KEY = "hyperliquid_builder_fee_approved";

/** In-memory only — cleared when HL trading session storage is cleared for an address. */
const referralSetForSession = new Set<string>();

// Get server-synced timestamp to avoid browser clock issues
// The Replit preview can have significant clock drift compared to Hyperliquid servers
let serverTimeOffset = 0;
let timeSynced = false;

async function syncServerTime(): Promise<void> {
  if (timeSynced && serverTimeOffset !== 0) return; // Already synced successfully
  
  try {
    // Use clearinghouseState which includes a 'time' field with server timestamp
    const testAddress = "0x0000000000000000000000000000000000000000";
    const before = Date.now();
    const response = await fetch(INFO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: testAddress }),
    });
    const data = await response.json();
    const after = Date.now();
    
    if (data && data.time) {
      const roundTrip = Math.floor((after - before) / 2);
      const localTime = before + roundTrip;
      serverTimeOffset = data.time - localTime;
      timeSynced = true;
      console.log("Time synced successfully! Server time:", data.time, "Local time:", localTime, "Offset:", serverTimeOffset, "ms");
    } else {
      throw new Error("No time in response");
    }
  } catch (e) {
    console.warn("Primary sync failed, trying fallback...", e);
    
    // Fallback: Use allMids which is fast and reliable
    try {
      // Get current server time by fetching any user's state (even non-existent)
      const response = await fetch(INFO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" }),
      });
      
      // Use the Date header from the response for timing
      const dateHeader = response.headers.get("date");
      if (dateHeader) {
        const serverTime = new Date(dateHeader).getTime();
        serverTimeOffset = serverTime - Date.now();
        timeSynced = true;
        console.log("Time synced from header! Offset:", serverTimeOffset, "ms");
      } else {
        throw new Error("No date header");
      }
    } catch {
      // Last resort: Use a fixed offset based on observed 6-day drift
      console.warn("All sync methods failed, using fallback offset");
      serverTimeOffset = 6 * 24 * 60 * 60 * 1000 + 60000; // 6 days + 1 minute buffer
      timeSynced = true;
    }
  }
}

function getSyncedTimestamp(): number {
  return Date.now() + serverTimeOffset;
}

// Initialize time sync immediately
syncServerTime();

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

/** Returns the delegated API agent private key for this wallet (after approveAgent). */
export function getHyperliquidAgentPrivateKey(userAddress: string): string | null {
  const a = getStoredAgent(userAddress);
  return a?.privateKey ?? null;
}

/** Public address of the locally stored HL API agent (for L1 extraAgents checks). */
export function getHyperliquidLocalAgentAddress(userAddress: string): string | null {
  const a = getStoredAgent(userAddress);
  return a?.address ?? null;
}

function storeAgent(userAddress: string, agent: StoredAgent): void {
  localStorage.setItem(`${AGENT_STORAGE_KEY}_${userAddress.toLowerCase()}`, JSON.stringify(agent));
}

function builderFeeApprovedKey(userAddress: string): string {
  return `${BUILDER_FEE_STORAGE_KEY}_${userAddress.toLowerCase()}`;
}

/** True after the user completed Hyperliquid's EIP-712 approveBuilderFee for this wallet (stored locally). */
export function hasHyperliquidBuilderFeeApproved(userAddress: string): boolean {
  if (!isBuilderFeeConfigured()) return false;
  try {
    return localStorage.getItem(builderFeeApprovedKey(userAddress)) === "1";
  } catch {
    return false;
  }
}

/** Attach HL order `builder` only when configured and the user has approved max fee on-chain (HL requirement). */
function shouldAttachBuilderToOrders(userAddress: string): boolean {
  return isBuilderFeeConfigured() && hasHyperliquidBuilderFeeApproved(userAddress);
}

/** Remove only the stored API agent (e.g. when L1 no longer lists it). Keeps builder-fee local flag. */
export function clearHyperliquidAgentOnly(walletAddress: string): void {
  try {
    localStorage.removeItem(`${AGENT_STORAGE_KEY}_${walletAddress.toLowerCase()}`);
  } catch {
    /* ignore */
  }
}

/** Clear delegated Hyperliquid agent + local builder-fee flag (call on wallet disconnect). */
export function clearHyperliquidTradingSession(walletAddress: string): void {
  try {
    const addr = walletAddress.toLowerCase();
    localStorage.removeItem(`${AGENT_STORAGE_KEY}_${addr}`);
    localStorage.removeItem(builderFeeApprovedKey(walletAddress));
  } catch {
    /* ignore */
  }
  referralSetForSession.delete(walletAddress.toLowerCase());
}

/**
 * True when a stored HL API-style agent exists (approveAgent completed).
 * Builder fee approval is separate — see {@link hasHyperliquidBuilderFeeApproved}; it only affects order attribution.
 */
export function isHyperliquidTradingSessionReady(walletAddress: string): boolean {
  return !!getStoredAgent(walletAddress);
}

export type EnsureHyperliquidSessionOptions = {
  /**
   * When true (first-trade lifetime handshake), builder fee EIP-712 must succeed.
   * Skipping or failing aborts setup so CRM `isBuilderLinked` stays false until complete.
   */
  requireBuilderFee?: boolean;
};

/**
 * One-time Hyperliquid setup: authorize the local agent key (EIP-712) and approve builder fee (EIP-712).
 * Hyperliquid’s one-time ~1 USDC account activation is charged on the first successful CoreWriter action (e.g. approveAgent).
 * All later orders / TP-SL / cancel / leverage use {@link signL1ActionWithAgent} only — no wallet popups.
 */
export async function ensureHyperliquidTradingSession(
  signer: JsonRpcSigner,
  opts?: EnsureHyperliquidSessionOptions,
): Promise<{ success: boolean; error?: string }> {
  try {
    await syncServerTime();
    const userAddress = await signer.getAddress();

    try {
      const nw = await signer.provider?.getNetwork();
      if (nw != null && Number(nw.chainId) !== 42161) {
        return {
          success: false,
          error:
            "Switch to Arbitrum One (chain 42161) in your wallet — Hyperliquid signatures require the correct network.",
        };
      }
    } catch {
      /* ignore network read failures */
    }

    let stored = getStoredAgent(userAddress);
    if (!stored) {
      const agent = generateAgentKey();
      const authorized = await authorizeAgent(signer, agent.address);
      if (authorized === "user_cancelled") {
        return {
          success: false,
          error:
            "You cancelled the Hyperliquid trading key step in your wallet. Your Equilibrium sign-in is already saved — tap Approve & Continue to finish setup.",
        };
      }
      if (authorized !== "ok") {
        return {
          success: false,
          error:
            "Hyperliquid could not register your trading key. Check your connection and try again.",
        };
      }
      storeAgent(userAddress, {
        ...agent,
        authorizedBy: userAddress,
      });
      stored = getStoredAgent(userAddress);
      if (!stored) {
        return { success: false, error: "Could not store trading session." };
      }
    }

    if (isBuilderFeeConfigured()) {
      const feeKey = builderFeeApprovedKey(userAddress);
      if (!localStorage.getItem(feeKey)) {
        try {
          const snap = await fetchApexHlOnboardingSnapshot(userAddress, null);
          if (snap.builderFeeOk) {
            localStorage.setItem(feeKey, "1");
          }
        } catch (e) {
          console.warn(
            "[Hyperliquid] Could not read maxBuilderFee from Info API; may prompt approveBuilderFee",
            e,
          );
        }
      }
      if (!localStorage.getItem(feeKey)) {
        const feeResult = await approveBuilderFee(signer);
        if (feeResult === "ok") {
          localStorage.setItem(feeKey, "1");
        } else if (feeResult === "user_cancelled") {
          if (opts?.requireBuilderFee) {
            return {
              success: false,
              error:
                "Hyperliquid builder fee approval was cancelled. It is required once to link platform fees — please sign to continue.",
            };
          }
          console.warn(
            "[Hyperliquid] User skipped builder fee approval — trading still works; platform fee on orders is omitted until approved.",
          );
        } else {
          if (opts?.requireBuilderFee) {
            return {
              success: false,
              error:
                "Could not complete Hyperliquid builder fee approval (approveBuilderFee). Check your connection and try again.",
            };
          }
          console.warn(
            "[Hyperliquid] Builder fee approval failed — trading still works; retry from the trading banner when convenient.",
          );
        }
      }
    } else if (opts?.requireBuilderFee) {
      return {
        success: false,
        error: "Builder fee is not configured — contact support.",
      };
    }

    return { success: true };
  } catch (e: any) {
    console.error("ensureHyperliquidTradingSession:", e);
    return { success: false, error: e?.message || "Hyperliquid session setup failed." };
  }
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
): Promise<HlWalletAuthStep> {
  // Ensure time is synced before authorization
  await syncServerTime();
  const nonce = getSyncedTimestamp();
  console.log("Using synced nonce:", nonce, "offset:", serverTimeOffset);
  
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
    const signature = await signTypedDataHyperliquid(
      signer,
      domain,
      types,
      "HyperliquidTransaction:ApproveAgent",
      message,
    );
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
      return "ok";
    }
    console.error("Agent authorization failed:", result);
    return "failed";
  } catch (error) {
    console.error("Agent authorization error:", error);
    if (isUserRejectedWalletError(error)) return "user_cancelled";
    return "failed";
  }
}

// Submit approveBuilderFee action to Hyperliquid so the platform earns a fee on the user's trades
async function approveBuilderFee(signer: JsonRpcSigner): Promise<HlWalletAuthStep> {
  if (!isBuilderFeeConfigured()) {
    console.warn("[Hyperliquid] Builder address invalid — skipping builder fee approval");
    return "failed";
  }

  await syncServerTime();
  const nonce = getSyncedTimestamp();
  const signatureChainId = "0xa4b1"; // Arbitrum One

  const domain = {
    name: "HyperliquidSignTransaction",
    version: "1",
    chainId: parseInt(signatureChainId, 16), // 42161
    verifyingContract: "0x0000000000000000000000000000000000000000",
  };

  const types = {
    "HyperliquidTransaction:ApproveBuilderFee": [
      { name: "hyperliquidChain", type: "string" },
      { name: "builder", type: "address" },
      { name: "maxFeeRate", type: "string" },
      { name: "nonce", type: "uint64" },
    ],
  };

  // maxFeeRate of "0.0003" = 0.03% = 3 basis points (the platform earns this from each trade)
  const message = {
    hyperliquidChain: "Mainnet",
    builder: BUILDER_ADDRESS,
    maxFeeRate: HL_BUILDER_MAX_FEE_RATE,
    nonce,
  };

  try {
    console.log("Requesting builder fee approval signature...");
    const signature = await signTypedDataHyperliquid(
      signer,
      domain,
      types,
      "HyperliquidTransaction:ApproveBuilderFee",
      message,
    );

    const r = signature.slice(0, 66);
    const s = "0x" + signature.slice(66, 130);
    const v = parseInt(signature.slice(130, 132), 16);

    const action = {
      type: "approveBuilderFee",
      signatureChainId,
      hyperliquidChain: "Mainnet",
      builder: BUILDER_ADDRESS,
      maxFeeRate: "0.0003",
      nonce,
    };

    const response = await fetch(EXCHANGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, signature: { r, s, v }, nonce }),
    });

    const result = await response.json();
    console.log("approveBuilderFee response:", result);
    return result.status === "ok" ? "ok" : "failed";
  } catch (error) {
    console.error("approveBuilderFee error:", error);
    if (isUserRejectedWalletError(error)) return "user_cancelled";
    return "failed";
  }
}

export async function getOrCreateAgent(signer: JsonRpcSigner): Promise<{ privateKey: string; address: string } | null> {
  const userAddress = await signer.getAddress();

  const stored = getStoredAgent(userAddress);
  if (stored) {
    console.log("Using existing agent:", stored.address);
    return { privateKey: stored.privateKey, address: stored.address };
  }

  // Lazy creation (e.g. deep link) — still one-time wallet prompts, bundled here
  const session = await ensureHyperliquidTradingSession(signer);
  if (!session.success) {
    console.error("getOrCreateAgent:", session.error);
    return null;
  }

  const created = getStoredAgent(userAddress);
  return created ? { privateKey: created.privateKey, address: created.address } : null;
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
  withdrawable?: string;
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
let assetCacheTime = 0;
let assetMetaCache: Map<string, { szDecimals: number; maxLeverage: number }> | null = null;
const ASSET_CACHE_TTL = 5 * 60 * 1000; // 5 minutes — picks up any new markets Hyperliquid lists

// Monotonic nonce generator - ensures each nonce is unique and increasing
let lastNonce = 0;
function getUniqueNonce(): number {
  const now = getSyncedTimestamp();
  // Ensure nonce is always greater than the last one used
  lastNonce = Math.max(now, lastNonce + 1);
  return lastNonce;
}

async function refreshAssetCache(): Promise<void> {
  const now = Date.now();
  if (assetCache && now - assetCacheTime < ASSET_CACHE_TTL) return;
  try {
    const response = await fetch(INFO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meta" }),
    });
    if (!response.ok) return;
    const meta = await response.json();
    assetCache = new Map();
    assetMetaCache = new Map();
    meta.universe.forEach((asset: any, index: number) => {
      assetCache!.set(asset.name, index);
      assetMetaCache!.set(asset.name, {
        szDecimals: asset.szDecimals ?? 3,
        maxLeverage: asset.maxLeverage ?? 50,
      });
    });
    assetCacheTime = now;
  } catch {
    // keep existing cache if refresh fails
  }
}

async function getAssetIndex(coin: string): Promise<number | null> {
  // Spot market coins use "@N" format; their asset index is 10000 + N
  if (coin.startsWith("@")) {
    const n = parseInt(coin.slice(1), 10);
    return isNaN(n) ? null : 10000 + n;
  }
  await refreshAssetCache();
  return assetCache?.get(coin) ?? null;
}

function getAssetMeta(coin: string): { szDecimals: number; maxLeverage: number } {
  // Spot markets have no leverage
  if (coin.startsWith("@")) return { szDecimals: 2, maxLeverage: 1 };
  return assetMetaCache?.get(coin) ?? { szDecimals: 3, maxLeverage: 50 };
}

export function isSpotCoin(coin: string): boolean {
  return coin.startsWith("@");
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

/**
 * Same data as POST `clearinghouseState`, via @nktkas/hyperliquid InfoClient (SDK).
 * Use for initial sync alongside REST open orders.
 */
export async function getClearinghouseStateViaInfoClient(address: string): Promise<AccountState | null> {
  try {
    const transport = new HttpTransport({ isTestnet: false });
    const info = new InfoClient({ transport });
    const data = await info.clearinghouseState({ user: address as `0x${string}` });
    return data as unknown as AccountState;
  } catch (e) {
    console.warn("[Hyperliquid] InfoClient.clearinghouseState failed:", e);
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

export interface SpotBalance {
  coin: string;
  hold: string;
  total: string;
  entryNtl: string;
}

export interface SpotState {
  balances: SpotBalance[];
}

export async function getSpotState(address: string): Promise<SpotState | null> {
  try {
    const response = await fetch(INFO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "spotClearinghouseState",
        user: address,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching spot state:", error);
    return null;
  }
}

export async function getSpotBalances(address: string): Promise<SpotBalance[]> {
  const state = await getSpotState(address);
  if (!state || !state.balances) return [];
  
  return state.balances.filter(b => parseFloat(b.total) > 0);
}

export function extractPerpPositionsFromClearinghouse(state: AccountState | null): Position[] {
  if (!state) return [];
  return state.assetPositions
    .filter((ap) => parseFloat(ap.position.szi) !== 0)
    .map((ap) => ({
      coin: ap.position.coin,
      size: Math.abs(parseFloat(ap.position.szi)),
      entryPrice: parseFloat(ap.position.entryPx),
      unrealizedPnl: parseFloat(ap.position.unrealizedPnl),
      leverage: ap.position.leverage?.value || 1,
      liquidationPrice: ap.position.liquidationPx ? parseFloat(ap.position.liquidationPx) : undefined,
      side: parseFloat(ap.position.szi) > 0 ? ("long" as const) : ("short" as const),
      marginUsed: parseFloat(ap.position.marginUsed || "0"),
    }));
}

export async function getPositions(address: string): Promise<Position[]> {
  const state = await getAccountState(address);
  return extractPerpPositionsFromClearinghouse(state);
}

export async function getCoinMaxLeverage(coin: string): Promise<number> {
  await refreshAssetCache();
  return getAssetMeta(coin).maxLeverage;
}

export async function getOpenOrders(address: string): Promise<OpenOrder[]> {
  try {
    const response = await fetch(INFO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "frontendOpenOrders",
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

// Round to 5 significant figures, which is Hyperliquid's precision requirement
export function floatToWire(x: number): string {
  if (Math.abs(x) < 1e-8) return "0";
  
  // Round to 5 significant figures
  const magnitude = Math.floor(Math.log10(Math.abs(x)));
  const scale = Math.pow(10, 4 - magnitude); // 5 sig figs = 4 - magnitude decimals
  const rounded = Math.round(x * scale) / scale;
  
  let str = rounded.toString();
  if (str.includes('.')) {
    str = str.replace(/\.?0+$/, '');
  }
  return str;
}

// Format price for a specific coin - each coin has a specific tick size
function formatPrice(price: number, coin: string): string {
  // Use live metadata from Hyperliquid to determine tick size per coin.
  // szDecimals drives size precision; Hyperliquid prices use 5 significant figures.
  // High-price coins (BTC) round to whole numbers; mid-price coins use 1dp;
  // low-price coins use floatToWire (5 sig figs). This matches the exchange rules.
  if (price >= 10000) return Math.round(price).toString();
  if (price >= 1000) return (Math.round(price * 10) / 10).toString();
  return floatToWire(price);
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

// Attempt to register the platform referral code for a new user.
// Silently no-ops if already done this session, or if no referral code is set.
export async function trySetReferrer(signer: JsonRpcSigner): Promise<void> {
  if (!PLATFORM_REFERRAL_CODE) return;
  try {
    const address = (await signer.getAddress()).toLowerCase();
    if (referralSetForSession.has(address)) return;
    const agent = getStoredAgent(address);
    if (!agent) return;
    const nonce = getUniqueNonce();
    const action = { type: "setReferrer", code: PLATFORM_REFERRAL_CODE };
    const signature = await signL1ActionWithAgent(agent.privateKey, action, nonce, null);
    await fetch(EXCHANGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, nonce, signature, vaultAddress: null }),
    });
    referralSetForSession.add(address);
  } catch {
    // Referral is best-effort — never block order placement.
  }
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
        error: `Wallet ${signerAddress} not found on Hyperliquid. Please deposit funds via the Portfolio page first.` 
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
      p: formatPrice(limitPrice, order.coin),
      s: floatToWire(order.size),
      r: order.reduceOnly || false,
      t: orderTypeToWire(order.orderType),
    };
    console.log("Order wire:", orderWire);
    
    // Generate nonce right before signing to ensure freshness
    const nonce = getUniqueNonce();
    console.log("Using nonce:", nonce);

    const action: Record<string, any> = {
      type: "order",
      orders: [orderWire],
      grouping: "na",
    };

    if (shouldAttachBuilderToOrders(signerAddress)) {
      action.builder = { b: BUILDER_ADDRESS, f: HL_BUILDER_FEE_F };
    }

    const signature = await signL1ActionWithAgent(agent.privateKey, action, nonce, null);

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
    console.log("[HL cancel] request action.cancels:", JSON.stringify(action.cancels));
    console.log("[HL cancel] full response:", JSON.stringify(result));

    if (result.status !== "ok") {
      return {
        success: false,
        error:
          typeof result.response === "string"
            ? result.response
            : result.response?.data || result.error || JSON.stringify(result),
      };
    }

    // Hyperliquid returns status "ok" even when a cancel fails — real outcome is in data.statuses.
    const statuses = result.response?.data?.statuses;
    if (Array.isArray(statuses) && statuses.length > 0) {
      for (let i = 0; i < statuses.length; i++) {
        const st = statuses[i];
        if (st === "success") continue;
        if (st && typeof st === "object" && "error" in st) {
          return { success: false, error: String((st as { error: string }).error) };
        }
        return { success: false, error: `Cancel failed: ${JSON.stringify(st)}` };
      }
      return { success: true };
    }

    console.warn("[HL cancel] ok response but no statuses — treating as failure", result);
    return { success: false, error: "Could not verify cancel (missing statuses in response)" };
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

/**
 * Experimental: native trailing stop market (callback as fraction of mark, e.g. 0.02 = 2%).
 * If the exchange rejects the payload shape, callers should fall back to a fixed trigger SL
 * plus client-side ratchet + modify.
 */
export async function placeTrailingStopMarketOrder(
  signer: JsonRpcSigner,
  order: {
    coin: string;
    isBuy: boolean;
    size: number;
    /** Distance / mark, e.g. 0.015 = 1.5% */
    callbackRate: number;
    /** Initial stop anchor from the user drag (HL may require a trigger px). */
    anchorTriggerPx: number;
  },
): Promise<OrderResponse> {
  try {
    const agent = await getOrCreateAgent(signer);
    if (!agent) {
      return { success: false, error: "Failed to authorize trading agent" };
    }

    const assetIndex = await getAssetIndex(order.coin);
    if (assetIndex === null) {
      return { success: false, error: `Unknown asset: ${order.coin}` };
    }

    const mid = (await getMidPrice(order.coin)) ?? order.anchorTriggerPx;
    const SLIPPAGE = 0.05;
    const limitPrice = order.isBuy ? mid * (1 + SLIPPAGE) : mid * (1 - SLIPPAGE);

    const nonce = getUniqueNonce();

    const orderWire: Record<string, unknown> = {
      a: assetIndex,
      b: order.isBuy,
      p: floatToWire(limitPrice),
      s: floatToWire(order.size),
      r: true,
      t: {
        trailingStopMarket: {
          isMarket: true,
          callbackRate: floatToWire(order.callbackRate),
          triggerPx: floatToWire(order.anchorTriggerPx),
        },
      },
    };

    const signerAddress = await signer.getAddress();
    const action: Record<string, unknown> = {
      type: "order",
      orders: [orderWire],
      grouping: "na",
    };
    if (shouldAttachBuilderToOrders(signerAddress)) {
      action.builder = { b: BUILDER_ADDRESS, f: HL_BUILDER_FEE_F };
    }

    const signature = await signL1ActionWithAgent(agent.privateKey, action, nonce, null);
    const payload = { action, nonce, signature, vaultAddress: null };

    const response = await fetch(EXCHANGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("[placeTrailingStopMarketOrder] response:", JSON.stringify(result));

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
      error: result.response?.data || result.error || JSON.stringify(result),
    };
  } catch (error: any) {
    console.error("Place trailing stop error:", error);
    return { success: false, error: error.message || "Failed to place trailing stop" };
  }
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
    // For trigger market orders, the limit price acts as a "worst acceptable fill" guard.
    // Sell orders (close long): set limit below trigger so the order fills even if the
    // market gaps past the trigger. Buy orders (close short): set limit above trigger.
    const SLIPPAGE = 0.05;
    const limitPrice = order.orderPrice
      ? order.orderPrice
      : order.isBuy
        ? order.triggerPrice * (1 + SLIPPAGE)
        : order.triggerPrice * (1 - SLIPPAGE);
    
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

    const signerAddress = await signer.getAddress();

    const action: Record<string, unknown> = {
      type: "order",
      orders: [orderWire],
      grouping: "na",
    };
    if (shouldAttachBuilderToOrders(signerAddress)) {
      action.builder = { b: BUILDER_ADDRESS, f: HL_BUILDER_FEE_F };
    }

    const signature = await signL1ActionWithAgent(
      agent.privateKey,
      action,
      nonce,
      null
    );

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
    console.log(`[placeTriggerOrder] ${tpsl.toUpperCase()} response:`, JSON.stringify(result));

    if (result.status === "ok") {
      const statuses = result.response?.data?.statuses || [];
      const resting = statuses.find((s: any) => s.resting);
      const error = statuses.find((s: any) => s.error);
      
      if (error) {
        console.error(`[placeTriggerOrder] ${tpsl.toUpperCase()} order error:`, error.error);
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

// Transfer USDC between spot and perp accounts
// toPerp = true: moves USDC from spot → perp margin
// toPerp = false: moves USDC from perp margin → spot
// Signed by the user's main wallet via EIP-712 (same as approveAgent pattern)
export async function transferUsdcBetweenAccounts(
  signer: JsonRpcSigner,
  amount: number,
  toPerp: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await syncServerTime();
    const nonce = getUniqueNonce();
    const signatureChainId = "0xa4b1"; // Arbitrum One

    const domain = {
      name: "HyperliquidSignTransaction",
      version: "1",
      chainId: parseInt(signatureChainId, 16), // 42161
      verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    };

    const types = {
      "HyperliquidTransaction:UsdClassTransfer": [
        { name: "hyperliquidChain", type: "string" },
        { name: "amount", type: "string" },
        { name: "toPerp", type: "bool" },
        { name: "nonce", type: "uint64" },
      ],
    };

    // Amount as a normalized decimal string — round to avoid floating-point artifacts like "12.640000000001"
    const amountStr = parseFloat(amount.toFixed(6)).toString();

    const message = {
      hyperliquidChain: "Mainnet",
      amount: amountStr,
      toPerp,
      nonce,
    };

    console.log("usdClassTransfer: requesting EIP-712 signature...");
    console.log("Domain:", domain);
    console.log("Message:", message);

    const signature = await signTypedDataHyperliquid(
      signer,
      domain,
      types,
      "HyperliquidTransaction:UsdClassTransfer",
      message,
    );
    console.log("usdClassTransfer: signature obtained:", signature.slice(0, 20) + "...");

    const r = signature.slice(0, 66);
    const s = "0x" + signature.slice(66, 130);
    const v = parseInt(signature.slice(130, 132), 16);

    // Action format matches approveAgent: includes signatureChainId + hyperliquidChain + nonce
    const action = {
      type: "usdClassTransfer",
      signatureChainId,
      hyperliquidChain: "Mainnet",
      amount: amountStr,
      toPerp,
      nonce,
    };

    const payload = {
      action,
      signature: { r, s, v },
      nonce,
    };

    console.log("usdClassTransfer: submitting to exchange API:", JSON.stringify(payload));

    const response = await fetch(EXCHANGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("usdClassTransfer response:", result);

    if (result.status === "ok") {
      return { success: true };
    }

    const errMsg =
      typeof result.response === "string"
        ? result.response
        : result.response?.data
        ? JSON.stringify(result.response.data)
        : result.error
        ? String(result.error)
        : JSON.stringify(result);

    return { success: false, error: errMsg };
  } catch (error: any) {
    console.error("Transfer error:", error);
    return { success: false, error: error.message || "Transfer failed" };
  }
}

// Withdraw USDC from Hyperliquid perp account to an Arbitrum wallet address
// Uses Hyperliquid's withdraw3 action, signed via EIP-712 with the user's primary wallet
export async function withdrawUsdcToWallet(
  signer: JsonRpcSigner,
  amount: number,
  destination: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await syncServerTime();
    const nonce = getUniqueNonce();
    const signatureChainId = "0xa4b1"; // Arbitrum One

    const domain = {
      name: "HyperliquidSignTransaction",
      version: "1",
      chainId: parseInt(signatureChainId, 16), // 42161
      verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    };

    const types = {
      "HyperliquidTransaction:Withdraw": [
        { name: "hyperliquidChain", type: "string" },
        { name: "destination", type: "string" },
        { name: "amount", type: "string" },
        { name: "time", type: "uint64" },
      ],
    };

    const amountStr = parseFloat(amount.toFixed(6)).toString();

    const message = {
      hyperliquidChain: "Mainnet",
      destination,
      amount: amountStr,
      time: nonce,
    };

    console.log("withdraw3: requesting EIP-712 signature...");
    const signature = await signTypedDataHyperliquid(
      signer,
      domain,
      types,
      "HyperliquidTransaction:Withdraw",
      message,
    );
    console.log("withdraw3: signature obtained:", signature.slice(0, 20) + "...");

    const r = signature.slice(0, 66);
    const s = "0x" + signature.slice(66, 130);
    const v = parseInt(signature.slice(130, 132), 16);

    const action = {
      type: "withdraw3",
      hyperliquidChain: "Mainnet",
      signatureChainId,
      destination,
      amount: amountStr,
      time: nonce,
    };

    const payload = {
      action,
      signature: { r, s, v },
      nonce,
    };

    console.log("withdraw3: submitting to exchange API:", JSON.stringify(payload));

    const response = await fetch(EXCHANGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("withdraw3 response:", result);

    if (result.status === "ok") {
      return { success: true };
    }

    const errMsg =
      typeof result.response === "string"
        ? result.response
        : result.response?.data
        ? JSON.stringify(result.response.data)
        : result.error
        ? String(result.error)
        : JSON.stringify(result);

    return { success: false, error: errMsg };
  } catch (error: any) {
    console.error("Withdrawal error:", error);
    return { success: false, error: error.message || "Withdrawal failed" };
  }
}

// ── Deposit: Arbitrum USDC → Hyperliquid bridge ──────────────────────────────
const USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
/** Hyperliquid bridge on Arbitrum One — normalized so ethers v6 accepts it in Contract.transfer. */
export const HL_BRIDGE_ARBITRUM = getAddress("0x2df1c51e09a4ab13229630fc358d49776d67093e");
const USDC_DECIMALS = 6;

const USDC_MINIMAL_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

/** Read the user's native USDC balance on Arbitrum One (in USDC, not wei). */
export async function getArbitrumUsdcBalance(address: string): Promise<number> {
  try {
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider("https://arb1.arbitrum.io/rpc");
    const contract = new Contract(USDC_ARBITRUM, USDC_MINIMAL_ABI, provider);
    const raw: bigint = await contract.balanceOf(address);
    return Number(raw) / 10 ** USDC_DECIMALS;
  } catch (error) {
    console.error("[Deposit] Error reading Arbitrum USDC balance:", error);
    return 0;
  }
}

/**
 * Deposit USDC from Arbitrum into the user's Hyperliquid account.
 * Sends native USDC directly to the Hyperliquid bridge contract on Arbitrum One.
 * The signer must already be connected to Arbitrum (chainId 42161).
 */
export async function depositUsdcToHyperliquid(
  signer: JsonRpcSigner,
  amount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const { Contract, parseUnits } = await import("ethers");
    const amountWei = parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
    const contract = new Contract(USDC_ARBITRUM, USDC_MINIMAL_ABI, signer);

    console.log(`[Deposit] Sending ${amount} USDC to HL bridge ${HL_BRIDGE_ARBITRUM}`);
    const tx = await contract.transfer(HL_BRIDGE_ARBITRUM, amountWei);
    console.log("[Deposit] Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("[Deposit] Confirmed in block:", receipt.blockNumber);

    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    console.error("[Deposit] Error:", error);
    const msg: string = error?.reason || error?.message || "Deposit failed";
    return { success: false, error: msg };
  }
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

// ── @nktkas/hyperliquid ExchangeClient — modify / batchModify (agent key, non-custodial) ──

const TPSL_MODIFY_SLIPPAGE = 0.05;

export interface TpslModifyOrderSpec {
  coin: string;
  orderId: number;
  /** New trigger price for the TP/SL order. */
  newPrice: number;
  /** Order wire field `b` (reduce-only TP/SL matches placeTriggerOrder: !isLong). */
  isBuy: boolean;
  size: number;
  tpsl: "tp" | "sl";
}

function buildTpslModifyOrderWire(spec: TpslModifyOrderSpec, assetIndex: number) {
  const triggerPxStr = floatToWire(spec.newPrice);
  const limitGuard = spec.isBuy
    ? spec.newPrice * (1 + TPSL_MODIFY_SLIPPAGE)
    : spec.newPrice * (1 - TPSL_MODIFY_SLIPPAGE);
  const pStr = floatToWire(limitGuard);
  return {
    a: assetIndex,
    b: spec.isBuy,
    p: pStr,
    s: floatToWire(spec.size),
    r: true,
    t: {
      trigger: {
        isMarket: true,
        triggerPx: triggerPxStr,
        tpsl: spec.tpsl,
      },
    },
  };
}

function isApiRequestError(e: unknown): e is InstanceType<typeof ApiRequestError> {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "ApiRequestError";
}

/**
 * L1 `modify` via SDK: updates an existing TP/SL trigger order to a new trigger price.
 * Signs with the stored API agent key (approveAgent); `userWalletAddress` selects that agent.
 */
export async function syncOrderToExchange(
  userWalletAddress: string,
  spec: TpslModifyOrderSpec,
): Promise<{ ok: boolean; error?: string }> {
  const agent = getStoredAgent(userWalletAddress);
  if (!agent) {
    return { ok: false, error: "Hyperliquid trading session not ready. Approve the trading key first." };
  }

  const assetIndex = await getAssetIndex(spec.coin);
  if (assetIndex === null) {
    return { ok: false, error: `Unknown asset: ${spec.coin}` };
  }

  const order = buildTpslModifyOrderWire(spec, assetIndex);

  try {
    const transport = new HttpTransport({ isTestnet: false });
    const wallet = new Wallet(agent.privateKey);
    const client = new ExchangeClient({ transport, wallet });
    const data = await client.modify({ oid: spec.orderId, order });
    const st = data && typeof data === "object" && "status" in data ? (data as { status: string }).status : "";
    if (st === "ok") return { ok: true };
    return { ok: false, error: "Exchange did not return status ok." };
  } catch (e: unknown) {
    if (isApiRequestError(e)) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Single L1 transaction: `batchModify` multiple TP/SL updates (same coin).
 */
export async function batchSyncOrdersToExchange(
  userWalletAddress: string,
  specs: TpslModifyOrderSpec[],
): Promise<{ ok: boolean; error?: string }> {
  if (specs.length === 0) return { ok: true };
  if (specs.length === 1) {
    return syncOrderToExchange(userWalletAddress, specs[0]);
  }

  const agent = getStoredAgent(userWalletAddress);
  if (!agent) {
    return { ok: false, error: "Hyperliquid trading session not ready. Approve the trading key first." };
  }

  const coin0 = specs[0].coin;
  if (!specs.every((s) => s.coin === coin0)) {
    return { ok: false, error: "batchModify requires all orders on the same coin." };
  }

  const assetIndex = await getAssetIndex(coin0);
  if (assetIndex === null) {
    return { ok: false, error: `Unknown asset: ${coin0}` };
  }

  const modifies = specs.map((spec) => ({
    oid: spec.orderId,
    order: buildTpslModifyOrderWire(spec, assetIndex),
  }));

  try {
    const transport = new HttpTransport({ isTestnet: false });
    const wallet = new Wallet(agent.privateKey);
    const client = new ExchangeClient({ transport, wallet });
    const data = await client.batchModify({ modifies });
    const st = data && typeof data === "object" && "status" in data ? (data as { status: string }).status : "";
    if (st === "ok") return { ok: true };
    return { ok: false, error: "Exchange did not return status ok." };
  } catch (e: unknown) {
    if (isApiRequestError(e)) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
