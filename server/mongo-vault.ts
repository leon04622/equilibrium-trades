import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { MongoClient, ObjectId, type Db, type Collection, type Document } from "mongodb";
import { getPublicAppBaseUrl } from "./public-url";
import { adminVideoCreateSchema, insertSupportMessageSchema, supportSendBodySchema } from "@shared/schema";
import type { InsertSupportMessage, SupportMessage, WalletUser } from "@shared/schema";
import { isFortressSovereignAddress } from "./fortress-admin";
import {
  resolveWalletAddressFromRequest,
  requireMasterAdminWallet,
  isMasterAdminAddress,
} from "./master-admin";
import { pushAdminLog } from "./admin-log-bus";
import { emitSupportMessage } from "./support-events";
import { deleteVaultVideoById, listAllVaultVideos, upsertVaultVideo, vaultVideoDocToApi } from "./video-service";
import { deleteLocalUploadedVideoByObjectPath } from "./local-upload-routes";
import { storage } from "./storage";
const SUPPORT_COLL = process.env.MONGO_SUPPORT_COLLECTION || "support_tickets";

/** Logical `users` / CRM store in MongoDB (`MONGO_USERS_COLLECTION` or `MONGO_CRM_COLLECTION`, default `users`). */
export function mongoCrmUsersCollectionName(): string {
  return (
    process.env.MONGO_USERS_COLLECTION?.trim() ||
    process.env.MONGO_CRM_COLLECTION?.trim() ||
    "users"
  );
}

let vaultDb: Db | null = null;

export function getVaultDb(): Db | null {
  return vaultDb;
}

const LEGACY_CRM_USERS_COLLECTION = "crm_users";

function inferSubscriptionTierString(doc: Document): string {
  if (Boolean(doc.manualProOverride)) {
    const st = doc.subTier != null ? String(doc.subTier).trim().toLowerCase() : "";
    if (st === "mentor" || st === "mentoring" || st === "elite") return "mentoring";
    return "pro";
  }
  const raw = String(doc.subscriptionTier ?? "").trim().toLowerCase();
  if (raw && raw !== "free") return raw;
  const st = doc.subTier != null ? String(doc.subTier).trim().toLowerCase() : "";
  if (st === "pro") return "pro";
  if (st === "mentor" || st === "mentoring" || st === "elite") return "mentoring";
  return raw || "free";
}

/** Find CRM user doc in primary collection, then legacy `crm_users` if names differ. */
export async function findCrmUserDocumentByWallet(walletAddress: string): Promise<Document | null> {
  if (!vaultDb) return null;
  const w = walletAddress.trim().toLowerCase();
  const filter = { $or: [{ wallet: w }, { walletAddress: w }] };
  const primary = mongoCrmUsersCollectionName();
  const tryCollections =
    primary === LEGACY_CRM_USERS_COLLECTION
      ? [primary]
      : [primary, LEGACY_CRM_USERS_COLLECTION];
  const seen = new Set<string>();
  for (const name of tryCollections) {
    if (seen.has(name)) continue;
    seen.add(name);
    const doc = await vaultDb.collection(name).findOne(filter);
    if (doc) return doc;
  }
  return null;
}

export type ScannerWatchlistPrefs = {
  allMarkets: boolean;
  coins: string[];
};

/**
 * Only explicit false / off values mean "not all markets". Missing field → full universe.
 * Avoids string "false" or other CRM exports being misread as true.
 */
export function mongoScannerAllMarketsFromDoc(value: unknown): boolean {
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return true;
}

/** Pattern scanner: `scannerAllMarkets` + `scannerWatchlistCoins` on the CRM users collection. */
export async function fetchMongoScannerWatchlistPrefs(
  walletAddress: string,
): Promise<ScannerWatchlistPrefs | null> {
  if (!vaultDb) return null;
  const doc = await findCrmUserDocumentByWallet(walletAddress);
  if (!doc) return null;
  const coins = Array.isArray(doc.scannerWatchlistCoins)
    ? doc.scannerWatchlistCoins.map((c: unknown) => String(c).trim()).filter(Boolean)
    : [];
  const allMarkets = mongoScannerAllMarketsFromDoc(doc.scannerAllMarkets);
  return { allMarkets, coins };
}

export async function upsertMongoScannerWatchlistPrefs(
  walletAddress: string,
  prefs: ScannerWatchlistPrefs,
): Promise<{ ok: boolean }> {
  if (!vaultDb) return { ok: false };
  /** Always write to the configured primary CRM collection (not legacy read-only alias). */
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const w = walletAddress.trim().toLowerCase();
  const now = new Date();
  await coll.updateOne(
    { $or: [{ wallet: w }, { walletAddress: w }] },
    {
      $set: {
        scannerAllMarkets: Boolean(prefs.allMarkets),
        scannerWatchlistCoins: prefs.coins.map((c) => c.trim()).filter(Boolean),
        updatedAt: now,
      },
      $setOnInsert: {
        wallet: w,
        walletAddress: w,
        source: "equilibrium_app",
        joinDate: now,
        createdAt: now,
        subTier: "Free",
        accessExpires: null,
      },
    },
    { upsert: true },
  );
  return { ok: true };
}

export type MongoVaultHandle = {
  handleGetVideos(req: Request, res: Response): Promise<void>;
  handlePostVideo(req: Request, res: Response): Promise<void>;
  handleDeleteVideo(req: Request, res: Response): Promise<void>;
  handleGetCrmUsers(req: Request, res: Response): Promise<void>;
  handleGetSupportInbox(req: Request, res: Response): Promise<void>;
  handleSupportSend(req: Request, res: Response): Promise<void>;
  handleSupportMessagesPost(req: Request, res: Response): Promise<void>;
  handleGetSupportMessagesConversation(req: Request, res: Response): Promise<void>;
  handleGetSupportConversations(req: Request, res: Response): Promise<void>;
  handleMarkSupportRead(req: Request, res: Response): Promise<void>;
};

function rowToSupportMessage(doc: Document): SupportMessage {
  const createdAt =
    doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt || Date.now());
  const clientSentAt =
    doc.clientSentAt == null
      ? null
      : doc.clientSentAt instanceof Date
        ? doc.clientSentAt
        : new Date(doc.clientSentAt);
  return {
    id: String(doc.id || doc._id),
    senderType: String(doc.senderType),
    senderWallet: doc.senderWallet != null ? String(doc.senderWallet) : null,
    senderName: doc.senderName != null ? String(doc.senderName) : null,
    message: String(doc.message),
    isRead: Boolean(doc.isRead),
    conversationId: String(doc.conversationId).toLowerCase(),
    walletAddress: doc.walletAddress != null ? String(doc.walletAddress) : null,
    clientSentAt,
    createdAt,
  };
}

function crmDisplayTier(tier: string | undefined): "Free" | "Pro" | "Mentor" {
  const t = (tier || "free").toLowerCase();
  if (t === "mentoring" || t === "elite" || t === "mentor") return "Mentor";
  if (t === "pro") return "Pro";
  if (t === "free") return "Free";
  return "Free";
}

function crmSubscriptionStatusFromWallet(user: WalletUser): "Active" | "Expired" {
  const t = (user.subscriptionTier || "free").toLowerCase();
  if (t === "free") return "Active";
  const exp = user.subscriptionExpiresAt;
  const expMs = exp instanceof Date ? exp.getTime() : exp ? new Date(exp as unknown as string).getTime() : NaN;
  const expOk = !Number.isFinite(expMs) || expMs > Date.now();
  return user.subscriptionActive && expOk ? "Active" : "Expired";
}

/**
 * Ensure a CRM row exists for this wallet as soon as they connect (before/without Postgres).
 * Does not downgrade `subTier` / subscription fields on update — only sets email when provided.
 */
export async function upsertMongoCrmContactOnConnect(params: {
  walletAddress: string;
  email?: string | null;
}): Promise<void> {
  if (!vaultDb) return;
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const w = params.walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return;
  const now = new Date();
  const setDoc: Record<string, unknown> = {
    wallet: w,
    walletAddress: w,
    updatedAt: now,
  };
  const em = params.email != null ? String(params.email).trim() : "";
  if (em) setDoc.email = em;

  await coll.updateOne(
    { $or: [{ wallet: w }, { walletAddress: w }] },
    {
      $set: setDoc,
      $setOnInsert: {
        wallet: w,
        walletAddress: w,
        source: "equilibrium_app",
        joinDate: now,
        createdAt: now,
        subTier: "Free",
        subscriptionTier: "free",
        subscriptionActive: false,
        manualProOverride: false,
        accessExpires: null,
        subscriptionExpiresAt: null,
        status: "Active",
        isBuilderLinked: false,
        email: em || null,
      },
    },
    { upsert: true },
  );
}

/** Upsert CRM / users document when Mongo vault DB is connected (wallet connect, admin, Stripe sync). */
export async function upsertMongoCrmUserFromWallet(user: WalletUser): Promise<void> {
  if (!vaultDb) return;
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const wallet = user.walletAddress.toLowerCase();
  const now = new Date();
  const created =
    user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt || now);
  const existing = await coll.findOne({ $or: [{ wallet }, { walletAddress: wallet }] });
  const doc: Record<string, unknown> = {
    wallet,
    walletAddress: wallet,
    email: user.email ?? null,
    joinDate: created,
    createdAt: created,
    updatedAt: now,
    /** Display tier for Admin CRM + subscription readers — must persist Grant Access / Pro grants. */
    subTier: crmDisplayTier(user.subscriptionTier),
    subscriptionTier: user.subscriptionTier,
    subscriptionActive: user.subscriptionActive,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    /** Mirror of subscription end — used by vault / user-status readers. */
    accessExpires: user.subscriptionExpiresAt ?? null,
    manualProOverride: user.manualProOverride ?? false,
    status: crmSubscriptionStatusFromWallet(user),
    isBuilderLinked: user.isBuilderLinked ?? false,
  };
  /** Lock CRM **Pro / Mentor** when `manualProOverride` was granted in Mongo but Postgres row still shows `free` (sync lag). */
  if (existing && existing.manualProOverride === true) {
    doc.manualProOverride = true;
    const exTier = inferSubscriptionTierString(existing);
    const pgFree = (user.subscriptionTier || "free").toLowerCase() === "free";
    if (pgFree && exTier !== "free") {
      doc.subscriptionTier = exTier;
      doc.subTier =
        existing.subTier != null && String(existing.subTier).trim() !== ""
          ? String(existing.subTier)
          : crmDisplayTier(exTier);
      doc.subscriptionActive = true;
      doc.status = "Active";
    }
  }
  await coll.updateOne(
    { $or: [{ wallet }, { walletAddress: wallet }] },
    {
      $set: doc,
      $setOnInsert: { source: "equilibrium_app", subTier: "Free", accessExpires: null },
    },
    { upsert: true },
  );
}

/** Read persisted tier from Mongo when Postgres has no `wallet_users` row yet. */
function numField(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** Persist last known Hyperliquid perp + spot USDC totals (CRM `users`) for hydration after refresh. */
export async function persistMongoCrmHlBalanceSnapshot(
  walletAddress: string,
  data: { perpAccountValue: number; spotUsdc: number; totalUsd: number },
): Promise<void> {
  if (!vaultDb) return;
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const w = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return;
  const now = new Date();
  await coll.updateOne(
    { $or: [{ wallet: w }, { walletAddress: w }] },
    {
      $set: {
        hlPerpAccountValue: data.perpAccountValue,
        hlSpotUsdc: data.spotUsdc,
        hlTotalUsd: data.totalUsd,
        hlBalanceObservedAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        wallet: w,
        walletAddress: w,
        source: "equilibrium_app",
        joinDate: now,
        createdAt: now,
        subTier: "Free",
        subscriptionTier: "free",
        subscriptionActive: false,
        manualProOverride: false,
        accessExpires: null,
        subscriptionExpiresAt: null,
        status: "Active",
        isBuilderLinked: false,
        email: null,
      },
    },
    { upsert: true },
  );
}

/** Persisted CCTP Arbitrum → HyperCore flow (CRM only — does not modify subscription / Pro fields). */
export type CctpBridgeProgressPublic = {
  stage: string;
  updatedAt: string | null;
  /** Burn tx on Arbitrum (TokenMessenger). */
  txHash?: string | null;
  burnTxHash?: string | null;
  /** keccak256(message) for Iris `/v1/attestations/{messageHash}`. */
  messageHash?: string | null;
  /** Raw `message` bytes from `MessageSent` (hex) — required to call `receiveMessage` on HyperEVM. */
  cctpMessageHex?: string | null;
  attestationHex?: string | null;
  amountUsdc?: number | null;
  forwardFeeMax?: number | null;
  error?: string | null;
};

function cctpProgressFromDoc(doc: Document | null): CctpBridgeProgressPublic | null {
  if (!doc || !doc.cctpBridgeProgress || typeof doc.cctpBridgeProgress !== "object") return null;
  const p = doc.cctpBridgeProgress as Record<string, unknown>;
  const stage = typeof p.stage === "string" ? p.stage : "unknown";
  const u = p.updatedAt;
  const updatedAt =
    u instanceof Date ? u.toISOString() : u != null && u !== "" ? String(u) : null;
  return {
    stage,
    updatedAt,
    txHash: p.txHash != null ? String(p.txHash) : p.burnTxHash != null ? String(p.burnTxHash) : null,
    burnTxHash: p.burnTxHash != null ? String(p.burnTxHash) : null,
    messageHash: p.messageHash != null ? String(p.messageHash) : null,
    cctpMessageHex: p.cctpMessageHex != null ? String(p.cctpMessageHex) : null,
    attestationHex: p.attestationHex != null ? String(p.attestationHex) : null,
    amountUsdc: typeof p.amountUsdc === "number" ? p.amountUsdc : undefined,
    forwardFeeMax: typeof p.forwardFeeMax === "number" ? p.forwardFeeMax : undefined,
    error: p.error != null ? String(p.error) : null,
  };
}

export async function fetchMongoCrmCctpBridgeProgress(
  walletAddress: string,
): Promise<CctpBridgeProgressPublic | null> {
  const doc = await findCrmUserDocumentByWallet(walletAddress);
  return cctpProgressFromDoc(doc);
}

/**
 * Updates only `cctpBridgeProgress` (+ `updatedAt`). Subscription tier and `manualProOverride` are untouched
 * so **Pro / Mentor grants stay locked** in Mongo while users resume a long CCTP flow.
 */
export async function persistMongoCrmCctpBridgeProgress(
  walletAddress: string,
  progress: {
    stage: string;
    txHash?: string | null;
    burnTxHash?: string | null;
    messageHash?: string | null;
    cctpMessageHex?: string | null;
    attestationHex?: string | null;
    amountUsdc?: number | null;
    forwardFeeMax?: number | null;
    error?: string | null;
  },
): Promise<void> {
  if (!vaultDb) return;
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const w = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return;
  const now = new Date();
  const existing = await coll.findOne({ $or: [{ wallet: w }, { walletAddress: w }] });
  const prevRaw = existing?.cctpBridgeProgress;
  const prev =
    prevRaw && typeof prevRaw === "object" && !Array.isArray(prevRaw)
      ? { ...(prevRaw as Record<string, unknown>) }
      : {};
  const burnTx = progress.burnTxHash ?? progress.txHash ?? null;
  const next: Record<string, unknown> = {
    ...prev,
    stage: progress.stage,
    updatedAt: now,
    ...(burnTx != null ? { burnTxHash: burnTx, txHash: burnTx } : {}),
    ...(progress.messageHash !== undefined ? { messageHash: progress.messageHash } : {}),
    ...(progress.cctpMessageHex !== undefined ? { cctpMessageHex: progress.cctpMessageHex } : {}),
    ...(progress.attestationHex !== undefined ? { attestationHex: progress.attestationHex } : {}),
    ...(progress.amountUsdc !== undefined ? { amountUsdc: progress.amountUsdc } : {}),
    ...(progress.forwardFeeMax !== undefined ? { forwardFeeMax: progress.forwardFeeMax } : {}),
    ...(progress.error !== undefined ? { error: progress.error } : {}),
  };
  await coll.updateOne(
    { $or: [{ wallet: w }, { walletAddress: w }] },
    {
      $set: {
        cctpBridgeProgress: next,
        updatedAt: now,
      },
      $setOnInsert: {
        wallet: w,
        walletAddress: w,
        source: "equilibrium_app",
        joinDate: now,
        createdAt: now,
        subTier: "Free",
        subscriptionTier: "free",
        subscriptionActive: false,
        manualProOverride: false,
        accessExpires: null,
        subscriptionExpiresAt: null,
        status: "Active",
        isBuilderLinked: false,
        email: null,
      },
    },
    { upsert: true },
  );
}

export async function fetchMongoCrmHlBalanceSnapshot(walletAddress: string): Promise<{
  perpAccountValue: number;
  spotUsdc: number;
  totalUsd: number;
  updatedAt: string | null;
} | null> {
  const doc = await findCrmUserDocumentByWallet(walletAddress);
  if (!doc) return null;
  if (
    doc.hlPerpAccountValue == null &&
    doc.hlSpotUsdc == null &&
    doc.hlTotalUsd == null
  ) {
    return null;
  }
  const perp = numField(doc.hlPerpAccountValue);
  const spot = numField(doc.hlSpotUsdc);
  let total = numField(doc.hlTotalUsd);
  if (total <= 0 && (perp > 0 || spot > 0)) total = perp + spot;
  const u = doc.hlBalanceObservedAt;
  return {
    perpAccountValue: perp,
    spotUsdc: spot,
    totalUsd: total,
    updatedAt: u instanceof Date ? u.toISOString() : u != null ? String(u) : null,
  };
}

function isPaidSubTierLabel(label: string): boolean {
  const s = String(label ?? "")
    .trim()
    .toLowerCase();
  return s === "pro" || s === "mentor" || s === "mentoring" || s === "elite";
}

export async function fetchMongoCrmSubscriptionSnapshot(walletAddress: string): Promise<{
  subscriptionTier: string;
  subscriptionActive: boolean;
  subscriptionExpiresAt: Date | null;
  subTier: string;
  manualProOverride: boolean;
} | null> {
  if (!vaultDb) return null;
  const doc = await findCrmUserDocumentByWallet(walletAddress);
  if (!doc) return null;
  const tierRaw = inferSubscriptionTierString(doc);
  const expRaw = doc.accessExpires ?? doc.subscriptionExpiresAt;
  let subscriptionExpiresAt: Date | null = null;
  if (expRaw instanceof Date) subscriptionExpiresAt = expRaw;
  else if (expRaw != null && expRaw !== "") {
    const d = new Date(String(expRaw));
    subscriptionExpiresAt = Number.isNaN(d.getTime()) ? null : d;
  }
  const expMs = subscriptionExpiresAt instanceof Date ? subscriptionExpiresAt.getTime() : NaN;
  const expOk = !Number.isFinite(expMs) || expMs > Date.now();
  const subTier =
    doc.subTier != null && String(doc.subTier).trim() !== ""
      ? String(doc.subTier)
      : crmDisplayTier(tierRaw);
  let active = Boolean(doc.subscriptionActive);
  if (!expOk) active = false;
  return {
    subscriptionTier: tierRaw,
    subscriptionActive: active,
    subscriptionExpiresAt,
    subTier,
    manualProOverride: Boolean(doc.manualProOverride),
  };
}

/**
 * Admin / billing: hard-write subscription fields to the CRM `users` collection (findOneAndUpdate + upsert).
 * Ensures Pro/Mentor survives refresh even if a later partial `$set` omitted tier fields.
 */
/**
 * Stripe Checkout completed with `metadata.referral_wallet` — attribute referrer on the buyer's CRM row.
 * Idempotent: repeated webhooks refresh `referralAttributedAt` / session id.
 */
export async function persistMongoCrmReferralFromStripeCheckout(params: {
  buyerWallet: string;
  referralWallet: string;
  stripeSessionId: string;
}): Promise<void> {
  if (!vaultDb) return;
  const buyer = params.buyerWallet.trim().toLowerCase();
  const ref = params.referralWallet.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(buyer) || !/^0x[a-f0-9]{40}$/.test(ref)) return;
  if (buyer === ref) return;
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const now = new Date();
  await coll.updateOne(
    { $or: [{ wallet: buyer }, { walletAddress: buyer }] },
    {
      $set: {
        referralWallet: ref,
        referralStripeSessionId: params.stripeSessionId,
        referralAttributedAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        wallet: buyer,
        walletAddress: buyer,
        source: "stripe_referral_webhook",
        joinDate: now,
        createdAt: now,
        subTier: "Free",
        subscriptionTier: "free",
        subscriptionActive: false,
        manualProOverride: false,
        accessExpires: null,
        subscriptionExpiresAt: null,
        status: "Active",
        isBuilderLinked: false,
        email: null,
      },
    },
    { upsert: true },
  );
  console.log(
    `[mongo-vault] CRM referral attributed: buyer=${buyer.slice(0, 8)}… referrer=${ref.slice(0, 8)}… session=${params.stripeSessionId}`,
  );
}

export async function upsertMongoCrmSubscriptionAuthority(params: {
  walletAddress: string;
  subscriptionTier: "free" | "pro" | "mentoring" | "elite";
  subscriptionActive: boolean;
  manualProOverride: boolean;
  subscriptionExpiresAt: Date | null;
}): Promise<void> {
  if (!vaultDb) return;
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const w = params.walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return;
  const now = new Date();
  const subTier = crmDisplayTier(params.subscriptionTier);
  const status: "Active" | "Expired" =
    params.subscriptionTier === "free"
      ? "Active"
      : params.subscriptionActive &&
          (!params.subscriptionExpiresAt || params.subscriptionExpiresAt.getTime() > Date.now())
        ? "Active"
        : "Expired";
  await coll.findOneAndUpdate(
    { $or: [{ wallet: w }, { walletAddress: w }] },
    {
      $set: {
        wallet: w,
        walletAddress: w,
        updatedAt: now,
        subTier,
        subscriptionTier: params.subscriptionTier,
        subscriptionActive: params.subscriptionActive,
        manualProOverride: params.manualProOverride,
        subscriptionExpiresAt: params.subscriptionExpiresAt,
        accessExpires: params.subscriptionExpiresAt,
        status,
      },
      $setOnInsert: {
        source: "equilibrium_app",
        joinDate: now,
        createdAt: now,
        isBuilderLinked: false,
        email: null,
      },
    },
    { upsert: true },
  );
}

function mongoDocToCrmRow(u: Document) {
  const wallet = String(u.wallet ?? u.walletAddress ?? "");
  const tierRaw = String(u.subTier ?? u.subscriptionTier ?? "free");
  const displayTier = crmDisplayTier(tierRaw);
  let status: "Active" | "Expired" = "Active";
  if (u.status === "Active" || u.status === "Expired") {
    status = u.status as "Active" | "Expired";
  } else {
    const t = tierRaw.toLowerCase();
    if (t === "free") status = "Active";
    else {
      const active = Boolean(u.subscriptionActive);
      const exp = u.subscriptionExpiresAt;
      const expMs =
        exp instanceof Date ? exp.getTime() : exp ? new Date(String(exp)).getTime() : NaN;
      const expOk = !Number.isFinite(expMs) || expMs > Date.now();
      status = active && expOk ? "Active" : "Expired";
    }
  }
  const referralWallet =
    u.referralWallet != null && String(u.referralWallet).trim() !== ""
      ? String(u.referralWallet).trim().toLowerCase()
      : null;
  return {
    wallet,
    email: u.email != null && u.email !== "" ? String(u.email) : null,
    referralWallet,
    joinDate:
      u.joinDate != null
        ? u.joinDate instanceof Date
          ? u.joinDate.toISOString()
          : String(u.joinDate)
        : u.createdAt instanceof Date
          ? u.createdAt.toISOString()
          : u.createdAt != null
            ? String(u.createdAt)
            : null,
    subTier: displayTier,
    status,
    manualProOverride: Boolean(u.manualProOverride),
    builderStatus: u.isBuilderLinked ? "Linked" : "Not linked",
  };
}

function createHandle(db: Db): MongoVaultHandle {
  const crm: Collection<Document> = db.collection(mongoCrmUsersCollectionName());
  const tickets: Collection<Document> = db.collection(SUPPORT_COLL);

  return {
    async handleGetVideos(req: Request, res: Response): Promise<void> {
      try {
        const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() || req.protocol;
        const host = req.get("host");
        const origin =
          host && proto ? `${proto}://${host}`.replace(/\/$/, "") : getPublicAppBaseUrl();
        const list = await listAllVaultVideos(db, origin);
        res.json(list);
      } catch (e) {
        console.error("[mongo-vault] GET /api/videos:", e);
        res.status(500).json({ error: "Failed to fetch videos" });
      }
    },

    async handlePostVideo(req: Request, res: Response): Promise<void> {
      const walletAddress = resolveWalletAddressFromRequest(req)?.trim();
      if (!walletAddress) {
        res.status(401).json({ error: "x-wallet-address or Authorization: Bearer <0x…> required" });
        return;
      }
      if (!isFortressSovereignAddress(walletAddress)) {
        res.status(403).json({ error: "Sovereign admin wallet required" });
        return;
      }
      try {
        const parsed = adminVideoCreateSchema.safeParse(
          req.body && typeof req.body === "object" ? req.body : {},
        );
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
          return;
        }
        const row = parsed.data;
        if (row.id != null && String(row.id).trim() !== "" && !ObjectId.isValid(String(row.id).trim())) {
          res.status(400).json({ error: "Invalid video id — must be a 24-character Mongo ObjectId hex" });
          return;
        }
        if (!row.youtubeId?.trim() && !row.videoPath?.trim()) {
          res.status(400).json({ error: "Could not resolve video URL (YouTube, Vimeo, or direct link)" });
          return;
        }
        const saved = await upsertVaultVideo(db, row);
        const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() || req.protocol;
        const host = req.get("host");
        const origin =
          host && proto ? `${proto}://${host}`.replace(/\/$/, "") : getPublicAppBaseUrl();
        res.json(vaultVideoDocToApi(saved, origin));
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.error("[mongo-vault] POST /api/videos:", e);
        res.status(500).json({
          error: "Failed to persist video to MongoDB",
          detail,
        });
      }
    },

    async handleDeleteVideo(req: Request, res: Response): Promise<void> {
      const walletAddress = resolveWalletAddressFromRequest(req)?.trim();
      if (!walletAddress) {
        res.status(401).json({ error: "x-wallet-address or Authorization: Bearer <0x…> required" });
        return;
      }
      if (!isFortressSovereignAddress(walletAddress)) {
        res.status(403).json({ error: "Sovereign admin wallet required" });
        return;
      }
      try {
        const raw = req.params.id;
        const result = await deleteVaultVideoById(db, raw);
        if (result.ok) {
          await deleteLocalUploadedVideoByObjectPath(result.videoPath);
          res.json({ success: true });
        }
        else res.status(404).json({ error: "Video not found" });
      } catch (e) {
        console.error("[mongo-vault] DELETE /api/videos/:id:", e);
        res.status(500).json({ error: "Failed to delete video" });
      }
    },

    async handleGetCrmUsers(req: Request, res: Response): Promise<void> {
      const auth = requireMasterAdminWallet(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      try {
        const rows = await crm.find({}).toArray();
        const out = rows.map((u) => mongoDocToCrmRow(u)).filter((r) => r.wallet);

        let pgUsers: WalletUser[] = [];
        try {
          pgUsers = await storage.getAllWalletUsers();
        } catch (mergeErr) {
          console.error("[mongo-vault] CRM merge: could not load Postgres wallet_users:", mergeErr);
        }

        const emailByWallet = new Map(
          pgUsers.map((u) => [u.walletAddress.toLowerCase(), u.email != null ? String(u.email).trim() : ""]),
        );

        for (const r of out) {
          const w = r.wallet.toLowerCase();
          const pgEmail = emailByWallet.get(w);
          if (pgEmail && (!r.email || !String(r.email).trim())) {
            r.email = pgEmail;
          }
        }

        const mongoWallets = new Set(out.map((r) => r.wallet.toLowerCase()));
        for (const u of pgUsers) {
          const w = u.walletAddress.toLowerCase();
          if (!/^0x[a-f0-9]{40}$/.test(w)) continue;
          if (mongoWallets.has(w)) continue;
          mongoWallets.add(w);
          const created =
            u.createdAt instanceof Date ? u.createdAt : u.createdAt ? new Date(u.createdAt as unknown as string) : new Date();
          const joinDate =
            Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString();
          out.push({
            wallet: w,
            email: u.email != null && String(u.email).trim() ? String(u.email).trim() : null,
            referralWallet: null,
            joinDate,
            subTier: crmDisplayTier(u.subscriptionTier),
            status: crmSubscriptionStatusFromWallet(u),
            manualProOverride: Boolean(u.manualProOverride),
            builderStatus: u.isBuilderLinked ? "Linked" : "Not linked",
          });
        }

        res.json(out);
      } catch (e) {
        console.error("[mongo-vault] GET /api/crm/users:", e);
        res.status(500).json({ error: "Failed to fetch CRM users" });
      }
    },

    async handleGetSupportInbox(req: Request, res: Response): Promise<void> {
      try {
        const auth = requireMasterAdminWallet(req);
        if (!auth.ok) {
          res.status(auth.status).json({ error: auth.error });
          return;
        }
        const limit = Math.min(parseInt(String(req.query.limit || "500"), 10) || 500, 2000);
        const docs = await tickets.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
        res.json(docs.map((d) => rowToSupportMessage(d)));
      } catch (err) {
        console.error("[mongo-vault] GET /api/support:", err);
        res.status(500).json({ error: "Failed to fetch support messages" });
      }
    },

    async handleSupportSend(req: Request, res: Response): Promise<void> {
      try {
        const parsed = supportSendBodySchema.safeParse(req.body);
        if (!parsed.success) {
          pushAdminLog({
            channel: "support",
            level: "warn",
            message: "POST support send validation failed",
            meta: { issues: parsed.error.flatten() },
          });
          res.status(400).json({ error: "Invalid body", details: parsed.error.errors });
          return;
        }

        const bodyWallet = parsed.data.walletAddress.trim();
        const conversationId = (parsed.data.conversationId?.trim() || bodyWallet).toLowerCase();
        const headerWallet = (req.headers["x-wallet-address"] as string | undefined)?.trim();
        const sessionId = (req.headers["x-session-id"] as string | undefined)?.trim();
        const asAdmin = isMasterAdminAddress(headerWallet);

        if (!asAdmin) {
          const owner = (headerWallet || sessionId || "").toLowerCase();
          if (!owner || owner !== conversationId) {
            pushAdminLog({
              channel: "support",
              level: "warn",
              message: "support/send denied (conversation owner mismatch)",
              meta: { conversationId },
            });
            res.status(403).json({ error: "Access denied" });
            return;
          }
          if (headerWallet && headerWallet.toLowerCase() !== bodyWallet.toLowerCase()) {
            res.status(403).json({ error: "walletAddress must match connected wallet" });
            return;
          }
        }

        let clientSentAt: Date;
        if (parsed.data.clientTimestamp) {
          const d = new Date(parsed.data.clientTimestamp);
          clientSentAt = Number.isNaN(d.getTime()) ? new Date() : d;
        } else {
          clientSentAt = new Date();
        }

        const messageData = {
          conversationId,
          senderType: asAdmin ? ("admin" as const) : ("user" as const),
          senderWallet: asAdmin ? null : bodyWallet.toLowerCase(),
          senderName: asAdmin
            ? "Support Team"
            : headerWallet
              ? `User ${headerWallet.slice(0, 6)}…${headerWallet.slice(-4)}`
              : "Guest",
          message: parsed.data.message,
          isRead: false,
          walletAddress: asAdmin ? null : bodyWallet.toLowerCase(),
          clientSentAt,
        };

        const validated = insertSupportMessageSchema.safeParse(messageData);
        if (!validated.success) {
          pushAdminLog({
            channel: "support",
            level: "warn",
            message: "support/send insert validation failed",
            meta: { details: validated.error.errors },
          });
          res.status(400).json({ error: "Invalid message payload", details: validated.error.errors });
          return;
        }

        pushAdminLog({
          channel: "support",
          level: "info",
          message: "support/send persisting ticket (Mongo)",
          meta: { conversationId, bytes: parsed.data.message.length },
        });

        const message = await insertSupportTicket(tickets, validated.data);
        emitSupportMessage(message);
        res.json(message);
      } catch (error) {
        console.error("[mongo-vault] support/send:", error);
        pushAdminLog({ channel: "support", level: "error", message: String(error) });
        res.status(500).json({ error: "Failed to send message" });
      }
    },

    async handleSupportMessagesPost(req: Request, res: Response): Promise<void> {
      try {
        const walletAddress =
          resolveWalletAddressFromRequest(req) || (req.headers["x-wallet-address"] as string | undefined);
        const sessionId = req.headers["x-session-id"] as string | undefined;
        const asAdmin = isMasterAdminAddress(walletAddress);
        const conversationId = String(req.body.conversationId || "").toLowerCase();

        if (!conversationId) {
          res.status(400).json({ error: "conversationId is required" });
          return;
        }

        if (!asAdmin) {
          const ownerIdentifier = (walletAddress || sessionId || "").toLowerCase();
          if (!ownerIdentifier || ownerIdentifier !== conversationId) {
            res.status(403).json({ error: "Can only send to your own conversation" });
            return;
          }
        }

        const messageData = {
          ...req.body,
          senderType: asAdmin ? "admin" : "user",
          senderWallet: asAdmin ? null : (walletAddress?.toLowerCase() || null),
          conversationId,
          walletAddress: asAdmin ? null : (walletAddress?.toLowerCase() ?? null),
          clientSentAt: req.body.clientSentAt ? new Date(req.body.clientSentAt) : null,
        };

        const validated = insertSupportMessageSchema.safeParse(messageData);
        if (!validated.success) {
          res.status(400).json({ error: "Invalid input", details: validated.error.errors });
          return;
        }
        const message = await insertSupportTicket(tickets, validated.data);
        emitSupportMessage(message);
        res.json(message);
      } catch (error) {
        console.error("[mongo-vault] POST /api/support/messages:", error);
        res.status(500).json({ error: "Failed to send message" });
      }
    },

    async handleGetSupportMessagesConversation(req: Request, res: Response): Promise<void> {
      try {
        const walletAddress = req.headers["x-wallet-address"] as string | undefined;
        const sessionId = req.headers["x-session-id"] as string | undefined;
        const conversationId = req.params.conversationId.toLowerCase();
        const master = isMasterAdminAddress(walletAddress);

        if (!master) {
          const ownerIdentifier = (walletAddress || sessionId || "").toLowerCase();
          if (!ownerIdentifier || ownerIdentifier !== conversationId) {
            res.status(403).json({ error: "Access denied" });
            return;
          }
        }

        const docs = await tickets
          .find({ conversationId })
          .sort({ createdAt: 1 })
          .toArray();
        res.json(docs.map((d) => rowToSupportMessage(d)));
      } catch (error) {
        console.error("[mongo-vault] GET support messages:", error);
        res.status(500).json({ error: "Failed to fetch messages" });
      }
    },

    async handleGetSupportConversations(req: Request, res: Response): Promise<void> {
      try {
        const walletAddress = resolveWalletAddressFromRequest(req);
        if (!isMasterAdminAddress(walletAddress)) {
          res.status(403).json({ error: "Master admin wallet required" });
          return;
        }
        const all = await tickets.find({}).sort({ createdAt: -1 }).toArray();
        const messages = all.map((d) => rowToSupportMessage(d));
        const conversationMap = new Map<string, SupportMessage[]>();
        for (const msg of messages) {
          const cid = msg.conversationId.toLowerCase();
          if (!conversationMap.has(cid)) conversationMap.set(cid, []);
          conversationMap.get(cid)!.push(msg);
        }
        const out = Array.from(conversationMap.entries()).map(([conversationId, msgs]) => ({
          conversationId,
          lastMessage: msgs[0],
          unreadCount: msgs.filter((m) => !m.isRead && m.senderType === "user").length,
        }));
        res.json(out);
      } catch (error) {
        console.error("[mongo-vault] GET /api/support/conversations:", error);
        res.status(500).json({ error: "Failed to fetch conversations" });
      }
    },

    async handleMarkSupportRead(req: Request, res: Response): Promise<void> {
      try {
        const walletAddress = req.headers["x-wallet-address"] as string | undefined;
        if (!isMasterAdminAddress(walletAddress)) {
          res.status(403).json({ error: "Master admin wallet required" });
          return;
        }
        const cid = req.params.conversationId.toLowerCase();
        await tickets.updateMany({ conversationId: cid }, { $set: { isRead: true } });
        res.json({ success: true });
      } catch (error) {
        console.error("[mongo-vault] mark read:", error);
        res.status(500).json({ error: "Failed to mark messages as read" });
      }
    },
  };
}

async function insertSupportTicket(
  coll: Collection<Document>,
  message: InsertSupportMessage,
): Promise<SupportMessage> {
  const id = randomUUID();
  const now = new Date();
  const doc = {
    id,
    senderType: message.senderType,
    senderWallet: message.senderWallet?.toLowerCase() || null,
    senderName: message.senderName || null,
    message: message.message,
    isRead: message.isRead || false,
    conversationId: message.conversationId.toLowerCase(),
    walletAddress: message.walletAddress?.toLowerCase() ?? null,
    clientSentAt: message.clientSentAt ?? null,
    createdAt: now,
  };
  await coll.insertOne(doc);
  return rowToSupportMessage(doc);
}

let cachedClient: MongoClient | null = null;

/** True after a successful vault/support Mongo connection this process (for /health). */
let mongoVaultBackendActive = false;

export function isMongoVaultBackendActive(): boolean {
  return mongoVaultBackendActive;
}

export function getMongoVaultHealth(): { uriConfigured: boolean; connected: boolean } {
  return {
    uriConfigured: !!resolveMongoVaultUri(),
    connected: mongoVaultBackendActive,
  };
}

/** Live ping — use for /api/system/status when the client is already marked connected. */
export async function pingMongoVault(): Promise<void> {
  const db = getVaultDb();
  if (!db) throw new Error("Mongo vault DB handle is not available");
  await db.admin().ping();
}

/** Prefer MONGODB_URI (standard); MONGO_VAULT_URI is optional alternate. */
export function resolveMongoVaultUri(): string {
  const primary = process.env.MONGODB_URI?.trim() || "";
  const alt = process.env.MONGO_VAULT_URI?.trim() || "";
  const uri = primary || alt;
  if (!uri || !/^mongodb(\+srv)?:\/\//i.test(uri)) return "";
  return uri;
}

const MONGO_CONNECT_MAX_ATTEMPTS = 5;

export async function tryConnectMongoVault(opts?: {
  /** Startup uses 5; background tick uses 1 to pair with `setInterval` retries. */
  maxAttempts?: number;
}): Promise<MongoVaultHandle | null> {
  const maxAttempts = Math.min(10, Math.max(1, opts?.maxAttempts ?? MONGO_CONNECT_MAX_ATTEMPTS));
  mongoVaultBackendActive = false;
  vaultDb = null;
  if (cachedClient) {
    try {
      await cachedClient.close();
    } catch {
      /* ignore */
    }
    cachedClient = null;
  }
  const uri = resolveMongoVaultUri();
  if (!uri) {
    const hasRawEnv = !!(process.env.MONGODB_URI?.trim() || process.env.MONGO_VAULT_URI?.trim());
    if (!hasRawEnv) {
      console.error("CRITICAL: MONGODB_URI is undefined.");
    } else {
      console.error(
        "CRITICAL: MONGODB_URI / MONGO_VAULT_URI is set but not a valid Mongo URL — use mongodb:// or mongodb+srv://",
      );
    }
    return null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      cachedClient = new MongoClient(uri, {
        serverSelectionTimeoutMS: 15_000,
        retryWrites: true,
      });
      await cachedClient.connect();
      console.log("DATABASE_SYNC_SUCCESS");
      console.log(
        `[mongo-vault] Connected to MongoDB (attempt ${attempt}/${maxAttempts}) — vault / CRM / support`,
      );
      const dbName = process.env.MONGODB_DB_NAME?.trim() || "equilibrium";
      const db = cachedClient.db(dbName);
      vaultDb = db;
      mongoVaultBackendActive = true;
      return createHandle(db);
    } catch (e) {
      console.error(`[mongo-vault] MongoDB connection failed (attempt ${attempt}/${maxAttempts}):`, e);
      mongoVaultBackendActive = false;
      vaultDb = null;
      if (cachedClient) {
        try {
          await cachedClient.close();
        } catch {
          /* ignore */
        }
        cachedClient = null;
      }
      if (attempt < maxAttempts) {
        const delayMs = 2000 * attempt;
        console.warn(`[mongo-vault] Retrying Mongo handshake in ${delayMs}ms…`);
        await sleep(delayMs);
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

