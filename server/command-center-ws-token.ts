import { randomBytes } from "crypto";

const TTL_MS = 5 * 60 * 1000;
const tokens = new Map<string, { exp: number }>();

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of tokens) {
    if (v.exp < now) tokens.delete(k);
  }
}

export function issueCommandCenterWsToken(): string {
  sweep();
  const token = randomBytes(24).toString("hex");
  tokens.set(token, { exp: Date.now() + TTL_MS });
  return token;
}

export function consumeCommandCenterWsToken(token: string | undefined): boolean {
  if (!token?.trim()) return false;
  sweep();
  const t = tokens.get(token.trim());
  if (!t || t.exp < Date.now()) {
    tokens.delete(token.trim());
    return false;
  }
  tokens.delete(token.trim());
  return true;
}
