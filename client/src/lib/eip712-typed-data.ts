import type { JsonRpcSigner } from "ethers";
import { isUserRejectedWalletError } from "@/lib/wallet-errors";

/** Mobile / in-app browsers often fail `signTypedData`; `eth_signTypedData_v4` is more reliable. */
export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function buildV4TypedData(
  domain: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  message: Record<string, unknown>,
) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...types,
    },
    domain,
    primaryType,
    message,
  };
}

async function signViaEthSignTypedDataV4(
  signer: JsonRpcSigner,
  address: string,
  payload: ReturnType<typeof buildV4TypedData>,
): Promise<string | null> {
  const json = JSON.stringify(payload);
  const prov = signer.provider as unknown as {
    request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    send?: (method: string, params: unknown[]) => Promise<unknown>;
  };
  if (!prov) return null;

  const tryAddr = [address, json] as unknown[];
  const tryAddrLower = [address.toLowerCase(), json] as unknown[];

  if (typeof prov.request === "function") {
    for (const params of [tryAddrLower, tryAddr]) {
      try {
        const out = await prov.request({ method: "eth_signTypedData_v4", params });
        if (typeof out === "string") return out;
      } catch {
        /* try next */
      }
    }
  }

  if (typeof prov.send === "function") {
    for (const params of [tryAddrLower, tryAddr]) {
      try {
        const out = await prov.send("eth_signTypedData_v4", params);
        if (typeof out === "string") return out;
      } catch {
        /* try next */
      }
    }
  }

  return null;
}

/**
 * Venue EIP-712 signing (ethers first, then `eth_signTypedData_v4` for wallet / mobile quirks).
 */
export async function signTypedDataHyperliquid(
  signer: JsonRpcSigner,
  domain: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  message: Record<string, unknown>,
): Promise<string> {
  try {
    return await signer.signTypedData(domain, types, message);
  } catch (e1) {
    if (isUserRejectedWalletError(e1)) throw e1;

    const address = await signer.getAddress();
    const payload = buildV4TypedData(domain, types, primaryType, message);
    const fallback = await signViaEthSignTypedDataV4(signer, address, payload);
    if (fallback) return fallback;

    const base = e1 instanceof Error ? e1.message : String(e1);
    throw new Error(
      `${base} If nothing appears here, open your wallet app and confirm the signature there.`,
    );
  }
}
