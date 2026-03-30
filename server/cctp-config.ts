import { getAddress } from "ethers";

/**
 * Circle CCTP + HyperCore forwarder settings — **all addresses from environment** (no repo literals).
 * @see https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore
 */
export type CctpServerConfig = {
  irisApiBase: string;
  sourceDomain: number;
  destinationDomain: number;
  cctpExtension: string;
  usdc: string;
  cctpForwarder: string;
  chainIdArbitrum: number;
  minDepositUsdc: number;
  minFinalityThreshold: number;
  usdcEip712Name: string;
  usdcEip712Version: string;
};

function reqInt(name: string, raw: string | undefined): number {
  const n = parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid or missing integer env ${name}`);
  return n;
}

export function loadCctpServerConfig(): CctpServerConfig {
  const irisApiBase = process.env.CCTP_IRIS_API_BASE?.trim() || "https://iris-api.circle.com";
  const sourceDomain = reqInt("CCTP_SOURCE_DOMAIN", process.env.CCTP_SOURCE_DOMAIN ?? "3");
  const destinationDomain = reqInt(
    "CCTP_DESTINATION_DOMAIN",
    process.env.CCTP_DESTINATION_DOMAIN ?? "19",
  );
  const ext = process.env.CCTP_EXTENSION_ADDRESS?.trim();
  const usdc = process.env.CCTP_USDC_ADDRESS?.trim();
  const fwd = process.env.CCTP_FORWARDER_ADDRESS?.trim();
  if (!ext || !usdc || !fwd) {
    throw new Error(
      "CCTP_EXTENSION_ADDRESS, CCTP_USDC_ADDRESS, and CCTP_FORWARDER_ADDRESS are required",
    );
  }
  const chainIdArbitrum = reqInt(
    "CCTP_ARBITRUM_CHAIN_ID",
    process.env.CCTP_ARBITRUM_CHAIN_ID ?? "42161",
  );
  const minRaw = process.env.CCTP_MIN_DEPOSIT_USDC?.trim();
  const minDepositUsdc =
    minRaw != null && minRaw !== "" ? Math.max(0.01, parseFloat(minRaw)) : 5;
  if (!Number.isFinite(minDepositUsdc)) throw new Error("Invalid CCTP_MIN_DEPOSIT_USDC");
  const minFinalityThreshold = reqInt(
    "CCTP_MIN_FINALITY_THRESHOLD",
    process.env.CCTP_MIN_FINALITY_THRESHOLD ?? "1000",
  );
  return {
    irisApiBase: irisApiBase.replace(/\/$/, ""),
    sourceDomain,
    destinationDomain,
    cctpExtension: getAddress(ext),
    usdc: getAddress(usdc),
    cctpForwarder: getAddress(fwd),
    chainIdArbitrum,
    minDepositUsdc,
    minFinalityThreshold,
    usdcEip712Name: process.env.CCTP_USDC_EIP712_NAME?.trim() || "USD Coin",
    usdcEip712Version: process.env.CCTP_USDC_EIP712_VERSION?.trim() || "2",
  };
}

export function cctpFeesUrl(cfg: CctpServerConfig): string {
  const q = new URLSearchParams({ forward: "true", hyperCoreDeposit: "true" });
  return `${cfg.irisApiBase}/v2/burn/USDC/fees/${cfg.sourceDomain}/${cfg.destinationDomain}?${q.toString()}`;
}

/** Circle Iris burn fees — forward leg to HyperCore (USDC 6-decimal subunits). */
export async function fetchCctpBurnForwardFeeMax(cfg: CctpServerConfig): Promise<{
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
  const row =
    data.find((r) => r.finalityThreshold === want) ?? data[0];
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
