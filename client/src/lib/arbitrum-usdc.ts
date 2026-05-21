import { getAddress } from "ethers";

/** Native USDC on Arbitrum One (Circle CCTP + Revolut withdrawals). */
export const ARBITRUM_NATIVE_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

/** Legacy bridged USDC.e — not accepted by in-app CCTP deposit. */
export const ARBITRUM_BRIDGED_USDC = "0xFF970A61A04b1cA14834A43d5C6A0F9849eB01d2";

const USDC_DECIMALS = 6;
const ARB_RPC = "https://arb1.arbitrum.io/rpc";
const RPC_TIMEOUT_MS = 12_000;

async function withRpcTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out — check your connection and try Refresh.`)),
      RPC_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readErc20Balance(wallet: string, token: string): Promise<number> {
  const { JsonRpcProvider, Contract } = await import("ethers");
  const contract = new Contract(
    getAddress(token),
    ["function balanceOf(address) view returns (uint256)"],
    new JsonRpcProvider(ARB_RPC),
  );
  const raw: bigint = await withRpcTimeout(
    contract.balanceOf(getAddress(wallet)),
    "Arbitrum USDC balance",
  );
  return Number(raw) / 10 ** USDC_DECIMALS;
}

export async function getArbitrumNativeUsdcBalance(address: string): Promise<number> {
  try {
    return await readErc20Balance(address, ARBITRUM_NATIVE_USDC);
  } catch (e) {
    console.error("[Arbitrum USDC] native balance error:", e);
    return 0;
  }
}

export async function getArbitrumBridgedUsdcBalance(address: string): Promise<number> {
  try {
    return await readErc20Balance(address, ARBITRUM_BRIDGED_USDC);
  } catch (e) {
    console.error("[Arbitrum USDC] bridged balance error:", e);
    return 0;
  }
}

export async function getArbitrumUsdcBalances(address: string): Promise<{
  native: number;
  bridged: number;
}> {
  const [native, bridged] = await Promise.all([
    getArbitrumNativeUsdcBalance(address),
    getArbitrumBridgedUsdcBalance(address),
  ]);
  return { native, bridged };
}
