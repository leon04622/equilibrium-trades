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

// Tutorial Videos
export interface TutorialVideo {
  id: string;
  title: string;
  description: string;
  duration: string;
  category: 'strategy' | 'platform' | 'tips';
  youtubeId?: string;
  videoPath?: string;
  thumbnailPath?: string;
  createdAt: Date;
}

export interface InsertTutorialVideo {
  title: string;
  description: string;
  duration: string;
  category: 'strategy' | 'platform' | 'tips';
  youtubeId?: string;
  videoPath?: string;
  thumbnailPath?: string;
}

export const insertVideoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  duration: z.string().optional().default(""),
  category: z.enum(["strategy", "platform", "tips"]),
  youtubeId: z.string().optional(),
  videoPath: z.string().optional(),
  thumbnailPath: z.string().optional(),
}).refine(data => data.youtubeId || data.videoPath, {
  message: "Either YouTube ID or uploaded video is required"
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

// Wallet User (for Hyperliquid onboarding)
export interface WalletUser {
  id: string;
  walletAddress: string;
  email: string | null;
  builderCodeApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertWalletUser {
  walletAddress: string;
  email?: string | null;
  builderCodeApproved?: boolean;
}

export const insertWalletUserSchema = z.object({
  walletAddress: z.string().min(1, "Wallet address is required"),
  email: z.string().email().optional().nullable(),
  builderCodeApproved: z.boolean().optional().default(false),
});

export type InsertWalletUserType = z.infer<typeof insertWalletUserSchema>;

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

// Re-export chat models
export * from "./models/chat";
