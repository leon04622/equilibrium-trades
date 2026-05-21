/**
 * User cancelled a wallet signing prompt (EIP-191 / typed data / tx).
 * Do NOT use broad `message.includes("rejected")` — exchange and API copy can contain "rejected"
 * without meaning the user cancelled the Equilibrium personal_sign step.
 */
export function isUserRejectedWalletError(e: unknown): boolean {
  const walk = (x: unknown): boolean => {
    if (x == null || typeof x !== "object") return false;
    const err = x as {
      code?: number | string;
      message?: string;
      shortMessage?: string;
      info?: { error?: { code?: number } };
      cause?: unknown;
    };
    const code = err.code ?? err.info?.error?.code;
    if (code === 4001 || code === "4001") return true;
    if (code === "ACTION_REJECTED" || code === "USER_REJECTED") return true;

    const msg = `${err.message ?? ""} ${err.shortMessage ?? ""}`.toLowerCase();
    if (
      msg.includes("user rejected the request") ||
      msg.includes("user denied") ||
      msg.includes("denied transaction signature") ||
      msg.includes("ethers-user-denied") ||
      msg.includes("user cancelled") ||
      msg.includes("user canceled")
    ) {
      return true;
    }
    if (err.cause) return walk(err.cause);
    return false;
  };
  return walk(e);
}

/** Friendly copy for EIP-1193 / ethers provider failures (common with Rabby + MetaMask together). */
export function humanizeWalletConnectError(error: unknown): string {
  const code = (error as { code?: number | string })?.code;
  const msg = String(
    (error as { message?: string; shortMessage?: string })?.message ??
      (error as { shortMessage?: string })?.shortMessage ??
      error ??
      "",
  );
  const lower = msg.toLowerCase();

  if (code === 4001 || code === "4001" || isUserRejectedWalletError(error)) {
    return "Connection cancelled in your wallet. Approve the connect request to continue.";
  }
  if (code === -32002 || code === "-32002") {
    return "A connect request is already open in your wallet — check Rabby or MetaMask and approve it.";
  }
  if (lower.includes("disconnected from all chains") || lower.includes("provider is disconnected")) {
    return (
      "Your wallet extension is not connected to a network yet. Open Rabby or MetaMask, unlock it, " +
      "select any network (Arbitrum is fine), then click your wallet again here."
    );
  }
  if (lower.includes("no accounts") || lower.includes("no account")) {
    return "No account available. Unlock your wallet and try again.";
  }
  if (msg.length > 0 && msg.length <= 280) return msg;
  if (msg.length > 280) return `${msg.slice(0, 200)}…`;
  return "Could not connect. Refresh the page, unlock your wallet, and try again.";
}

/** Parse `apiRequest` errors shaped as `status: body` where body may be JSON with an `error` field. */
export function parseApiRequestError(err: unknown): string | null {
  const m = String((err as Error)?.message ?? "");
  const match = m.match(/^(\d{3}):\s*([\s\S]+)$/);
  if (!match) return null;
  const body = match[2].trim();
  try {
    const j = JSON.parse(body) as { error?: string };
    if (typeof j.error === "string" && j.error.length > 0) return j.error;
  } catch {
    /* ignore */
  }
  return body.length > 0 ? body : null;
}
