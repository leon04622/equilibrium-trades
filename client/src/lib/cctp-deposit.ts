import type { JsonRpcSigner } from "ethers";
import { getAddress } from "ethers";
import { signTypedDataHyperliquid } from "@/lib/eip712-typed-data";

const USDC_DECIMALS = 6;

/** @see https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore */
const CCTP_EXTENSION_ABI = [
  {
    name: "batchDepositForBurnWithAuth",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_receiveWithAuthorizationData",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "authValidAfter", type: "uint256" },
          { name: "authValidBefore", type: "uint256" },
          { name: "authNonce", type: "bytes32" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
      {
        name: "_depositForBurnData",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "destinationDomain", type: "uint32" },
          { name: "mintRecipient", type: "bytes32" },
          { name: "destinationCaller", type: "bytes32" },
          { name: "maxFee", type: "uint256" },
          { name: "minFinalityThreshold", type: "uint32" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const USDC_MINIMAL_ABI = ["function balanceOf(address owner) view returns (uint256)"];

export type CctpDepositConfig = {
  cctpExtension: string;
  usdc: string;
  chainId: number;
  cctpForwarder: string;
  destinationDomain: number;
  sourceDomain: number;
  minDepositUsdc: number;
  minFinalityThreshold: number;
  usdcEip712: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
};

/** @deprecated Use {@link CctpDepositConfig} — alias for existing imports. */
export type HyperliquidDepositConfig = CctpDepositConfig;

export type CctpDepositProgressStage =
  | "quoting_fees"
  | "sign_receive_auth"
  | "submit_burn"
  | "await_confirm";

/** Portfolio modal maps these labels to user-facing copy. */
export type HyperliquidDepositProgressStage =
  | "quoting_fees"
  | "sign_receive_auth"
  | "submit_burn"
  | "await_confirm";

let depositConfigCache: { config: CctpDepositConfig; at: number } | null = null;
const DEPOSIT_CONFIG_TTL_MS = 10 * 60 * 1000;

function parseCctpConfig(data: unknown): CctpDepositConfig {
  if (!data || typeof data !== "object") throw new Error("Invalid CCTP config");
  const o = data as Record<string, unknown>;
  const permit = o.usdcEip712;
  if (
    typeof o.cctpExtension !== "string" ||
    typeof o.usdc !== "string" ||
    typeof o.cctpForwarder !== "string"
  ) {
    throw new Error("Invalid CCTP config: addresses");
  }
  if (
    typeof o.chainId !== "number" ||
    typeof o.destinationDomain !== "number" ||
    typeof o.sourceDomain !== "number" ||
    typeof o.minDepositUsdc !== "number" ||
    typeof o.minFinalityThreshold !== "number"
  ) {
    throw new Error("Invalid CCTP config: numeric fields");
  }
  if (!permit || typeof permit !== "object") throw new Error("Invalid CCTP config: usdcEip712");
  const p = permit as Record<string, unknown>;
  if (
    typeof p.name !== "string" ||
    typeof p.version !== "string" ||
    typeof p.chainId !== "number" ||
    typeof p.verifyingContract !== "string"
  ) {
    throw new Error("Invalid CCTP config: EIP-712 fields");
  }
  return {
    cctpExtension: getAddress(o.cctpExtension),
    usdc: getAddress(o.usdc),
    chainId: o.chainId,
    cctpForwarder: getAddress(o.cctpForwarder),
    destinationDomain: o.destinationDomain,
    sourceDomain: o.sourceDomain,
    minDepositUsdc: o.minDepositUsdc,
    minFinalityThreshold: o.minFinalityThreshold,
    usdcEip712: {
      name: p.name,
      version: p.version,
      chainId: p.chainId,
      verifyingContract: getAddress(p.verifyingContract),
    },
  };
}

export async function fetchCctpDepositConfig(forceRefresh = false): Promise<CctpDepositConfig> {
  if (
    !forceRefresh &&
    depositConfigCache &&
    Date.now() - depositConfigCache.at < DEPOSIT_CONFIG_TTL_MS
  ) {
    return depositConfigCache.config;
  }
  const res = await fetch("/api/cctp/deposit-config", { credentials: "include" });
  const text = await res.text();
  if (!res.ok) {
    let msg = text || res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string") msg = j.error;
    } catch {
      /* keep */
    }
    throw new Error(msg);
  }
  const config = parseCctpConfig(JSON.parse(text));
  depositConfigCache = { config, at: Date.now() };
  return config;
}

/** @deprecated Use {@link fetchCctpDepositConfig}. */
export const fetchHyperliquidDepositConfig = fetchCctpDepositConfig;

function utf8ToHex(s: string): string {
  return Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hook data for HyperCore forwarder (perps = 0, spot = 0xffffffff). */
export function encodeCctpForwardHookData(
  hyperCoreMintRecipient: string,
  hyperCoreDestinationDex: number = 0,
): `0x${string}` {
  const a = getAddress(hyperCoreMintRecipient);
  const magicHex = utf8ToHex("cctp-forward").padEnd(48, "0");
  const version = "00000000";
  const dataLength = "00000018";
  const address = a.slice(2).toLowerCase();
  const dex = (hyperCoreDestinationDex >>> 0).toString(16).padStart(8, "0");
  return `0x${magicHex}${version}${dataLength}${address}${dex}` as `0x${string}`;
}

function addressToBytes32(addr: string): `0x${string}` {
  const a = getAddress(addr).slice(2).toLowerCase();
  return `0x${a.padStart(64, "0")}` as `0x${string}`;
}

function randomNonceBytes32(): `0x${string}` {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return `0x${[...arr].map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

async function postBridgeProgress(
  wallet: string,
  payload: {
    stage: string;
    txHash?: string | null;
    amountUsdc?: number | null;
    forwardFeeMax?: number | null;
    error?: string | null;
  },
): Promise<void> {
  try {
    await fetch("/api/user/cctp-bridge-progress", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-wallet-address": wallet,
        Authorization: `Bearer ${wallet}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[CCTP] persist bridge progress failed:", e);
  }
}

export async function getArbitrumUsdcBalance(address: string, usdcToken: string): Promise<number> {
  try {
    const { JsonRpcProvider, Contract } = await import("ethers");
    const token = getAddress(usdcToken);
    const provider = new JsonRpcProvider("https://arb1.arbitrum.io/rpc");
    const contract = new Contract(token, USDC_MINIMAL_ABI, provider);
    const raw: bigint = await contract.balanceOf(address);
    return Number(raw) / 10 ** USDC_DECIMALS;
  } catch (error) {
    console.error("[CCTP] USDC balance read error:", error);
    return 0;
  }
}

/**
 * Deposit native USDC on Arbitrum to **HyperCore** via Circle CCTP (burn on Arbitrum → mint on HyperEVM → forward).
 * Contract addresses come only from the server — nothing hardcoded in the client bundle.
 */
export async function depositUsdcToHyperliquid(
  signer: JsonRpcSigner,
  amount: number,
  options?: {
    depositConfig?: CctpDepositConfig;
    /** Receives USDC on HyperCore (typically the connected wallet). */
    hyperCoreRecipient?: string;
    /** 0 = perp margin, 4294967295 = spot per Circle docs. */
    hyperCoreDestinationDex?: number;
    onProgress?: (stage: CctpDepositProgressStage) => void;
  },
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const wallet = (await signer.getAddress()).toLowerCase();
  let cfg: CctpDepositConfig;
  try {
    cfg = options?.depositConfig ?? (await fetchCctpDepositConfig());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not load CCTP configuration from the server.";
    await postBridgeProgress(wallet, { stage: "failed_config", error: msg });
    return { success: false, error: msg };
  }

  if (!Number.isFinite(amount) || amount < cfg.minDepositUsdc) {
    return {
      success: false,
      error: `Minimum deposit is ${cfg.minDepositUsdc} USDC.`,
    };
  }

  const recipientRaw = options?.hyperCoreRecipient ?? wallet;
  let recipient: string;
  try {
    recipient = getAddress(recipientRaw);
  } catch {
    return { success: false, error: "Invalid HyperCore recipient address." };
  }

  let maxFee: bigint;
  let minFinality: number;
  try {
    const feesRes = await fetch("/api/cctp/fees", { credentials: "include" });
    const feesText = await feesRes.text();
    if (!feesRes.ok) {
      let msg = feesText || feesRes.statusText;
      try {
        const j = JSON.parse(feesText) as { error?: string };
        if (typeof j.error === "string") msg = j.error;
      } catch {
        /* keep */
      }
      throw new Error(msg);
    }
    const feesJson = JSON.parse(feesText) as {
      maxFee?: string;
      minFinalityThreshold?: number;
    };
    if (!feesJson.maxFee || !/^\d+$/.test(feesJson.maxFee)) {
      throw new Error("Invalid fee quote");
    }
    maxFee = BigInt(feesJson.maxFee);
    minFinality = feesJson.minFinalityThreshold ?? cfg.minFinalityThreshold;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not load CCTP fees.";
    await postBridgeProgress(wallet, { stage: "failed_fees", amountUsdc: amount, error: msg });
    return { success: false, error: msg };
  }

  await postBridgeProgress(wallet, {
    stage: "quoting_fees",
    amountUsdc: amount,
    forwardFeeMax: Number(maxFee) / 1e6,
  });
  options?.onProgress?.("quoting_fees");

  try {
    const { Contract, parseUnits, Signature } = await import("ethers");
    const amountWei = parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
    const amountBn = BigInt(amountWei.toString());
    if (amountBn <= maxFee) {
      const msg = `Deposit must exceed the Circle HyperCore forward fee (~${(Number(maxFee) / 1e6).toFixed(2)} USDC).`;
      await postBridgeProgress(wallet, { stage: "failed_amount", amountUsdc: amount, error: msg });
      return { success: false, error: msg };
    }

    const provider = signer.provider;
    if (!provider) {
      return { success: false, error: "Wallet provider unavailable." };
    }

    const validAfter = Math.floor(Date.now() / 1000) - 3600;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;
    const nonce = randomNonceBytes32();

    const domain = {
      name: cfg.usdcEip712.name,
      version: cfg.usdcEip712.version,
      chainId: cfg.usdcEip712.chainId,
      verifyingContract: cfg.usdcEip712.verifyingContract,
    };
    const types = {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
    const message = {
      from: wallet,
      to: cfg.cctpExtension,
      value: amountBn,
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    };

    await postBridgeProgress(wallet, { stage: "sign_receive_auth", amountUsdc: amount });
    options?.onProgress?.("sign_receive_auth");

    const sigHex = await signTypedDataHyperliquid(
      signer,
      domain,
      types,
      "ReceiveWithAuthorization",
      message,
    );
    const split = Signature.from(sigHex);
    const v = split.v;
    const r = split.r as `0x${string}`;
    const s = split.s as `0x${string}`;

    const hookData = encodeCctpForwardHookData(
      recipient,
      options?.hyperCoreDestinationDex ?? 0,
    );
    const mintRecipient = addressToBytes32(cfg.cctpForwarder);
    const destinationCaller = mintRecipient;

    await postBridgeProgress(wallet, { stage: "submit_burn", amountUsdc: amount });
    options?.onProgress?.("submit_burn");

    const ext = new Contract(cfg.cctpExtension, CCTP_EXTENSION_ABI, signer);
    const tx = await ext.batchDepositForBurnWithAuth(
      {
        amount: amountBn,
        authValidAfter: validAfter,
        authValidBefore: validBefore,
        authNonce: nonce,
        v,
        r,
        s,
      },
      {
        amount: amountBn,
        destinationDomain: cfg.destinationDomain,
        mintRecipient,
        destinationCaller,
        maxFee,
        minFinalityThreshold: minFinality,
        hookData,
      },
    );

    await postBridgeProgress(wallet, { stage: "await_confirm", amountUsdc: amount, txHash: tx.hash });
    options?.onProgress?.("await_confirm");

    const receipt = await tx.wait();
    await postBridgeProgress(wallet, {
      stage: "completed",
      amountUsdc: amount,
      txHash: receipt?.hash ?? tx.hash,
      error: null,
    });
    return { success: true, txHash: receipt?.hash ?? tx.hash };
  } catch (error: unknown) {
    const msg =
      error && typeof error === "object" && "reason" in error
        ? String((error as { reason?: string }).reason)
        : error instanceof Error
          ? error.message
          : "CCTP deposit failed";
    console.error("[CCTP] deposit error:", error);
    await postBridgeProgress(wallet, { stage: "failed", amountUsdc: amount, error: msg });
    return { success: false, error: msg };
  }
}
