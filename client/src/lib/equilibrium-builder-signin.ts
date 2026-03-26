import { getAddress, type JsonRpcSigner } from "ethers";
import { apiRequest } from "@/lib/queryClient";
import { buildEquilibriumBuilderApprovalMessage } from "@/lib/equilibrium-builder-approval-message";
import { isUserRejectedWalletError, parseApiRequestError } from "@/lib/wallet-errors";

export async function submitEquilibriumBuilderSignin(
  signer: JsonRpcSigner,
  address: string,
): Promise<{ ok: true } | { ok: false; error: string; userCancelled?: boolean }> {
  let normalizedAddress: string;
  try {
    normalizedAddress = getAddress(address);
    const signerAddr = getAddress(await signer.getAddress());
    if (signerAddr !== normalizedAddress) {
      return {
        ok: false,
        error: "Wallet mismatch: the active signer does not match your connected address. Reconnect and try again.",
      };
    }
  } catch {
    return { ok: false, error: "Could not read your wallet address. Reconnect and try again." };
  }

  const message = buildEquilibriumBuilderApprovalMessage(normalizedAddress, Date.now());
  try {
    const signature = await signer.signMessage(message);
    const res = await apiRequest("POST", "/api/wallet-user/approve-builder-code", {
      walletAddress: normalizedAddress,
      signature,
      message,
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!data.success) {
      return { ok: false, error: data.error || "Approval was not saved. Please try again." };
    }
    return { ok: true };
  } catch (err: unknown) {
    if (isUserRejectedWalletError(err)) {
      return {
        ok: false,
        userCancelled: true,
        error: "You cancelled the Equilibrium sign-in message in your wallet.",
      };
    }
    const apiMsg = parseApiRequestError(err);
    return {
      ok: false,
      error: apiMsg ?? (err instanceof Error ? err.message : "Could not verify your signature. Please try again."),
    };
  }
}
