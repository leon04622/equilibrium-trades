import { getAddress } from "ethers";

/**
 * Hyperliquid GitBook **Bridge2** (native USDC deposit contract). The only HL-documented Bridge2 on Arbitrum One.
 * Do **not** use look-alike addresses (e.g. legacy `…67093e`). CCTP **burns** use Circle `TokenMessenger`, not this contract;
 * we expose this constant for audits, Arbiscan links, and safety checks.
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/bridge2
 */
export const VERIFIED_HYPERLIQUID_BRIDGE2_ARBITRUM =
  "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

/** Known-incorrect legacy recipient — reject if ever configured. */
export const LEGACY_BRIDGE_ADDRESS_BLACKLIST = "0x2df1c51e09a4ab13229630fc358d49776d67093e";

/**
 * Professional CCTP: Arbitrum (domain **3**) → **HyperEVM (domain 19)** → HyperCore forward.
 * Note: Circle domain **5** is **Solana**, not Hyperliquid. HyperCore enablement uses **19** (HyperEVM).
 * @see https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore
 * @see https://developers.circle.com/cctp/cctp-supported-blockchains
 */
export type ProfessionalDepositServerConfig = {
  irisApiBase: string;
  sourceDomain: number;
  /** HyperEVM = 19 for HyperCore forwarding (not 5). */
  destinationDomain: number;
  tokenMessenger: string;
  messageTransmitterArbitrum: string;
  usdc: string;
  cctpForwarder: string;
  messageTransmitterHyperEvm: string;
  chainIdArbitrum: number;
  hyperevmChainId: number;
  minDepositUsdc: number;
  minFinalityThreshold: number;
  verifiedHyperliquidBridge2Arbitrum: string;
};

function reqInt(name: string, raw: string | undefined, fallback: string): number {
  const n = parseInt(String(raw ?? "").trim() || fallback, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer env ${name}`);
  return n;
}

function assertNotBlacklisted(label: string, addr: string): void {
  if (addr.toLowerCase() === LEGACY_BRIDGE_ADDRESS_BLACKLIST) {
    throw new Error(`${label} must not use the legacy incorrect bridge address`);
  }
}

/** Circle mainnet defaults — override per env for testnet / upgrades. */
const DEFAULT_TOKEN_MESSENGER_ARB = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const DEFAULT_MESSAGE_TRANSMITTER_ARB = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const DEFAULT_USDC_ARB = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const DEFAULT_CCTP_FORWARDER_HYPEREVM = "0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757";
const DEFAULT_MESSAGE_TRANSMITTER_HYPEREVM = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

export function loadProfessionalDepositConfig(): ProfessionalDepositServerConfig {
  const irisApiBase = (process.env.CCTP_IRIS_API_BASE?.trim() || "https://iris-api.circle.com").replace(
    /\/$/,
    "",
  );
  const sourceDomain = reqInt("CCTP_SOURCE_DOMAIN", process.env.CCTP_SOURCE_DOMAIN, "3");
  const destinationDomain = reqInt(
    "CCTP_DESTINATION_DOMAIN",
    process.env.CCTP_DESTINATION_DOMAIN,
    "19",
  );

  const tokenMessenger = getAddress(
    process.env.CCTP_TOKEN_MESSENGER_ADDRESS?.trim() || DEFAULT_TOKEN_MESSENGER_ARB,
  );
  const messageTransmitterArbitrum = getAddress(
    process.env.CCTP_MESSAGE_TRANSMITTER_ARBITRUM?.trim() || DEFAULT_MESSAGE_TRANSMITTER_ARB,
  );
  const usdc = getAddress(process.env.CCTP_USDC_ADDRESS?.trim() || DEFAULT_USDC_ARB);
  const cctpForwarder = getAddress(
    process.env.CCTP_FORWARDER_ADDRESS?.trim() || DEFAULT_CCTP_FORWARDER_HYPEREVM,
  );
  const messageTransmitterHyperEvm = getAddress(
    process.env.CCTP_MESSAGE_TRANSMITTER_HYPEREVM?.trim() || DEFAULT_MESSAGE_TRANSMITTER_HYPEREVM,
  );

  assertNotBlacklisted("TokenMessenger", tokenMessenger);
  assertNotBlacklisted("USDC", usdc);

  const chainIdArbitrum = reqInt("CCTP_ARBITRUM_CHAIN_ID", process.env.CCTP_ARBITRUM_CHAIN_ID, "42161");
  const hyperevmChainId = reqInt("CCTP_HYPEREVM_CHAIN_ID", process.env.CCTP_HYPEREVM_CHAIN_ID, "999");

  const minRaw = process.env.CCTP_MIN_DEPOSIT_USDC?.trim();
  const minDepositUsdc =
    minRaw != null && minRaw !== "" ? Math.max(0.01, parseFloat(minRaw)) : 5;
  if (!Number.isFinite(minDepositUsdc)) throw new Error("Invalid CCTP_MIN_DEPOSIT_USDC");

  const minFinalityThreshold = reqInt(
    "CCTP_MIN_FINALITY_THRESHOLD",
    process.env.CCTP_MIN_FINALITY_THRESHOLD,
    "1000",
  );

  const verifiedBridge = getAddress(
    process.env.VERIFIED_HL_BRIDGE2_ARBITRUM?.trim() || VERIFIED_HYPERLIQUID_BRIDGE2_ARBITRUM,
  );

  return {
    irisApiBase,
    sourceDomain,
    destinationDomain,
    tokenMessenger,
    messageTransmitterArbitrum,
    usdc,
    cctpForwarder,
    messageTransmitterHyperEvm,
    chainIdArbitrum,
    hyperevmChainId,
    minDepositUsdc,
    minFinalityThreshold,
    verifiedHyperliquidBridge2Arbitrum: verifiedBridge,
  };
}

export function cctpFeesUrl(cfg: ProfessionalDepositServerConfig): string {
  const q = new URLSearchParams({ forward: "true", hyperCoreDeposit: "true" });
  return `${cfg.irisApiBase}/v2/burn/USDC/fees/${cfg.sourceDomain}/${cfg.destinationDomain}?${q.toString()}`;
}

export async function fetchCctpBurnForwardFeeMax(cfg: ProfessionalDepositServerConfig): Promise<{
  maxFee: bigint;
  minFinalityThreshold: number;
}> {
  const url = cctpFeesUrl(cfg);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const fb = process.env.CCTP_FORWARD_FEE_STATIC?.trim();
    if (fb && /^\d+$/.test(fb)) {
      return { maxFee: BigInt(fb), minFinalityThreshold: cfg.minFinalityThreshold };
    }
    throw new Error(`CCTP Iris fees request failed: ${res.status}`);
  }
  const data = (await res.json()) as Array<{
    finalityThreshold?: number;
    forwardFee?: { low?: number; med?: number; high?: number };
  }>;
  if (!Array.isArray(data) || data.length === 0) {
    const fb = process.env.CCTP_FORWARD_FEE_STATIC?.trim();
    if (fb && /^\d+$/.test(fb)) {
      return { maxFee: BigInt(fb), minFinalityThreshold: cfg.minFinalityThreshold };
    }
    throw new Error("CCTP Iris fees: empty response");
  }
  const want = cfg.minFinalityThreshold;
  const row = data.find((r) => r.finalityThreshold === want) ?? data[0];
  const med = row.forwardFee?.med ?? row.forwardFee?.low ?? row.forwardFee?.high;
  if (typeof med !== "number" || !Number.isFinite(med)) {
    const fb = process.env.CCTP_FORWARD_FEE_STATIC?.trim();
    if (fb && /^\d+$/.test(fb)) {
      return { maxFee: BigInt(fb), minFinalityThreshold: want };
    }
    throw new Error("CCTP Iris fees: could not read forwardFee");
  }
  return {
    maxFee: BigInt(Math.round(med)),
    minFinalityThreshold: row.finalityThreshold ?? want,
  };
}

/** Circle Iris v1 — `messageHash` = keccak256(message bytes from `MessageSent`). */
export async function fetchCircleAttestation(
  messageHash: string,
  irisBase: string,
): Promise<{ status: string; attestation: string | null }> {
  const mh = messageHash.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(mh)) {
    throw new Error("Invalid messageHash");
  }
  const base = irisBase.replace(/\/$/, "");
  const res = await fetch(`${base}/v1/attestations/${mh}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) {
    return { status: "not_found", attestation: null };
  }
  if (!res.ok) {
    throw new Error(`Iris attestation HTTP ${res.status}`);
  }
  const j = (await res.json()) as { status?: string; attestation?: string | null };
  return {
    status: j.status || "unknown",
    attestation: j.attestation ?? null,
  };
}
