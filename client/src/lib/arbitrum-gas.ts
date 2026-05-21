import { getAddress } from "ethers";

const ARB_RPC = "https://arb1.arbitrum.io/rpc";
const RPC_TIMEOUT_MS = 12_000;

/** Minimum native ETH on Arbitrum to submit one CCTP burn (~$0.05 headroom at typical gas). */
export const MIN_ARB_ETH_FOR_CCTP_BURN = 0.00008;

/** Suggested buffer so users are not one failed tx away from stuck. */
export const RECOMMENDED_ARB_ETH_FOR_DEPOSIT = 0.0002;

async function withRpcTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out — check your connection and try again.`)),
      RPC_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getArbitrumEthBalance(address: string): Promise<number> {
  try {
    const { JsonRpcProvider } = await import("ethers");
    const provider = new JsonRpcProvider(ARB_RPC);
    const raw = await withRpcTimeout(provider.getBalance(getAddress(address)), "Arbitrum ETH balance");
    return Number(raw) / 1e18;
  } catch (e) {
    console.warn("[Arbitrum gas] ETH balance read failed:", e);
    return 0;
  }
}

export function formatArbitrumEth(eth: number): string {
  if (!Number.isFinite(eth) || eth <= 0) return "0 ETH";
  if (eth >= 0.01) return `${eth.toFixed(4)} ETH`;
  if (eth >= 0.0001) return `${eth.toFixed(5)} ETH`;
  return `${eth.toExponential(2)} ETH`;
}

export function hasEnoughArbitrumGasForBurn(ethBalance: number): boolean {
  return Number.isFinite(ethBalance) && ethBalance >= MIN_ARB_ETH_FOR_CCTP_BURN;
}

export function isLikelyInsufficientGasError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("insufficient funds") ||
    m.includes("insufficient balance") ||
    m.includes("gas required exceeds") ||
    m.includes("max fee per gas") ||
    m.includes("intrinsic gas too low") ||
    (m.includes("gas") && m.includes("exceed"))
  );
}
