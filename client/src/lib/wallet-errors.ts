/**
 * User cancelled a wallet signing prompt (EIP-191 / typed data / tx).
 * Do NOT use broad `message.includes("rejected")` — Hyperliquid and API copy can contain "rejected"
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
