import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { isMasterAdminAddress, resolveWalletAddressFromRequest } from "./master-admin";

const json429 = { error: "Too many requests. Try again later." };

export const postLeadsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
});

export const walletRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
});

export const walletEmailPatchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
});

function isMasterAdminRequest(req: Request): boolean {
  const w = resolveWalletAddressFromRequest(req);
  return isMasterAdminAddress(w);
}

/** Shared bucket for public support ingest paths; master admin replies are not throttled here. */
export const supportPublicPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
  skip: (req) => isMasterAdminRequest(req),
});

export const stripeCheckoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
});

/** AI / scan style endpoints — separate bucket from generic support. */
export const patternDetectPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 35,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
  skip: (req) => isMasterAdminRequest(req),
});

export const journalGradePostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
  skip: (req) => isMasterAdminRequest(req),
});
