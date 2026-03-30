import type { JsonRpcSigner } from "ethers";
import { getAddress, getBytes, hexlify, keccak256, Interface } from "ethers";
import type { CctpBridgeProgressSync } from "@/context/AuthContext";
import { encodeCctpForwardHookData } from "./cctp-forwarder-hook";

export { encodeCctpForwardHookData } from "./cctp-forwarder-hook";

const USDC_DECIMALS = 6;

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const TOKEN_MESSENGER_ABI = [
  "function depositForBurnWithHook(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData) external",
];

const MESSAGE_TRANSMITTER_ABI = [
  "event MessageSent(bytes message)",
  "function receiveMessage(bytes message, bytes attestation) external returns (bool)",
];

export type CctpDepositConfig = {
  tokenMessenger: string;
  messageTransmitterArbitrum: string;
  usdc: string;
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
const ATTEST_POLL_MS = 3000;
const ATTEST_MAX_MS = 20 * 60 * 1000;

function parseCctpConfig(data: unknown): CctpDepositConfig {
  if (!data || typeof data !== "object") throw new Error("Invalid CCTP config");
  const o = data as Record<string, unknown>;
  const need = [
    "tokenMessenger",
    "messageTransmitterArbitrum",
    "usdc",
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
    tokenMessenger: getAddress(o.tokenMessenger as string),
    messageTransmitterArbitrum: getAddress(o.messageTransmitterArbitrum as string),
    usdc: getAddress(o.usdc as string),
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

export const fetchHyperliquidDepositConfig = fetchCctpDepositConfig;

function addressToBytes32(addr: string): `0x${string}` {
  const a = getAddress(addr).slice(2).toLowerCase();
  return `0x${a.padStart(64, "0")}` as `0x${string}`;
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
    const { JsonRpcProvider, Contract } = await import("ethers");
    const token = getAddress(usdcToken);
    const provider = new JsonRpcProvider("https://arb1.arbitrum.io/rpc");
    const contract = new Contract(token, ["function balanceOf(address) view returns (uint256)"], provider);
    const raw: bigint = await contract.balanceOf(address);
    return Number(raw) / 10 ** USDC_DECIMALS;
  } catch (error) {
    console.error("[CCTP] USDC balance read error:", error);
    return 0;
  }
}

async function pollAttestationViaServer(messageHash: string): Promise<string> {
  const deadline = Date.now() + ATTEST_MAX_MS;
  while (Date.now() < deadline) {
    const r = await fetch(`/api/cctp/attestation/${encodeURIComponent(messageHash)}`, {
      credentials: "include",
    });
    if (!r.ok) {
      await new Promise((r2) => setTimeout(r2, ATTEST_POLL_MS));
      continue;
    }
    const j = (await r.json()) as { status?: string; attestation?: string | null };
    if (j.status === "complete" && j.attestation && j.attestation.startsWith("0x")) {
      return j.attestation;
    }
    await new Promise((r2) => setTimeout(r2, ATTEST_POLL_MS));
  }
  throw new Error("Circle attestation timed out — your burn is still safe; open Portfolio later to retry mint.");
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
 * Circle CCTP (professional): Approve → TokenMessenger `depositForBurnWithHook` → Iris attestation →
 * `receiveMessage` on HyperEVM MessageTransmitter. HyperCore credit follows the forwarder hook.
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
  },
): Promise<{ success: boolean; txHash?: string; error?: string; messageHash?: string }> {
  const wallet = (await signer.getAddress()).toLowerCase();
  let cfg: CctpDepositConfig;
  try {
    cfg = options?.depositConfig ?? (await fetchCctpDepositConfig());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not load CCTP configuration.";
    await postBridgeProgress(wallet, { stage: "error_config", error: msg });
    return { success: false, error: msg };
  }

  if (!Number.isFinite(amount) || amount < cfg.minDepositUsdc) {
    return { success: false, error: `Minimum deposit is ${cfg.minDepositUsdc} USDC.` };
  }

  let recipient: string;
  try {
    recipient = getAddress(options?.hyperCoreRecipient ?? wallet);
  } catch {
    return { success: false, error: "Invalid HyperCore recipient address." };
  }

  const resume = options?.resumeFrom;
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
    onStep("mint", "Switch to HyperEVM and confirm mint");
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
    const mintTx = await mt.receiveMessage(msgHex, attestHex);
    const mintReceipt = await mintTx.wait();
    await postBridgeProgress(wallet, {
      stage: "done",
      burnTxHash,
      txHash: burnTxHash,
      messageHash: msgHash,
      cctpMessageHex: msgHex,
      attestationHex: attestHex,
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
      onStep("attestation", messageHash);
      await postBridgeProgress(wallet, {
        stage: "attestation",
        messageHash,
        cctpMessageHex: messageHex,
        amountUsdc: amtForLog,
      });
      attestationHex = await pollAttestationViaServer(messageHash);
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
    const usdc = new Contract(cfg.usdc, ERC20_ABI, signer);
    const allowance: bigint = await usdc.allowance(wallet, cfg.tokenMessenger);
    if (allowance < amountBn) {
      const approveTx = await usdc.approve(cfg.tokenMessenger, amountBn);
      await approveTx.wait();
    }

    onStep("burn");
    await postBridgeProgress(wallet, {
      stage: "burn",
      amountUsdc: amount,
      forwardFeeMax: Number(maxFee) / 1e6,
    });
    const hookData = encodeCctpForwardHookData(recipient, options?.hyperCoreDestinationDex ?? 0);
    const fwd32 = addressToBytes32(cfg.cctpForwarder);
    const tm = new Contract(cfg.tokenMessenger, TOKEN_MESSENGER_ABI, signer);
    const burnTx = await tm.depositForBurnWithHook(
      amountBn,
      cfg.destinationDomain,
      fwd32,
      cfg.usdc,
      fwd32,
      maxFee,
      minFinality,
      hookData,
    );
    const receipt = await burnTx.wait();
    if (!receipt) throw new Error("Burn receipt missing");

    messageHex = extractMessageFromBurnReceipt(receipt, cfg.messageTransmitterArbitrum);
    messageHash = keccak256(getBytes(messageHex));

    await postBridgeProgress(wallet, {
      stage: "wait_attestation",
      burnTxHash: receipt.hash,
      txHash: receipt.hash,
      messageHash,
      cctpMessageHex: messageHex,
      amountUsdc: amount,
    });

    onStep("attestation", messageHash);
    attestationHex = await pollAttestationViaServer(messageHash);
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
    const msg =
      error instanceof Error ? error.message : typeof error === "string" ? error : "CCTP deposit failed";
    console.error("[CCTP] deposit error:", error);
    await postBridgeProgress(wallet, { stage: "error", error: msg });
    return { success: false, error: msg, messageHash: messageHash ?? undefined };
  }
}
