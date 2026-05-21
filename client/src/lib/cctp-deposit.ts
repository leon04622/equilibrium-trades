import type { JsonRpcSigner } from "ethers";
import { getAddress, getBytes, hexlify, keccak256, Interface, Signature, randomBytes } from "ethers";
import type { CctpBridgeProgressSync } from "@/context/AuthContext";
import { encodeCctpForwardHookData } from "./cctp-forwarder-hook";

export { encodeCctpForwardHookData } from "./cctp-forwarder-hook";

const USDC_DECIMALS = 6;

const CCTP_EXTENSION_ABI = [
  "function batchDepositForBurnWithAuth((uint256 amount,uint256 authValidAfter,uint256 authValidBefore,bytes32 authNonce,uint8 v,bytes32 r,bytes32 s),(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData)) external",
];

const TOKEN_MESSENGER_ABI = [
  "function depositForBurnWithHook(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData) external",
];

const MESSAGE_TRANSMITTER_ABI = [
  "event MessageSent(bytes message)",
  "function receiveMessage(bytes message, bytes attestation) external returns (bool)",
];

export type CctpDepositConfig = {
  cctpExtension: string;
  tokenMessenger: string;
  messageTransmitterArbitrum: string;
  usdc: string;
  usdcEip712Name: string;
  usdcEip712Version: string;
  cctpForwarder: string;
  messageTransmitterHyperEvm: string;
  chainId: number;
  hyperevmChainId: number;
  destinationDomain: number;
  sourceDomain: number;
  minDepositUsdc: number;
  minFinalityThreshold: number;
  verifiedHyperliquidBridge2Arbitrum: string;
};

export type HyperliquidDepositConfig = CctpDepositConfig;

export type CctpDepositStep =
  | "idle"
  | "approve"
  | "burn"
  | "attestation"
  | "mint"
  | "done"
  | "error";

export type HyperliquidDepositProgressStage = CctpDepositStep;
export type CctpDepositProgressStage = CctpDepositStep;

let depositConfigCache: { config: CctpDepositConfig; at: number } | null = null;
const DEPOSIT_CONFIG_TTL_MS = 10 * 60 * 1000;
const DEPOSIT_CONFIG_FETCH_MS = 12_000;
const ATTEST_POLL_MS = 2000;
const ATTEST_MAX_MS = 20 * 60 * 1000;
const ATTEST_MAX_CONSECUTIVE_ERRORS = 8;

export type CctpAttestationPollProgress = {
  elapsedSec: number;
  irisStatus: string;
};

/** Circle mainnet defaults — matches server `deposit-service.ts` so UI works if `/api/cctp/deposit-config` is slow or down. */
export const CLIENT_CCTP_DEPOSIT_DEFAULTS: CctpDepositConfig = {
  cctpExtension: "0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE",
  tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  messageTransmitterArbitrum: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  usdcEip712Name: "USD Coin",
  usdcEip712Version: "2",
  cctpForwarder: "0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757",
  messageTransmitterHyperEvm: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  chainId: 42161,
  hyperevmChainId: 999,
  destinationDomain: 19,
  sourceDomain: 3,
  minDepositUsdc: 5,
  minFinalityThreshold: 1000,
  verifiedHyperliquidBridge2Arbitrum: "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7",
};

function parseCctpConfig(data: unknown): CctpDepositConfig {
  if (!data || typeof data !== "object") throw new Error("Invalid CCTP config");
  const o = data as Record<string, unknown>;
  const need = [
    "cctpExtension",
    "tokenMessenger",
    "messageTransmitterArbitrum",
    "usdc",
    "usdcEip712Name",
    "usdcEip712Version",
    "cctpForwarder",
    "messageTransmitterHyperEvm",
  ] as const;
  for (const k of need) {
    if (typeof o[k] !== "string") throw new Error(`Invalid CCTP config: ${k}`);
  }
  if (
    typeof o.chainId !== "number" ||
    typeof o.hyperevmChainId !== "number" ||
    typeof o.destinationDomain !== "number" ||
    typeof o.sourceDomain !== "number" ||
    typeof o.minDepositUsdc !== "number" ||
    typeof o.minFinalityThreshold !== "number"
  ) {
    throw new Error("Invalid CCTP config: numeric fields");
  }
  if (typeof o.verifiedHyperliquidBridge2Arbitrum !== "string") {
    throw new Error("Invalid CCTP config: verified bridge");
  }
  return {
    cctpExtension: getAddress(o.cctpExtension as string),
    tokenMessenger: getAddress(o.tokenMessenger as string),
    messageTransmitterArbitrum: getAddress(o.messageTransmitterArbitrum as string),
    usdc: getAddress(o.usdc as string),
    usdcEip712Name: String(o.usdcEip712Name),
    usdcEip712Version: String(o.usdcEip712Version),
    cctpForwarder: getAddress(o.cctpForwarder as string),
    messageTransmitterHyperEvm: getAddress(o.messageTransmitterHyperEvm as string),
    chainId: o.chainId,
    hyperevmChainId: o.hyperevmChainId,
    destinationDomain: o.destinationDomain,
    sourceDomain: o.sourceDomain,
    minDepositUsdc: o.minDepositUsdc,
    minFinalityThreshold: o.minFinalityThreshold,
    verifiedHyperliquidBridge2Arbitrum: getAddress(o.verifiedHyperliquidBridge2Arbitrum as string),
  };
}

export async function fetchCctpDepositConfig(
  forceRefresh = false,
  options?: { allowFallback?: boolean },
): Promise<CctpDepositConfig> {
  const allowFallback = options?.allowFallback !== false;
  if (
    !forceRefresh &&
    depositConfigCache &&
    Date.now() - depositConfigCache.at < DEPOSIT_CONFIG_TTL_MS
  ) {
    return depositConfigCache.config;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEPOSIT_CONFIG_FETCH_MS);
  try {
    const res = await fetch("/api/cctp/deposit-config", {
      credentials: "include",
      signal: ctrl.signal,
    });
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
  } catch (e) {
    if (allowFallback) {
      console.warn("[CCTP] deposit-config fetch failed, using client defaults:", e);
      depositConfigCache = { config: CLIENT_CCTP_DEPOSIT_DEFAULTS, at: Date.now() };
      return CLIENT_CCTP_DEPOSIT_DEFAULTS;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchHyperliquidDepositConfig = fetchCctpDepositConfig;

function addressToBytes32(addr: string): `0x${string}` {
  const a = getAddress(addr).slice(2).toLowerCase();
  return `0x${a.padStart(64, "0")}` as `0x${string}`;
}

function randomBytes32(): `0x${string}` {
  return hexlify(randomBytes(32)) as `0x${string}`;
}

async function postBridgeProgress(
  wallet: string,
  payload: Record<string, string | number | null | undefined>,
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
      body: JSON.stringify({ stage: payload.stage, ...payload }),
    });
  } catch (e) {
    console.warn("[CCTP] persist bridge progress failed:", e);
  }
}

export async function getArbitrumUsdcBalance(address: string, usdcToken: string): Promise<number> {
  try {
    const { getArbitrumNativeUsdcBalance } = await import("./arbitrum-usdc");
    const token = getAddress(usdcToken);
    const native = getAddress(CLIENT_CCTP_DEPOSIT_DEFAULTS.usdc);
    if (token === native) {
      return await getArbitrumNativeUsdcBalance(address);
    }
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider("https://arb1.arbitrum.io/rpc");
    const contract = new Contract(token, ["function balanceOf(address) view returns (uint256)"], provider);
    const raw: bigint = await contract.balanceOf(address);
    return Number(raw) / 10 ** USDC_DECIMALS;
  } catch (error) {
    console.error("[CCTP] USDC balance read error:", error);
    return 0;
  }
}

/** Shorter errors for wallet revert blobs (e.g. estimateGas "not attester"). */
export function humanizeCctpDepositError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("not attester") || m.includes("invalid signature")) {
    return (
      "Mint step rejected the saved Circle proof (often stale or already used). " +
      "Your Arbitrum burn may already have succeeded — check trading balance, wait 2 minutes, tap Resume once, " +
      "or clear the stuck deposit from Funding and start fresh if balance did not change."
    );
  }
  if (m.includes("nonce") && (m.includes("used") || m.includes("already"))) {
    return (
      "This deposit was already minted on HyperEVM. Refresh your trading balance — no second confirmation needed."
    );
  }
  if (m.includes("user rejected") || m.includes("user denied")) {
    return "Transaction cancelled in your wallet.";
  }
  if (raw.length > 280) {
    return `${raw.slice(0, 200)}…`;
  }
  return raw;
}

async function fetchAttestationOnce(
  messageHash: string,
  burnTxHash?: string | null,
): Promise<string | null> {
  const qs = burnTxHash ? `?txHash=${encodeURIComponent(burnTxHash)}` : "";
  try {
    const r = await fetch(`/api/cctp/attestation/${encodeURIComponent(messageHash)}${qs}`, {
      credentials: "include",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { status?: string; attestation?: string | null };
    if (j.status === "complete" && j.attestation && j.attestation.startsWith("0x")) {
      return j.attestation;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isLikelyMintReplayError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    (m.includes("nonce") && (m.includes("used") || m.includes("already"))) ||
    m.includes("already received") ||
    m.includes("message already")
  );
}

function formatAttestationWaitMessage(
  messageHash: string,
  progress: CctpAttestationPollProgress,
): string {
  const short = `${messageHash.slice(0, 10)}…`;
  const status =
    progress.irisStatus === "pending_confirmations"
      ? "confirming on Arbitrum"
      : progress.irisStatus === "not_found"
        ? "waiting for Circle to index burn"
        : progress.irisStatus;
  return `Waiting for Circle attestation (${progress.elapsedSec}s) — ${status} — ${short}`;
}

async function pollAttestationViaServer(
  messageHash: string,
  options?: {
    burnTxHash?: string | null;
    onProgress?: (progress: CctpAttestationPollProgress) => void;
    signal?: AbortSignal;
  },
): Promise<string> {
  const started = Date.now();
  let consecutiveErrors = 0;
  const deadline = Date.now() + ATTEST_MAX_MS;

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) {
      throw new Error(
        "Deposit paused. Your burn is safe — close this dialog and tap Add to trading again to resume the mint step.",
      );
    }

    const elapsedSec = Math.floor((Date.now() - started) / 1000);
    const qs = options?.burnTxHash
      ? `?txHash=${encodeURIComponent(options.burnTxHash)}`
      : "";

    try {
      const r = await fetch(`/api/cctp/attestation/${encodeURIComponent(messageHash)}${qs}`, {
        credentials: "include",
        signal: options?.signal,
      });
      const text = await r.text();
      if (!r.ok) {
        consecutiveErrors += 1;
        let errMsg = text || `Attestation check failed (${r.status})`;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (typeof j.error === "string") errMsg = j.error;
        } catch {
          /* keep */
        }
        options?.onProgress?.({ elapsedSec, irisStatus: `error: ${errMsg.slice(0, 40)}` });
        if (consecutiveErrors >= ATTEST_MAX_CONSECUTIVE_ERRORS) {
          throw new Error(
            `${errMsg} — your burn is still safe. Wait 2–5 minutes, then open Funding and deposit again to resume.`,
          );
        }
        await new Promise((r2) => setTimeout(r2, ATTEST_POLL_MS));
        continue;
      }

      consecutiveErrors = 0;
      const j = JSON.parse(text) as { status?: string; attestation?: string | null; error?: string };
      const irisStatus = j.status || "unknown";
      options?.onProgress?.({ elapsedSec, irisStatus });

      if (j.status === "complete" && j.attestation && j.attestation.startsWith("0x")) {
        return j.attestation;
      }
    } catch (e: unknown) {
      if (options?.signal?.aborted) {
        throw new Error(
          "Deposit paused. Your burn is safe — resume from Funding when Circle attestation is ready.",
        );
      }
      consecutiveErrors += 1;
      const errMsg = e instanceof Error ? e.message : String(e);
      options?.onProgress?.({ elapsedSec, irisStatus: `retry (${errMsg.slice(0, 32)})` });
      if (consecutiveErrors >= ATTEST_MAX_CONSECUTIVE_ERRORS) {
        throw e instanceof Error
          ? e
          : new Error("Could not reach Circle attestation service. Try again in a few minutes.");
      }
    }

    await new Promise((r2) => setTimeout(r2, ATTEST_POLL_MS));
  }

  throw new Error(
    "Circle attestation is taking longer than usual (20+ min). Your burn is safe — open Funding, wait a few minutes, then tap Add to trading again to finish the mint.",
  );
}

function extractMessageFromBurnReceipt(
  receipt: { logs: ReadonlyArray<{ address: string; topics: ReadonlyArray<string>; data: string }> },
  messageTransmitterArbitrum: string,
): `0x${string}` {
  const iface = new Interface(MESSAGE_TRANSMITTER_ABI);
  const want = messageTransmitterArbitrum.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== want) continue;
    try {
      const parsed = iface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed?.name === "MessageSent") {
        return hexlify(parsed.args.message) as `0x${string}`;
      }
    } catch {
      /* next log */
    }
  }
  throw new Error("Could not find MessageSent in burn receipt — save your burn tx hash and contact support.");
}

async function ensureHyperEvmInWallet(ethereum: { request: (a: unknown) => Promise<unknown> }, chainId: number) {
  const idHex = "0x" + chainId.toString(16);
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: idHex }],
    });
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: idHex,
            chainName: "HyperEVM",
            nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
            rpcUrls: ["https://rpc.hyperliquid.xyz/evm"],
            blockExplorerUrls: ["https://hyperscan.com"],
          },
        ],
      });
      return;
    }
    throw e;
  }
}

/**
 * Circle CCTP (professional): EIP-3009 `ReceiveWithAuthorization` → `CctpExtension.batchDepositForBurnWithAuth`
 * on Arbitrum → Iris attestation → `receiveMessage` on HyperEVM MessageTransmitter.
 * HyperCore credit follows the forwarder hook.
 */
export async function depositUsdcToHyperliquid(
  signer: JsonRpcSigner,
  amount: number,
  options?: {
    depositConfig?: CctpDepositConfig;
    hyperCoreRecipient?: string;
    hyperCoreDestinationDex?: number;
    resumeFrom?: CctpBridgeProgressSync | null;
    onStep?: (step: CctpDepositStep, detail?: string) => void;
    /** Fires once Circle Iris returns a complete attestation (before HyperEVM mint). */
    onAttestationConfirmed?: () => void;
    onAttestationProgress?: (progress: CctpAttestationPollProgress) => void;
    signal?: AbortSignal;
  },
): Promise<{ success: boolean; txHash?: string; error?: string; messageHash?: string }> {
  const wallet = (await signer.getAddress()).toLowerCase();
  const resume = options?.resumeFrom;
  const hasResumeState = Boolean(resume?.cctpMessageHex && resume?.messageHash);
  let cfg: CctpDepositConfig;
  try {
    cfg = options?.depositConfig ?? (await fetchCctpDepositConfig());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not load CCTP configuration.";
    await postBridgeProgress(wallet, { stage: "error_config", error: msg });
    return { success: false, error: msg };
  }

  if (!hasResumeState && (!Number.isFinite(amount) || amount < cfg.minDepositUsdc)) {
    return { success: false, error: `Minimum deposit is ${cfg.minDepositUsdc} USDC.` };
  }

  let recipient: string;
  try {
    recipient = getAddress(options?.hyperCoreRecipient ?? wallet);
  } catch {
    return { success: false, error: "Invalid HyperCore recipient address." };
  }

  let messageHex: string | null = resume?.cctpMessageHex ?? null;
  let messageHash: string | null = resume?.messageHash ?? null;
  let attestationHex: string | null = resume?.attestationHex ?? null;

  const onStep = options?.onStep ?? (() => {});
  const onAttestationConfirmed = options?.onAttestationConfirmed;
  const amtForLog = resume?.amountUsdc ?? amount;

  async function executeMintOnHyperEvm(
    burnTxHash: string | null,
    msgHex: string,
    msgHash: string,
    attestHex: string,
  ): Promise<{ mintTxHash: string; messageHash: string }> {
    onStep("mint", "Switch to HyperEVM (999) and confirm mint in your wallet");
    await postBridgeProgress(wallet, {
      stage: "mint",
      burnTxHash,
      txHash: burnTxHash,
      messageHash: msgHash,
      cctpMessageHex: msgHex,
      attestationHex: attestHex,
      amountUsdc: amtForLog,
    });
    const eth = (globalThis as unknown as { ethereum?: { request: (x: unknown) => Promise<unknown> } }).ethereum;
    if (!eth?.request) throw new Error("Wallet cannot switch networks — add HyperEVM (chain 999), then tap Resume.");
    await ensureHyperEvmInWallet(eth, cfg.hyperevmChainId);
    const { BrowserProvider, Contract: C } = await import("ethers");
    const hp = new BrowserProvider(eth);
    const hSigner = await hp.getSigner();
    const mt = new C(cfg.messageTransmitterHyperEvm, MESSAGE_TRANSMITTER_ABI, hSigner);

    let attestationToUse = attestHex;
    const freshAttestation = await fetchAttestationOnce(msgHash, burnTxHash);
    if (freshAttestation && freshAttestation.toLowerCase() !== attestationToUse.toLowerCase()) {
      attestationToUse = freshAttestation;
      await postBridgeProgress(wallet, {
        stage: "attestation_complete",
        burnTxHash,
        messageHash: msgHash,
        cctpMessageHex: msgHex,
        attestationHex: attestationToUse,
        amountUsdc: amtForLog,
      });
    }

    try {
      await mt.receiveMessage.staticCall(msgHex, attestationToUse);
    } catch (simErr: unknown) {
      const simMsg =
        simErr instanceof Error
          ? simErr.message
          : typeof simErr === "string"
            ? simErr
            : "Mint simulation failed";
      if (isLikelyMintReplayError(simMsg)) {
        await postBridgeProgress(wallet, {
          stage: "done",
          burnTxHash,
          txHash: burnTxHash,
          messageHash: msgHash,
          cctpMessageHex: msgHex,
          attestationHex: attestationToUse,
          amountUsdc: amtForLog,
        });
        onStep("done");
        return { mintTxHash: burnTxHash ?? "", messageHash: msgHash };
      }
      throw new Error(humanizeCctpDepositError(simMsg));
    }

    const mintTx = await mt.receiveMessage(msgHex, attestationToUse);
    const mintReceipt = await mintTx.wait();
    await postBridgeProgress(wallet, {
      stage: "done",
      burnTxHash,
      txHash: burnTxHash,
      messageHash: msgHash,
      cctpMessageHex: msgHex,
      attestationHex: attestationToUse,
      amountUsdc: amtForLog,
    });
    onStep("done");
    return { mintTxHash: mintReceipt?.hash ?? mintTx.hash, messageHash: msgHash };
  }

  try {
    /* ── Resume: mint only (attestation already in Mongo) ── */
    if (messageHex && messageHash && attestationHex) {
      const out = await executeMintOnHyperEvm(
        resume?.burnTxHash ?? resume?.txHash ?? null,
        messageHex,
        messageHash,
        attestationHex,
      );
      return { success: true, txHash: out.mintTxHash, messageHash: out.messageHash };
    }

    /* ── Resume: wait for attestation, then mint ── */
    if (messageHex && messageHash && !attestationHex) {
      const mh = messageHash;
      onStep("attestation", mh);
      await postBridgeProgress(wallet, {
        stage: "attestation",
        messageHash: mh,
        cctpMessageHex: messageHex,
        amountUsdc: amtForLog,
      });
      attestationHex = await pollAttestationViaServer(mh, {
        burnTxHash: resume?.burnTxHash ?? resume?.txHash ?? null,
        signal: options?.signal,
        onProgress: (p) => {
          options?.onAttestationProgress?.(p);
          onStep("attestation", formatAttestationWaitMessage(mh, p));
        },
      });
      onAttestationConfirmed?.();
      await postBridgeProgress(wallet, {
        stage: "attestation_complete",
        messageHash,
        cctpMessageHex: messageHex,
        attestationHex,
        amountUsdc: amtForLog,
      });
      const out = await executeMintOnHyperEvm(
        resume?.burnTxHash ?? resume?.txHash ?? null,
        messageHex,
        messageHash,
        attestationHex,
      );
      return { success: true, txHash: out.mintTxHash, messageHash: out.messageHash };
    }

    const feesRes = await fetch("/api/cctp/fees", { credentials: "include" });
    const feesText = await feesRes.text();
    if (!feesRes.ok) {
      let msg = feesText || "Fee request failed";
      try {
        const j = JSON.parse(feesText) as { error?: string };
        if (typeof j.error === "string") msg = j.error;
      } catch {
        /* keep */
      }
      throw new Error(msg);
    }
    const feesJson = JSON.parse(feesText) as { maxFee?: string; minFinalityThreshold?: number };
    if (!feesJson.maxFee || !/^\d+$/.test(feesJson.maxFee)) throw new Error("Invalid fee quote");
    const maxFee = BigInt(feesJson.maxFee);
    const minFinality = feesJson.minFinalityThreshold ?? cfg.minFinalityThreshold;

    const { Contract, parseUnits } = await import("ethers");
    const amountWei = parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
    const amountBn = BigInt(amountWei.toString());
    if (amountBn <= maxFee) {
      throw new Error(
        `Amount must exceed forward fee (~${(Number(maxFee) / 1e6).toFixed(2)} USDC).`,
      );
    }

    if (!signer.provider) throw new Error("Wallet provider unavailable.");

    onStep("approve");
    await postBridgeProgress(wallet, {
      stage: "approve",
      amountUsdc: amount,
      forwardFeeMax: Number(maxFee) / 1e6,
    });

    const nowSec = Math.floor(Date.now() / 1000);
    const authValidAfter = BigInt(nowSec - 3600);
    const authValidBefore = BigInt(nowSec + 3600);
    const authNonce = randomBytes32();
    const extensionAddress = getAddress(cfg.cctpExtension);
    const receiveAuthSignature = await signer.signTypedData(
      {
        name: cfg.usdcEip712Name,
        version: cfg.usdcEip712Version,
        chainId: cfg.chainId,
        verifyingContract: cfg.usdc,
      },
      {
        ReceiveWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      {
        from: getAddress(wallet),
        to: extensionAddress,
        value: amountBn,
        validAfter: authValidAfter,
        validBefore: authValidBefore,
        nonce: authNonce,
      },
    );
    const parsedSig = Signature.from(receiveAuthSignature);

    onStep("burn");
    await postBridgeProgress(wallet, {
      stage: "burn",
      amountUsdc: amount,
      forwardFeeMax: Number(maxFee) / 1e6,
    });
    const hookData = encodeCctpForwardHookData(recipient, options?.hyperCoreDestinationDex ?? 0);
    const fwd32 = addressToBytes32(cfg.cctpForwarder);
    const extension = new Contract(cfg.cctpExtension, CCTP_EXTENSION_ABI, signer);
    const burnTx = await extension.batchDepositForBurnWithAuth(
      {
        amount: amountBn,
        authValidAfter,
        authValidBefore,
        authNonce,
        v: parsedSig.v,
        r: parsedSig.r,
        s: parsedSig.s,
      },
      {
        amount: amountBn,
        destinationDomain: cfg.destinationDomain,
        mintRecipient: fwd32,
        destinationCaller: fwd32,
        maxFee,
        minFinalityThreshold: minFinality,
        hookData,
      },
    );
    const receipt = await burnTx.wait();
    if (!receipt) throw new Error("Burn receipt missing");

    messageHex = extractMessageFromBurnReceipt(receipt, cfg.messageTransmitterArbitrum);
    const mh = keccak256(getBytes(messageHex));
    messageHash = mh;

    await postBridgeProgress(wallet, {
      stage: "wait_attestation",
      burnTxHash: receipt.hash,
      txHash: receipt.hash,
      messageHash: mh,
      cctpMessageHex: messageHex,
      amountUsdc: amount,
    });

    onStep("attestation", mh);
    attestationHex = await pollAttestationViaServer(mh, {
      burnTxHash: receipt.hash,
      signal: options?.signal,
      onProgress: (p) => {
        options?.onAttestationProgress?.(p);
        onStep("attestation", formatAttestationWaitMessage(mh, p));
      },
    });
    onAttestationConfirmed?.();
    await postBridgeProgress(wallet, {
      stage: "attestation_complete",
      burnTxHash: receipt.hash,
      messageHash,
      cctpMessageHex: messageHex,
      attestationHex,
      amountUsdc: amount,
    });

    const out = await executeMintOnHyperEvm(receipt.hash, messageHex, messageHash, attestationHex);
    return { success: true, txHash: out.mintTxHash, messageHash: out.messageHash };
  } catch (error: unknown) {
    const raw =
      error instanceof Error ? error.message : typeof error === "string" ? error : "CCTP deposit failed";
    const msg = humanizeCctpDepositError(raw);
    console.error("[CCTP] deposit error:", error);
    await postBridgeProgress(wallet, { stage: "error", error: msg });
    return { success: false, error: msg, messageHash: messageHash ?? undefined };
  }
}
