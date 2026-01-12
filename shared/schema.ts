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

// Re-export chat models
export * from "./models/chat";
