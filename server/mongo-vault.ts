import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { MongoClient, ObjectId, type Db, type Collection, type Document } from "mongodb";
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

const VIDEOS_COLL = process.env.MONGO_VIDEOS_COLLECTION || "vault_videos";
const SUPPORT_COLL = process.env.MONGO_SUPPORT_COLLECTION || "support_tickets";

/** Logical `users` / CRM store in MongoDB (`MONGO_USERS_COLLECTION` or `MONGO_CRM_COLLECTION`, default `crm_users`). */
export function mongoCrmUsersCollectionName(): string {
  return (
    process.env.MONGO_USERS_COLLECTION?.trim() ||
    process.env.MONGO_CRM_COLLECTION?.trim() ||
    "crm_users"
  );
}

let vaultDb: Db | null = null;

export function getVaultDb(): Db | null {
  return vaultDb;
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

function videoDocToApi(doc: Document & { _id: ObjectId }) {
  const created = doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt || Date.now());
  return {
    id: doc._id.toString(),
    title: String(doc.title ?? ""),
    description: String(doc.description ?? ""),
    duration: String(doc.duration ?? ""),
    category: String(doc.category ?? ""),
    youtubeId: doc.youtubeId != null ? String(doc.youtubeId) : null,
    videoPath: doc.videoPath != null ? String(doc.videoPath) : null,
    thumbnailPath: doc.thumbnailPath != null ? String(doc.thumbnailPath) : null,
    academySection: doc.academySection != null ? String(doc.academySection) : null,
    createdAt: created.toISOString(),
  };
}

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

/** Upsert CRM / users document when Mongo vault DB is connected (wallet connect, admin, Stripe sync). */
export async function upsertMongoCrmUserFromWallet(user: WalletUser): Promise<void> {
  if (!vaultDb) return;
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const wallet = user.walletAddress.toLowerCase();
  const now = new Date();
  const created =
    user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt || now);
  const doc: Record<string, unknown> = {
    wallet,
    walletAddress: wallet,
    email: user.email ?? null,
    joinDate: created,
    createdAt: created,
    updatedAt: now,
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
export async function fetchMongoCrmSubscriptionSnapshot(walletAddress: string): Promise<{
  subscriptionTier: string;
  subscriptionActive: boolean;
  subscriptionExpiresAt: Date | null;
  subTier: string;
} | null> {
  if (!vaultDb) return null;
  const coll = vaultDb.collection(mongoCrmUsersCollectionName());
  const w = walletAddress.trim().toLowerCase();
  const doc = await coll.findOne({ $or: [{ wallet: w }, { walletAddress: w }] });
  if (!doc) return null;
  const tierRaw = String(doc.subscriptionTier ?? "free").toLowerCase();
  const active = Boolean(doc.subscriptionActive);
  const expRaw = doc.accessExpires ?? doc.subscriptionExpiresAt;
  let subscriptionExpiresAt: Date | null = null;
  if (expRaw instanceof Date) subscriptionExpiresAt = expRaw;
  else if (expRaw != null && expRaw !== "") {
    const d = new Date(String(expRaw));
    subscriptionExpiresAt = Number.isNaN(d.getTime()) ? null : d;
  }
  const subTier =
    doc.subTier != null && String(doc.subTier).trim() !== ""
      ? String(doc.subTier)
      : crmDisplayTier(tierRaw);
  return {
    subscriptionTier: tierRaw,
    subscriptionActive: active,
    subscriptionExpiresAt,
    subTier,
  };
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
  return {
    wallet,
    email: u.email != null && u.email !== "" ? String(u.email) : null,
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
  const videos: Collection<Document> = db.collection(VIDEOS_COLL);
  const crm: Collection<Document> = db.collection(mongoCrmUsersCollectionName());
  const tickets: Collection<Document> = db.collection(SUPPORT_COLL);

  return {
    async handleGetVideos(_req: Request, res: Response): Promise<void> {
      try {
        const docs = await videos.find({}).sort({ createdAt: -1 }).toArray();
        res.json(docs.map((d) => videoDocToApi(d as Document & { _id: ObjectId })));
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
        if (!row.youtubeId?.trim() && !row.videoPath?.trim()) {
          res.status(400).json({ error: "Could not resolve video URL (YouTube, Vimeo, or direct link)" });
          return;
        }
        const now = new Date();
        const insertDoc: Record<string, unknown> = {
          title: String(row.title),
          description: String(row.description),
          duration: String(row.duration ?? ""),
          category: String(row.category),
          youtubeId: row.youtubeId?.trim() ? String(row.youtubeId).trim() : null,
          videoPath: row.videoPath?.trim() ? String(row.videoPath).trim() : null,
          thumbnailPath: row.thumbnailPath?.trim() ? String(row.thumbnailPath).trim() : null,
          academySection: row.academySection ? String(row.academySection) : null,
          createdAt: now,
        };
        const r = await videos.insertOne(insertDoc);
        res.json(
          videoDocToApi({
            ...insertDoc,
            _id: r.insertedId,
          } as Document & { _id: ObjectId }),
        );
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.error("[mongo-vault] POST /api/videos:", e);
        res.status(500).json({
          error: "Failed to create video",
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
        let deleted = 0;
        if (ObjectId.isValid(raw)) {
          try {
            const dr = await videos.deleteOne({ _id: new ObjectId(raw) });
            deleted = dr.deletedCount;
          } catch {
            /* ignore invalid hex */
          }
        }
        if (!deleted) {
          const dr = await videos.deleteOne({ id: raw });
          deleted = dr.deletedCount;
        }
        if (deleted) res.json({ success: true });
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
        const out = rows.map((u) => mongoDocToCrmRow(u));
        res.json(out.filter((r) => r.wallet));
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

/** Prefer MONGO_VAULT_URI so Mongo never conflicts with legacy MONGODB-as-Postgres-alias in db.ts. */
export function resolveMongoVaultUri(): string {
  const a = process.env.MONGO_VAULT_URI?.trim() || "";
  const b = process.env.MONGODB_URI?.trim() || "";
  const uri = a || b;
  if (!uri || !/^mongodb(\+srv)?:\/\//i.test(uri)) return "";
  return uri;
}

export async function tryConnectMongoVault(): Promise<MongoVaultHandle | null> {
  mongoVaultBackendActive = false;
  vaultDb = null;
  const uri = resolveMongoVaultUri();
  if (!uri) return null;
  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(uri);
      await cachedClient.connect();
      console.log("[mongo-vault] Connected to MongoDB (Admin / Educational Vault / Support)");
    }
    const dbName = process.env.MONGODB_DB_NAME?.trim() || "equilibrium";
    const db = cachedClient.db(dbName);
    vaultDb = db;
    mongoVaultBackendActive = true;
    return createHandle(db);
  } catch (e) {
    console.error("[mongo-vault] MongoDB connection failed:", e);
    mongoVaultBackendActive = false;
    vaultDb = null;
    cachedClient = null;
    return null;
  }
}

