import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  subscriptionTier: text("subscription_tier").default("free"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Trading patterns library
export const patterns = pgTable("patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'continuation' | 'reversal'
  direction: text("direction").notNull(), // 'bullish' | 'bearish' | 'neutral'
  description: text("description").notNull(),
  howToIdentify: text("how_to_identify").notNull(),
  entryStrategy: text("entry_strategy").notNull(),
  exitStrategy: text("exit_strategy").notNull(),
  successRate: real("success_rate").notNull(),
  difficulty: text("difficulty").notNull(), // 'beginner' | 'intermediate' | 'advanced'
  iconName: text("icon_name").notNull(),
});

export const insertPatternSchema = createInsertSchema(patterns).omit({ id: true });
export type InsertPattern = z.infer<typeof insertPatternSchema>;
export type Pattern = typeof patterns.$inferSelect;

// Detected patterns (live signals)
export const detectedPatterns = pgTable("detected_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patternId: varchar("pattern_id").notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  confidence: real("confidence").notNull(),
  entryPrice: real("entry_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  status: text("status").default("forming"), // 'forming' | 'confirmed' | 'completed' | 'failed'
  detectedAt: timestamp("detected_at").default(sql`CURRENT_TIMESTAMP`),
  completedAt: timestamp("completed_at"),
  outcome: text("outcome"), // 'success' | 'failure' | null
});

export const insertDetectedPatternSchema = createInsertSchema(detectedPatterns).omit({ id: true, detectedAt: true });
export type InsertDetectedPattern = z.infer<typeof insertDetectedPatternSchema>;
export type DetectedPattern = typeof detectedPatterns.$inferSelect;

// SMA crossover signals
export const smaSignals = pgTable("sma_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  signalType: text("signal_type").notNull(), // 'bullish_cross' | 'bearish_cross'
  sma21Value: real("sma_21_value").notNull(),
  sma200Value: real("sma_200_value").notNull(),
  price: real("price").notNull(),
  above5mSma200: boolean("above_5m_sma_200").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertSmaSignalSchema = createInsertSchema(smaSignals).omit({ id: true, createdAt: true });
export type InsertSmaSignal = z.infer<typeof insertSmaSignalSchema>;
export type SmaSignal = typeof smaSignals.$inferSelect;

// Subscription tiers
export const subscriptionTiers = pgTable("subscription_tiers", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  price: real("price").notNull(),
  features: text("features").array().notNull(),
  hasLiquidityHeatmap: boolean("has_liquidity_heatmap").default(false),
  hasAiPatternDetection: boolean("has_ai_pattern_detection").default(false),
  hasAdvancedEducation: boolean("has_advanced_education").default(false),
});

export const insertSubscriptionTierSchema = createInsertSchema(subscriptionTiers);
export type InsertSubscriptionTier = z.infer<typeof insertSubscriptionTierSchema>;
export type SubscriptionTier = typeof subscriptionTiers.$inferSelect;

// Tutorial Videos - Database table for persistent storage
export const tutorialVideos = pgTable("tutorial_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  duration: text("duration").notNull().default(""),
  category: text("category").notNull(), // 'strategy' | 'platform' | 'tips'
  youtubeId: text("youtube_id"),
  videoPath: text("video_path"),
  thumbnailPath: text("thumbnail_path"),
  /** Educational Vault section: beginner_patterns | sma_masterclass | live_sessions */
  academySection: text("academy_section"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertTutorialVideoSchema = createInsertSchema(tutorialVideos).omit({ id: true, createdAt: true });
export type InsertTutorialVideo = z.infer<typeof insertTutorialVideoSchema>;
export type TutorialVideo = typeof tutorialVideos.$inferSelect;

const optionalTrimmed = z
  .string()
  .optional()
  .transform((s) => {
    if (s == null || s === "") return undefined;
    const t = s.trim();
    return t === "" ? undefined : t;
  });

export const academySectionSchema = z.enum([
  "beginner_patterns",
  "sma_masterclass",
  "live_sessions",
]);

export type AcademySection = z.infer<typeof academySectionSchema>;

export const insertVideoSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    description: z.string().trim().min(1, "Description is required"),
    duration: z.string().optional().default(""),
    category: z.enum(["strategy", "platform", "tips"]).optional(),
    youtubeId: optionalTrimmed,
    videoPath: optionalTrimmed,
    thumbnailPath: optionalTrimmed,
    academySection: academySectionSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.youtubeId && !data.videoPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "YouTube ID, video URL (Vimeo/MP4), or uploaded file path is required",
      });
    }
  })
  .transform((data) => {
    let category = data.category;
    if (!category) {
      if (data.academySection === "beginner_patterns") category = "strategy";
      else if (data.academySection === "sma_masterclass") category = "platform";
      else if (data.academySection === "live_sessions") category = "tips";
      else category = "strategy";
    }
    return {
      title: data.title,
      description: data.description,
      duration: data.duration || "",
      category,
      youtubeId: data.youtubeId,
      videoPath: data.videoPath,
      thumbnailPath: data.thumbnailPath,
      academySection: data.academySection ?? null,
    };
  });

function isValidAbsoluteHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Same-site uploaded file paths from `/api/uploads/files/…` (not valid `new URL()` without a base). */
function isSameSiteUploadMediaPath(s: string): boolean {
  const v = s.trim();
  return v.startsWith("/") && v.length > 1 && !v.startsWith("//");
}

const YT_ID_RE = /^[a-zA-Z0-9_-]{6,}$/;

/** Resolve YouTube watch / Shorts / Live / embed / youtu.be → video id; otherwise undefined (caller uses full URL as videoPath). */
export function extractYoutubeVideoIdFromUrl(raw: string): string | undefined {
  const t = raw.trim();
  if (t.startsWith("/") && !t.startsWith("//")) return undefined;
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const isYoutube =
      host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be";
    if (!isYoutube) return undefined;

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && YT_ID_RE.test(id) ? id : undefined;
    }

    const firstSeg = u.pathname.split("/").filter(Boolean)[0];
    const second = u.pathname.split("/").filter(Boolean)[1];
    if (firstSeg === "shorts" && second && YT_ID_RE.test(second)) return second;
    if (firstSeg === "embed" && second && YT_ID_RE.test(second)) return second;
    if (firstSeg === "live" && second && YT_ID_RE.test(second)) return second;

    const v = u.searchParams.get("v");
    if (v && YT_ID_RE.test(v)) return v;

    return undefined;
  } catch {
    return undefined;
  }
}

/** Vimeo watch / player URLs → numeric id for react-player (`https://vimeo.com/:id`). */
export function extractVimeoVideoIdFromUrl(raw: string): string | undefined {
  const t = raw.trim();
  if (t.startsWith("/") && !t.startsWith("//")) return undefined;
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "vimeo.com" && host !== "player.vimeo.com") return undefined;
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^\d+$/.test(last)) return last;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Admin Command Center / POST /api/videos — accepts videoUrl, thumbnailUrl, free-text category → DB row. */
export const adminVideoCreateSchema = z
  .object({
    /** Existing Mongo `_id` hex — when set, row is updated in place (upsert). */
    id: z.string().trim().optional(),
    title: z.string().trim().min(1, "Title is required"),
    description: z.string().trim().optional(),
    videoUrl: z.string().trim().min(1, "Video URL is required"),
    category: z.string().trim().optional().default(""),
    thumbnailUrl: z.string().trim().optional(),
    thumbnailPath: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const vUrl = data.videoUrl.trim();
    if (!isValidAbsoluteHttpUrl(vUrl) && !isSameSiteUploadMediaPath(vUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Video URL must be https://… or http://…, or a same-site path like /api/uploads/files/… after upload",
        path: ["videoUrl"],
      });
    }
    const thumb =
      (data.thumbnailUrl && data.thumbnailUrl.trim()) ||
      (data.thumbnailPath && data.thumbnailPath.trim()) ||
      "";
    if (thumb && !isValidAbsoluteHttpUrl(thumb) && !isSameSiteUploadMediaPath(thumb)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Thumbnail must be a valid http(s) URL or a path starting with /",
        path: ["thumbnailUrl"],
      });
    }
  })
  .transform((data) => {
    const url = data.videoUrl.trim();
    const yt = extractYoutubeVideoIdFromUrl(url);
    const vim = extractVimeoVideoIdFromUrl(url);
    let youtubeId: string | undefined;
    let videoPath: string | undefined;
    if (yt) {
      youtubeId = yt;
      videoPath = undefined;
    } else if (vim) {
      youtubeId = undefined;
      videoPath = `https://vimeo.com/${vim}`;
    } else {
      youtubeId = undefined;
      videoPath = url;
    }

    const rawCat = (data.category || "").trim();
    const catLower = rawCat.toLowerCase();
    let academySection: AcademySection = "beginner_patterns";
    let categoryOut = rawCat || "Beginner Patterns";

    if (
      /beginner|pattern|strategy|continuation|reversal/.test(catLower) ||
      catLower.includes("beginner patterns")
    ) {
      academySection = "beginner_patterns";
      categoryOut = rawCat || "Beginner Patterns";
    } else if (/sma|masterclass|platform|21|200/.test(catLower) || catLower.includes("sma")) {
      academySection = "sma_masterclass";
      categoryOut = rawCat || "SMA Masterclass";
    } else if (/live|session|walkthrough|tips/.test(catLower)) {
      academySection = "live_sessions";
      categoryOut = rawCat || "Live Trading Sessions";
    }

    const thumb =
      (data.thumbnailUrl && data.thumbnailUrl.trim()) ||
      (data.thumbnailPath && data.thumbnailPath.trim()) ||
      undefined;

    const desc = (data.description && data.description.trim()) || data.title.trim();
    const existingId = data.id?.trim();

    return {
      ...(existingId ? { id: existingId } : {}),
      title: data.title.trim(),
      description: desc,
      duration: "" as const,
      category: categoryOut.slice(0, 200),
      youtubeId,
      videoPath,
      thumbnailPath: thumb,
      academySection,
    };
  });

export type AdminVideoCreateInput = z.infer<typeof adminVideoCreateSchema>;

/** Admin dashboard + payment webhooks — persist tier to Postgres + Mongo CRM sync. */
export const adminUpdateTierBodySchema = z.object({
  walletAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/i, "Invalid wallet address"),
  newTier: z.string().trim().min(1),
  /** ISO-8601 end of access; omit for open-ended manual grants. */
  accessExpires: z.union([z.string(), z.null()]).optional(),
});

export type AdminUpdateTierBody = z.infer<typeof adminUpdateTierBodySchema>;

/** Command Center “Grant access” — same persistence as PATCH /api/admin/update-tier (Postgres upsert + Mongo CRM). */
export const adminSetAccessBodySchema = z.object({
  walletAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/i, "Invalid wallet address"),
  /** Pro | Mentor | Free (any casing; Mentor = mentoring tier) */
  targetTier: z.string().trim().min(1),
});

export type AdminSetAccessBody = z.infer<typeof adminSetAccessBodySchema>;

// Wallet Users - Database table for persistent storage
export const walletUsers = pgTable("wallet_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  email: text("email"),
  builderCodeApproved: boolean("builder_code_approved").default(false),
  /** Lifetime HL builder fee + agent handshake complete — synced to Mongo CRM `isBuilderLinked`. */
  isBuilderLinked: boolean("is_builder_linked").default(false),
  /** Admin “Grant Pro” / Alpha — keeps Pro access even if Stripe shows no active subscription. */
  manualProOverride: boolean("manual_pro_override").default(false),
  /** e.g. none | referred | builder_linked | handshake_complete */
  referralBuilderStatus: text("referral_builder_status"),
  /** Set when user completes instant-trading (HL agent) handshake on the client. */
  instantTradingCompletedAt: timestamp("instant_trading_completed_at"),
  subscriptionTier: text("subscription_tier").default("free"),
  subscriptionActive: boolean("subscription_active").default(false),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  subscribedAt: timestamp("subscribed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Frontend-only types for pattern definitions
export interface PatternDefinition {
  id: string;
  name: string;
  type: 'continuation' | 'reversal';
  direction: 'bullish' | 'bearish' | 'neutral';
  description: string;
  howToIdentify: string[];
  entryStrategy: string;
  exitStrategy: string;
  successRate: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  iconName: string;
  svgPath?: string;
}

export interface LivePattern {
  id: string;
  pattern: PatternDefinition;
  symbol: string;
  timeframe: string;
  confidence: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'forming' | 'confirmed' | 'completed' | 'failed';
  detectedAt: Date;
}

export interface MarketCondition {
  symbol: string;
  currentPrice: number;
  sma21_1m: number;
  sma200_1m: number;
  sma200_5m: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  crossoverActive: boolean;
  above5mSma200: boolean;
}

// Trade Grading Types
export interface TradeGrade {
  id: string;
  walletAddress: string;
  coin: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  leverage: number;
  size: number;
  pnl: number;
  pnlPercent: number;
  
  // Grading scores (0-100)
  entryScore: number;       // How close to pattern breakout
  stopScore: number;        // Stop placement quality (proper distance)
  rrScore: number;          // Risk/Reward adherence
  leverageScore: number;    // Appropriate leverage for setup
  setupScore: number;       // Valid pattern/setup identification
  
  // Overall scores
  totalScore: number;       // Combined score /100
  setupGrade: "A" | "B" | "C" | "D" | "F";
  executionGrade: "A" | "B" | "C" | "D" | "F";
  
  // Metadata
  patternType?: string;
  timeframe?: string;
  notes: string[];          // Auto-generated feedback
  tradedAt: Date;
  gradedAt: Date;
}

export interface WeeklyStats {
  weekStart: Date;
  weekEnd: Date;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgScore: number;
  disciplineScore: number;  // Consistency in following rules
  totalPnl: number;
  bestTrade?: TradeGrade;
  worstTrade?: TradeGrade;
}

export type InsertTradeGrade = Omit<TradeGrade, "id" | "gradedAt">;

// Zod schema for trade grading input validation
export const tradeGradeInputSchema = z.object({
  walletAddress: z.string().min(1),
  coin: z.string().min(1),
  side: z.enum(["long", "short"]),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  leverage: z.number().min(1).default(1),
  size: z.number().positive().default(1),
  patternType: z.string().optional(),
  timeframe: z.string().optional(),
});

export type TradeGradeInput = z.infer<typeof tradeGradeInputSchema>;

// ── Professional Trade Journal (Mongo `trade_journal` + in-memory fallback) ──

export type TradeJournalPatternStatus = "forming" | "developed" | "breakout_watch";

export interface TradeJournalEntry {
  id: string;
  walletAddress: string;
  /** Display pair e.g. BTC/USDT */
  pair: string;
  /** Hyperliquid coin identifier */
  coin: string;
  side: "long" | "short";
  entryPrice: number;
  size: number;
  openedAt: string;
  stopLoss: number | null;
  takeProfit: number | null;
  leverage: number;
  notes: string;
  patternStatusAtEntry: TradeJournalPatternStatus | null;
  /** A = entered during a Developed AI pattern; otherwise Speculative */
  entryGrade: "A" | "Speculative";
  negativeRR: boolean;
  rewardRiskRatio: number | null;
  status: "open" | "closed";
  exitPrice: number | null;
  realizedPnl: number | null;
  closedAt: string | null;
}

export interface TradeJournalStats {
  winRatePercent: number | null;
  avgRewardRisk: number | null;
  totalProfitLoss: number | null;
  closedTradesCount: number;
  openTradesCount: number;
  /** `mongodb` = history survives deploy/restart; `memory` = server process only (set MONGO_VAULT_URI). */
  storageBackend: "mongodb" | "memory";
}

export const tradeJournalCreateBodySchema = z.object({
  walletAddress: z.string().min(1),
  pair: z.string().min(1),
  coin: z.string().min(1),
  side: z.enum(["long", "short"]),
  entryPrice: z.coerce.number().positive(),
  size: z.coerce.number().positive(),
  stopLoss: z.coerce.number().positive().optional().nullable(),
  takeProfit: z.coerce.number().positive().optional().nullable(),
  leverage: z.coerce.number().min(1).optional().default(1),
  patternStatusAtEntry: z.enum(["forming", "developed", "breakout_watch"]).nullable().optional(),
  openedAt: z.string().optional(),
});

export const tradeJournalNotesBodySchema = z.object({
  notes: z.string().max(4000).default(""),
});

export const tradeJournalCloseOpenBodySchema = z.object({
  coin: z.string().min(1),
  side: z.enum(["long", "short"]),
  exitPrice: z.coerce.number().positive(),
  realizedPnl: z.coerce.number(),
});

export type TradeJournalCreateBody = z.infer<typeof tradeJournalCreateBodySchema>;

/** Stored in wallet_users.subscription_tier. Legacy DB rows may still say `elite` — normalize to mentoring when reading. */
export type WalletSubscriptionTier = "free" | "pro" | "mentoring";

const tierInputSchema = z.enum(["free", "pro", "mentoring", "elite"]).transform((t) => (t === "elite" ? "mentoring" : t));

// Wallet User (for Hyperliquid onboarding)
export interface WalletUser {
  id: string;
  walletAddress: string;
  email: string | null;
  builderCodeApproved: boolean;
  isBuilderLinked: boolean;
  manualProOverride: boolean;
  referralBuilderStatus: string | null;
  instantTradingCompletedAt: Date | null;
  subscriptionTier: WalletSubscriptionTier;
  subscriptionActive: boolean;
  subscriptionExpiresAt: Date | null;
  subscribedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertWalletUser {
  walletAddress: string;
  email?: string | null;
  builderCodeApproved?: boolean;
  isBuilderLinked?: boolean;
  manualProOverride?: boolean;
  referralBuilderStatus?: string | null;
  instantTradingCompletedAt?: Date | null;
  subscriptionTier?: WalletSubscriptionTier | "elite";
  subscriptionActive?: boolean;
}

export const insertWalletUserSchema = z.object({
  walletAddress: z.string().min(1, "Wallet address is required"),
  email: z.string().email().optional().nullable(),
  builderCodeApproved: z.boolean().optional().default(false),
  isBuilderLinked: z.boolean().optional().default(false),
  subscriptionTier: tierInputSchema.optional().default("free"),
  subscriptionActive: z.boolean().optional().default(false),
});

export type InsertWalletUserType = z.infer<typeof insertWalletUserSchema>;

// Subscription update schema for admin
export const updateSubscriptionSchema = z.object({
  walletAddress: z.string().min(1),
  subscriptionTier: tierInputSchema,
  subscriptionActive: z.boolean(),
  subscriptionExpiresAt: z.string().optional().nullable(),
  /** When set, updates builder onboarding flag (e.g. pre-approve test wallets). */
  builderCodeApproved: z.boolean().optional(),
  /** Explicit admin bypass for Pro without Stripe (Grant Pro). */
  manualProOverride: z.boolean().optional(),
});

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

// Builder Code Approval
export interface BuilderCodeApproval {
  walletAddress: string;
  signature: string;
  message: string;
  approvedAt: Date;
}

export const builderCodeApprovalSchema = z.object({
  walletAddress: z.string().min(1),
  signature: z.string().min(1),
  message: z.string().min(1),
});

export type BuilderCodeApprovalInput = z.infer<typeof builderCodeApprovalSchema>;

// Support tickets (persisted messages; replaces legacy support_messages table name in app code)
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderType: text("sender_type").notNull(), // 'user' | 'admin'
  senderWallet: text("sender_wallet"),
  senderName: text("sender_name"),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  conversationId: text("conversation_id").notNull(),
  /** End-user wallet when sender is user (for auditing; may match conversationId). */
  walletAddress: text("wallet_address"),
  clientSentAt: timestamp("client_sent_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true });
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

/** @deprecated use SupportTicket */
export type SupportMessage = SupportTicket;
/** @deprecated use insertSupportTicketSchema */
export const insertSupportMessageSchema = insertSupportTicketSchema;
/** @deprecated use insertSupportTicketSchema */
export type InsertSupportMessage = InsertSupportTicket;

/** User chat + `/api/support/message` may send `messageContent` instead of `message`; `wallet` aliases `walletAddress`. */
export const supportSendBodySchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      const msg = o.message ?? o.messageContent;
      const wa = o.walletAddress ?? o.wallet;
      return { ...o, message: msg, walletAddress: wa };
    }
    return raw;
  },
  z.object({
    message: z.string().min(1).max(8000),
    walletAddress: z.string().min(1),
    conversationId: z.string().min(1).optional(),
    clientTimestamp: z.string().optional(),
  }),
);
export type SupportSendBody = z.infer<typeof supportSendBodySchema>;

// Email leads capture
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  name: text("name"),
  source: text("source").default("landing"),
  walletAddress: text("wallet_address"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

// Built-in admin wallet (Stripe tier bypass, etc.). Command Center is fortress-only in `server/fortress-admin.ts`.
export const adminWallets = ["0x115560812df8e7515eecc957b6796531e936edd9"];

/**
 * Frontend + `/api/user/sync` **always-Pro** bypass (ignores flaky subscription hydration).
 * Second principal (`0x2cbf…be6b`): set full hex in `MASTER_BYPASS_WALLET_2` (server) and `VITE_MASTER_BYPASS_WALLET_2` (client build).
 */
export const MASTER_BYPASS_WALLET_ADDRESSES: readonly string[] = [
  "0x115560812df8e7515eecc957b6796531e936edd9",
];

export function isAdminWallet(walletAddress: string | null): boolean {
  if (!walletAddress) return false;
  const a = walletAddress.toLowerCase();
  return adminWallets.some((w) => w.toLowerCase() === a);
}

export function isMasterBypassWalletInList(walletAddress: string | null | undefined): boolean {
  if (!walletAddress?.trim()) return false;
  const a = walletAddress.trim().toLowerCase();
  return MASTER_BYPASS_WALLET_ADDRESSES.some((w) => w.toLowerCase() === a);
}

// Re-export chat models
export * from "./models/chat";
