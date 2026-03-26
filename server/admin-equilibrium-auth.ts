import { randomBytes } from "crypto";
import { verifyMessage, getAddress } from "ethers";
import { isAdminAddress } from "./admin-access";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type Challenge = { message: string; expiresAt: number };
const challenges = new Map<string, Challenge>();

type Session = { wallet: string; expiresAt: number };
const sessions = new Map<string, Session>();

function cleanupMaps(): void {
  const now = Date.now();
  for (const [k, v] of challenges) {
    if (v.expiresAt < now) challenges.delete(k);
  }
  for (const [k, v] of sessions) {
    if (v.expiresAt < now) sessions.delete(k);
  }
}

/** If set, only this wallet may obtain a CRM session after signing. Otherwise any `isAdminAddress` wallet works. */
export function getMasterAdminWallet(): string | null {
  const w = process.env.ADMIN_EQUILIBRIUM_MASTER_WALLET?.trim();
  if (!w || !w.startsWith("0x")) return null;
  try {
    return getAddress(w);
  } catch {
    return null;
  }
}

export function createAdminEquilibriumChallenge(): { nonce: string; message: string; expiresAt: number } {
  cleanupMaps();
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const message = [
    "Equilibrium Admin CRM",
    `Action: Authorize read/write access to sovereign user data.`,
    `Nonce: ${nonce}`,
    `Issued at (UTC): ${issuedAt}`,
    `This signature does not move funds or approve transactions.`,
  ].join("\n");

  challenges.set(nonce, { message, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return { nonce, message, expiresAt: Date.now() + CHALLENGE_TTL_MS };
}

export function verifyAdminEquilibriumSignature(
  nonce: string,
  signature: string,
): { ok: true; accessToken: string; expiresAt: number; wallet: string } | { ok: false; error: string } {
  cleanupMaps();
  const ch = challenges.get(nonce);
  if (!ch || ch.expiresAt < Date.now()) {
    return { ok: false, error: "Invalid or expired challenge. Request a new challenge." };
  }
  if (!signature?.trim()) {
    return { ok: false, error: "Signature required" };
  }

  let recovered: string;
  try {
    recovered = verifyMessage(ch.message, signature);
    recovered = getAddress(recovered);
  } catch {
    return { ok: false, error: "Invalid signature" };
  }

  const master = getMasterAdminWallet();
  if (master) {
    if (recovered.toLowerCase() !== master.toLowerCase()) {
      return { ok: false, error: "Signer is not the configured master admin wallet." };
    }
  } else if (!isAdminAddress(recovered)) {
    return { ok: false, error: "Signer is not an authorized admin wallet." };
  }

  challenges.delete(nonce);
  const accessToken = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(accessToken, { wallet: recovered, expiresAt });
  return { ok: true, accessToken, expiresAt, wallet: recovered };
}

export function validateAdminEquilibriumToken(
  token: string | undefined | null,
): { ok: true; wallet: string } | { ok: false; error: string } {
  if (!token?.trim()) {
    return { ok: false, error: "Missing access token" };
  }
  cleanupMaps();
  const s = sessions.get(token.trim());
  if (!s || s.expiresAt < Date.now()) {
    return { ok: false, error: "Invalid or expired session" };
  }
  return { ok: true, wallet: s.wallet };
}

export function revokeAdminEquilibriumToken(token: string): void {
  sessions.delete(token.trim());
}
