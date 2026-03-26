import { 
  type User, type InsertUser, 
  type Pattern, type InsertPattern,
  type DetectedPattern, type InsertDetectedPattern,
  type SmaSignal, type InsertSmaSignal,
  type SubscriptionTier, type InsertSubscriptionTier,
  type TradeGrade, type InsertTradeGrade, type WeeklyStats,
  type TutorialVideo, type InsertTutorialVideo,
  type WalletUser, type InsertWalletUser,
  type WalletSubscriptionTier,
  type SupportMessage, type InsertSupportMessage,
  type Lead, type InsertLead,
  tutorialVideos, supportTickets, walletUsers, leads
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

let dbAvailable: boolean | null = null;
let lastDbCheck = 0;
const DB_CHECK_INTERVAL = 30_000;

function normalizeWalletTier(raw: string | null | undefined): WalletSubscriptionTier {
  const t = (raw || "free").toLowerCase();
  if (t === "elite" || t === "mentoring") return "mentoring";
  if (t === "pro") return "pro";
  return "free";
}

function tierForDb(tier?: WalletSubscriptionTier | "elite"): string {
  const t = tier ?? "free";
  return t === "elite" ? "mentoring" : t;
}

async function isDbUp(): Promise<boolean> {
  if (!db) return false;
  const now = Date.now();
  if (dbAvailable !== null && now - lastDbCheck < DB_CHECK_INTERVAL) {
    return dbAvailable;
  }
  try {
    await db.execute("SELECT 1" as any);
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  lastDbCheck = now;
  return dbAvailable;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Patterns
  getAllPatterns(): Promise<Pattern[]>;
  getPattern(id: string): Promise<Pattern | undefined>;
  createPattern(pattern: InsertPattern): Promise<Pattern>;
  
  // Detected Patterns
  getActivePatterns(): Promise<DetectedPattern[]>;
  getPatternsBySymbol(symbol: string): Promise<DetectedPattern[]>;
  createDetectedPattern(pattern: InsertDetectedPattern): Promise<DetectedPattern>;
  updatePatternStatus(id: string, status: string, outcome?: string): Promise<DetectedPattern | undefined>;
  
  // SMA Signals
  getRecentSmaSignals(limit?: number): Promise<SmaSignal[]>;
  createSmaSignal(signal: InsertSmaSignal): Promise<SmaSignal>;
  
  // Subscription Tiers
  getAllSubscriptionTiers(): Promise<SubscriptionTier[]>;
  getSubscriptionTier(id: string): Promise<SubscriptionTier | undefined>;
  
  // Trade Grades
  getTradeGrades(walletAddress: string, limit?: number): Promise<TradeGrade[]>;
  getTradeGrade(id: string): Promise<TradeGrade | undefined>;
  createTradeGrade(grade: InsertTradeGrade): Promise<TradeGrade>;
  getWeeklyStats(walletAddress: string): Promise<WeeklyStats | null>;
  
  // Tutorial Videos
  getAllVideos(): Promise<TutorialVideo[]>;
  getVideo(id: string): Promise<TutorialVideo | undefined>;
  createVideo(video: InsertTutorialVideo): Promise<TutorialVideo>;
  deleteVideo(id: string): Promise<boolean>;
  
  // Wallet Users (Hyperliquid onboarding)
  getWalletUser(walletAddress: string): Promise<WalletUser | undefined>;
  getAllWalletUsers(): Promise<WalletUser[]>;
  createWalletUser(user: InsertWalletUser): Promise<WalletUser>;
  updateWalletUserApproval(walletAddress: string, approved: boolean): Promise<WalletUser | undefined>;
  updateWalletUserEmail(walletAddress: string, email: string): Promise<WalletUser | undefined>;
  updateWalletUserSubscription(walletAddress: string, tier: WalletSubscriptionTier | 'elite', active: boolean, expiresAt?: Date | null): Promise<WalletUser | undefined>;
  setManualProOverride(walletAddress: string, value: boolean): Promise<WalletUser | undefined>;
  recordInstantTradingHandshake(walletAddress: string): Promise<WalletUser | undefined>;
  
  // Support Messages
  getMessages(conversationId: string): Promise<SupportMessage[]>;
  getAllSupportMessages(limit?: number): Promise<SupportMessage[]>;
  getAllConversations(): Promise<{ conversationId: string; lastMessage: SupportMessage; unreadCount: number }[]>;
  createMessage(message: InsertSupportMessage): Promise<SupportMessage>;
  markMessagesAsRead(conversationId: string): Promise<void>;

  // Leads
  createLead(lead: InsertLead): Promise<Lead>;
  getAllLeads(): Promise<Lead[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private patterns: Map<string, Pattern>;
  private detectedPatterns: Map<string, DetectedPattern>;
  private smaSignals: Map<string, SmaSignal>;
  private subscriptionTiers: Map<string, SubscriptionTier>;
  private tradeGrades: Map<string, TradeGrade>;
  private walletUsersCache: Map<string, WalletUser>;
  /** In-memory tutorial videos when DATABASE_URL is unset (dev / no DB). */
  private tutorialVideosMem: TutorialVideo[] = [];
  /** In-memory support tickets when DATABASE_URL is unset — chat send/receive works for the running server process. */
  private supportTicketsMem: SupportMessage[] = [];

  constructor() {
    this.users = new Map();
    this.patterns = new Map();
    this.detectedPatterns = new Map();
    this.smaSignals = new Map();
    this.subscriptionTiers = new Map();
    this.tradeGrades = new Map();
    this.walletUsersCache = new Map();
    
    this.initializeSubscriptionTiers();
  }

  private initializeSubscriptionTiers() {
    const tiers: SubscriptionTier[] = [
      {
        id: "starter",
        name: "Starter",
        price: 0,
        features: [
          "Access to pattern library",
          "Basic TradingView charts",
          "5 educational modules",
          "21 & 200 SMA indicators",
          "Community support",
        ],
        hasLiquidityHeatmap: false,
        hasAiPatternDetection: false,
        hasAdvancedEducation: false,
      },
      {
        id: "pro",
        name: "Pro",
        price: 49,
        features: [
          "Everything in Starter",
          "AI-powered pattern detection",
          "Real-time pattern alerts",
          "Advanced educational content",
          "SMA crossover signals",
          "Trade setup recommendations",
          "Priority support",
        ],
        hasLiquidityHeatmap: false,
        hasAiPatternDetection: true,
        hasAdvancedEducation: true,
      },
      {
        id: "elite",
        name: "Elite",
        price: 149,
        features: [
          "Everything in Pro",
          "Liquidity Heatmap (like Bookmap)",
          "Order flow analysis",
          "Institutional level detection",
          "Custom pattern alerts",
          "1-on-1 trading coaching",
          "Private Discord access",
          "Early access to new features",
        ],
        hasLiquidityHeatmap: true,
        hasAiPatternDetection: true,
        hasAdvancedEducation: true,
      },
    ];

    tiers.forEach(tier => this.subscriptionTiers.set(tier.id, tier));
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id, 
      subscriptionTier: "free",
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  // Patterns
  async getAllPatterns(): Promise<Pattern[]> {
    return Array.from(this.patterns.values());
  }

  async getPattern(id: string): Promise<Pattern | undefined> {
    return this.patterns.get(id);
  }

  async createPattern(pattern: InsertPattern): Promise<Pattern> {
    const id = randomUUID();
    const newPattern: Pattern = { ...pattern, id };
    this.patterns.set(id, newPattern);
    return newPattern;
  }

  // Detected Patterns
  async getActivePatterns(): Promise<DetectedPattern[]> {
    return Array.from(this.detectedPatterns.values()).filter(
      p => p.status === "forming" || p.status === "confirmed"
    );
  }

  async getPatternsBySymbol(symbol: string): Promise<DetectedPattern[]> {
    return Array.from(this.detectedPatterns.values()).filter(
      p => p.symbol === symbol
    );
  }

  async createDetectedPattern(pattern: InsertDetectedPattern): Promise<DetectedPattern> {
    const id = randomUUID();
    const newPattern: DetectedPattern = { 
      id,
      patternId: pattern.patternId,
      symbol: pattern.symbol,
      timeframe: pattern.timeframe,
      confidence: pattern.confidence,
      entryPrice: pattern.entryPrice ?? null,
      stopLoss: pattern.stopLoss ?? null,
      takeProfit: pattern.takeProfit ?? null,
      status: pattern.status ?? "forming",
      detectedAt: new Date(),
      completedAt: null,
      outcome: null
    };
    this.detectedPatterns.set(id, newPattern);
    return newPattern;
  }

  async updatePatternStatus(id: string, status: string, outcome?: string): Promise<DetectedPattern | undefined> {
    const pattern = this.detectedPatterns.get(id);
    if (pattern) {
      pattern.status = status;
      if (outcome) pattern.outcome = outcome;
      if (status === "completed" || status === "failed") {
        pattern.completedAt = new Date();
      }
      this.detectedPatterns.set(id, pattern);
    }
    return pattern;
  }

  // SMA Signals
  async getRecentSmaSignals(limit: number = 20): Promise<SmaSignal[]> {
    return Array.from(this.smaSignals.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }

  async createSmaSignal(signal: InsertSmaSignal): Promise<SmaSignal> {
    const id = randomUUID();
    const newSignal: SmaSignal = { 
      ...signal, 
      id, 
      createdAt: new Date(),
      above5mSma200: signal.above5mSma200 ?? null
    };
    this.smaSignals.set(id, newSignal);
    return newSignal;
  }

  // Subscription Tiers
  async getAllSubscriptionTiers(): Promise<SubscriptionTier[]> {
    return Array.from(this.subscriptionTiers.values());
  }

  async getSubscriptionTier(id: string): Promise<SubscriptionTier | undefined> {
    return this.subscriptionTiers.get(id);
  }

  // Trade Grades
  async getTradeGrades(walletAddress: string, limit: number = 50): Promise<TradeGrade[]> {
    return Array.from(this.tradeGrades.values())
      .filter(g => g.walletAddress.toLowerCase() === walletAddress.toLowerCase())
      .sort((a, b) => b.tradedAt.getTime() - a.tradedAt.getTime())
      .slice(0, limit);
  }

  async getTradeGrade(id: string): Promise<TradeGrade | undefined> {
    return this.tradeGrades.get(id);
  }

  async createTradeGrade(grade: InsertTradeGrade): Promise<TradeGrade> {
    const id = randomUUID();
    const newGrade: TradeGrade = {
      ...grade,
      id,
      gradedAt: new Date(),
    };
    this.tradeGrades.set(id, newGrade);
    return newGrade;
  }

  async getWeeklyStats(walletAddress: string): Promise<WeeklyStats | null> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    
    const weekTrades = Array.from(this.tradeGrades.values())
      .filter(g => 
        g.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
        g.tradedAt >= weekStart &&
        g.tradedAt < weekEnd
      );
    
    if (weekTrades.length === 0) return null;
    
    const winningTrades = weekTrades.filter(t => t.pnl > 0);
    const losingTrades = weekTrades.filter(t => t.pnl <= 0);
    const avgScore = weekTrades.reduce((sum, t) => sum + t.totalScore, 0) / weekTrades.length;
    const totalPnl = weekTrades.reduce((sum, t) => sum + t.pnl, 0);
    
    // Discipline score: consistency in following rules (entry, stop, RR)
    const avgEntryScore = weekTrades.reduce((sum, t) => sum + t.entryScore, 0) / weekTrades.length;
    const avgStopScore = weekTrades.reduce((sum, t) => sum + t.stopScore, 0) / weekTrades.length;
    const avgRRScore = weekTrades.reduce((sum, t) => sum + t.rrScore, 0) / weekTrades.length;
    const disciplineScore = Math.round((avgEntryScore + avgStopScore + avgRRScore) / 3);
    
    const sortedByPnl = [...weekTrades].sort((a, b) => b.pnl - a.pnl);
    
    return {
      weekStart,
      weekEnd,
      totalTrades: weekTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgScore: Math.round(avgScore),
      disciplineScore,
      totalPnl,
      bestTrade: sortedByPnl[0],
      worstTrade: sortedByPnl[sortedByPnl.length - 1],
    };
  }

  // Tutorial Videos - database when configured; otherwise in-memory (same process lifetime)
  async getAllVideos(): Promise<TutorialVideo[]> {
    if (!db) {
      return [...this.tutorialVideosMem].sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      );
    }
    try {
      const videos = await db.select().from(tutorialVideos).orderBy(desc(tutorialVideos.createdAt));
      return videos;
    } catch (err) {
      console.error("[videos] getAllVideos DB error (returning empty list):", err);
      return [];
    }
  }

  async getVideo(id: string): Promise<TutorialVideo | undefined> {
    if (!db) {
      return this.tutorialVideosMem.find((v) => v.id === id);
    }
    try {
      const [video] = await db.select().from(tutorialVideos).where(eq(tutorialVideos.id, id));
      return video;
    } catch {
      return undefined;
    }
  }

  async createVideo(video: InsertTutorialVideo): Promise<TutorialVideo> {
    const row: TutorialVideo = {
      id: randomUUID(),
      title: video.title,
      description: video.description,
      duration: video.duration || "",
      category: video.category,
      youtubeId: video.youtubeId ?? null,
      videoPath: video.videoPath ?? null,
      thumbnailPath: video.thumbnailPath ?? null,
      academySection: video.academySection ?? null,
      createdAt: new Date(),
    };
    if (!db) {
      this.tutorialVideosMem.unshift(row);
      return row;
    }
    const [newVideo] = await db
      .insert(tutorialVideos)
      .values({
        title: video.title,
        description: video.description,
        duration: video.duration || "",
        category: video.category,
        youtubeId: video.youtubeId || null,
        videoPath: video.videoPath || null,
        thumbnailPath: video.thumbnailPath || null,
        academySection: video.academySection ?? null,
      })
      .returning();
    return newVideo;
  }

  async deleteVideo(id: string): Promise<boolean> {
    if (!db) {
      const i = this.tutorialVideosMem.findIndex((v) => v.id === id);
      if (i >= 0) {
        this.tutorialVideosMem.splice(i, 1);
        return true;
      }
      return false;
    }
    try {
      const result = await db.delete(tutorialVideos).where(eq(tutorialVideos.id, id)).returning();
      return result.length > 0;
    } catch {
      return false;
    }
  }

  // Wallet Users (Hyperliquid onboarding) - Using database with in-memory fallback
  private mapDbUser(user: any): WalletUser {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      builderCodeApproved: user.builderCodeApproved ?? false,
      manualProOverride: user.manualProOverride ?? false,
      referralBuilderStatus: user.referralBuilderStatus ?? null,
      instantTradingCompletedAt: user.instantTradingCompletedAt ?? null,
      subscriptionTier: normalizeWalletTier(user.subscriptionTier),
      subscriptionActive: user.subscriptionActive ?? false,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      subscribedAt: user.subscribedAt ?? null,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };
  }

  async getWalletUser(walletAddress: string): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    try {
      if (!db) return this.walletUsersCache.get(normalizedAddress);
      const [user] = await db.select().from(walletUsers).where(eq(walletUsers.walletAddress, normalizedAddress));
      if (user) {
        const mapped = this.mapDbUser(user);
        this.walletUsersCache.set(normalizedAddress, mapped);
        return mapped;
      }
      return this.walletUsersCache.get(normalizedAddress);
    } catch {
      return this.walletUsersCache.get(normalizedAddress);
    }
  }

  async getAllWalletUsers(): Promise<WalletUser[]> {
    try {
      if (!db) return Array.from(this.walletUsersCache.values());
      const users = await db.select().from(walletUsers).orderBy(desc(walletUsers.createdAt));
      return users.map(u => this.mapDbUser(u));
    } catch {
      return Array.from(this.walletUsersCache.values());
    }
  }

  async createWalletUser(user: InsertWalletUser): Promise<WalletUser> {
    const normalizedAddress = user.walletAddress.toLowerCase();
    const now = new Date();
    const fallback: WalletUser = {
      id: randomUUID(),
      walletAddress: normalizedAddress,
      email: user.email ?? null,
      builderCodeApproved: user.builderCodeApproved ?? false,
      manualProOverride: user.manualProOverride ?? false,
      referralBuilderStatus: user.referralBuilderStatus ?? null,
      instantTradingCompletedAt: user.instantTradingCompletedAt ?? null,
      subscriptionTier: normalizeWalletTier(user.subscriptionTier),
      subscriptionActive: user.subscriptionActive ?? false,
      subscriptionExpiresAt: null,
      subscribedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      if (!db) {
        this.walletUsersCache.set(normalizedAddress, fallback);
        return fallback;
      }
      const [newUser] = await db.insert(walletUsers).values({
        walletAddress: normalizedAddress,
        email: user.email ?? null,
        builderCodeApproved: user.builderCodeApproved ?? false,
        manualProOverride: user.manualProOverride ?? false,
        referralBuilderStatus: user.referralBuilderStatus ?? null,
        instantTradingCompletedAt: user.instantTradingCompletedAt ?? null,
        subscriptionTier: tierForDb(user.subscriptionTier as WalletSubscriptionTier | "elite" | undefined),
        subscriptionActive: user.subscriptionActive ?? false,
      }).returning();
      const mapped = this.mapDbUser(newUser);
      this.walletUsersCache.set(normalizedAddress, mapped);
      return mapped;
    } catch {
      this.walletUsersCache.set(normalizedAddress, fallback);
      return fallback;
    }
  }

  async updateWalletUserApproval(walletAddress: string, approved: boolean): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    try {
      if (!db) {
        const cached = this.walletUsersCache.get(normalizedAddress);
        if (cached) {
          cached.builderCodeApproved = approved;
          cached.updatedAt = new Date();
          return cached;
        }
        return undefined;
      }
      const [user] = await db.update(walletUsers)
        .set({ builderCodeApproved: approved, updatedAt: new Date() })
        .where(eq(walletUsers.walletAddress, normalizedAddress))
        .returning();
      if (!user) {
        const cached = this.walletUsersCache.get(normalizedAddress);
        if (cached) {
          cached.builderCodeApproved = approved;
          cached.updatedAt = new Date();
          return cached;
        }
        return undefined;
      }
      const mapped = this.mapDbUser(user);
      this.walletUsersCache.set(normalizedAddress, mapped);
      return mapped;
    } catch {
      const cached = this.walletUsersCache.get(normalizedAddress);
      if (cached) {
        cached.builderCodeApproved = approved;
        cached.updatedAt = new Date();
        return cached;
      }
      return undefined;
    }
  }

  async updateWalletUserEmail(walletAddress: string, email: string): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    try {
      if (!db) {
        const cached = this.walletUsersCache.get(normalizedAddress);
        if (cached) {
          cached.email = email;
          cached.updatedAt = new Date();
          return cached;
        }
        return undefined;
      }
      const [user] = await db.update(walletUsers)
        .set({ email, updatedAt: new Date() })
        .where(eq(walletUsers.walletAddress, normalizedAddress))
        .returning();
      if (!user) return undefined;
      const mapped = this.mapDbUser(user);
      this.walletUsersCache.set(normalizedAddress, mapped);
      return mapped;
    } catch {
      const cached = this.walletUsersCache.get(normalizedAddress);
      if (cached) {
        cached.email = email;
        cached.updatedAt = new Date();
        return cached;
      }
      return undefined;
    }
  }

  async updateWalletUserSubscription(
    walletAddress: string, 
    tier: WalletSubscriptionTier | 'elite', 
    active: boolean, 
    expiresAt?: Date | null
  ): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    const now = new Date();
    const displayTier = normalizeWalletTier(tier);
    const dbTier = tierForDb(tier);
    try {
      if (!db) {
        const cached = this.walletUsersCache.get(normalizedAddress);
        if (cached) {
          cached.subscriptionTier = displayTier;
          cached.subscriptionActive = active;
          cached.subscriptionExpiresAt = expiresAt ?? null;
          if (active && !cached.subscribedAt) cached.subscribedAt = now;
          cached.updatedAt = now;
          return cached;
        }
        return undefined;
      }
      const [existing] = await db.select().from(walletUsers).where(eq(walletUsers.walletAddress, normalizedAddress));
      const setSubscribedAt = active && existing && !existing.subscribedAt ? now : (existing?.subscribedAt ?? null);
      const [user] = await db.update(walletUsers)
        .set({ 
          subscriptionTier: dbTier, 
          subscriptionActive: active, 
          subscriptionExpiresAt: expiresAt ?? null,
          subscribedAt: setSubscribedAt,
          updatedAt: now,
        })
        .where(eq(walletUsers.walletAddress, normalizedAddress))
        .returning();
      if (!user) return undefined;
      const mapped = this.mapDbUser(user);
      this.walletUsersCache.set(normalizedAddress, mapped);
      return mapped;
    } catch {
      const cached = this.walletUsersCache.get(normalizedAddress);
      if (cached) {
        cached.subscriptionTier = displayTier;
        cached.subscriptionActive = active;
        cached.subscriptionExpiresAt = expiresAt ?? null;
        if (active && !cached.subscribedAt) cached.subscribedAt = now;
        cached.updatedAt = now;
        return cached;
      }
      return undefined;
    }
  }

  async setManualProOverride(walletAddress: string, value: boolean): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    const now = new Date();
    try {
      if (!db) {
        const cached = this.walletUsersCache.get(normalizedAddress);
        if (cached) {
          cached.manualProOverride = value;
          cached.updatedAt = now;
          return cached;
        }
        return undefined;
      }
      const [user] = await db
        .update(walletUsers)
        .set({ manualProOverride: value, updatedAt: now })
        .where(eq(walletUsers.walletAddress, normalizedAddress))
        .returning();
      if (!user) return undefined;
      const mapped = this.mapDbUser(user);
      this.walletUsersCache.set(normalizedAddress, mapped);
      return mapped;
    } catch {
      const cached = this.walletUsersCache.get(normalizedAddress);
      if (cached) {
        cached.manualProOverride = value;
        cached.updatedAt = now;
        return cached;
      }
      return undefined;
    }
  }

  async recordInstantTradingHandshake(walletAddress: string): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    const now = new Date();
    try {
      let existing = await this.getWalletUser(normalizedAddress);
      if (!existing) {
        return await this.createWalletUser({
          walletAddress: normalizedAddress,
          referralBuilderStatus: "handshake_complete",
          instantTradingCompletedAt: now,
        });
      }
      if (!db) {
        existing.instantTradingCompletedAt = now;
        existing.referralBuilderStatus = "handshake_complete";
        existing.updatedAt = now;
        this.walletUsersCache.set(normalizedAddress, existing);
        return existing;
      }
      const [user] = await db
        .update(walletUsers)
        .set({
          instantTradingCompletedAt: now,
          referralBuilderStatus: "handshake_complete",
          updatedAt: now,
        })
        .where(eq(walletUsers.walletAddress, normalizedAddress))
        .returning();
      if (!user) return existing;
      const mapped = this.mapDbUser(user);
      this.walletUsersCache.set(normalizedAddress, mapped);
      return mapped;
    } catch {
      return this.walletUsersCache.get(normalizedAddress);
    }
  }

  // Support Messages - Using database for persistence
  async getMessages(conversationId: string): Promise<SupportMessage[]> {
    const cid = conversationId.toLowerCase();
    if (!db) {
      return this.supportTicketsMem
        .filter((m) => m.conversationId.toLowerCase() === cid)
        .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
    }
    try {
      const messages = await db.select().from(supportTickets)
        .where(eq(supportTickets.conversationId, cid))
        .orderBy(supportTickets.createdAt);
      return messages;
    } catch {
      return [];
    }
  }

  async getAllSupportMessages(limit = 500): Promise<SupportMessage[]> {
    if (!db) {
      const cap = Math.min(Math.max(limit, 1), 2000);
      return [...this.supportTicketsMem]
        .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
        .slice(0, cap);
    }
    try {
      return await db
        .select()
        .from(supportTickets)
        .orderBy(desc(supportTickets.createdAt))
        .limit(Math.min(Math.max(limit, 1), 2000));
    } catch {
      return [];
    }
  }

  private buildConversationsFromMessages(messages: SupportMessage[]): { conversationId: string; lastMessage: SupportMessage; unreadCount: number }[] {
    const conversationMap = new Map<string, { messages: SupportMessage[] }>();
    for (const msg of messages) {
      const convId = msg.conversationId.toLowerCase();
      if (!conversationMap.has(convId)) {
        conversationMap.set(convId, { messages: [] });
      }
      conversationMap.get(convId)!.messages.push(msg);
    }
    return Array.from(conversationMap.entries()).map(([conversationId, data]) => ({
      conversationId,
      lastMessage: data.messages[0],
      unreadCount: data.messages.filter((m) => !m.isRead && m.senderType === "user").length,
    }));
  }

  async getAllConversations(): Promise<{ conversationId: string; lastMessage: SupportMessage; unreadCount: number }[]> {
    if (!db) {
      const sorted = [...this.supportTicketsMem].sort(
        (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0),
      );
      return this.buildConversationsFromMessages(sorted);
    }
    try {
      const messages = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
      return this.buildConversationsFromMessages(messages);
    } catch {
      return [];
    }
  }

  async createMessage(message: InsertSupportMessage): Promise<SupportMessage> {
    try {
      if (!db) {
        const row: SupportMessage = {
          id: randomUUID(),
          senderType: message.senderType,
          senderWallet: message.senderWallet?.toLowerCase() || null,
          senderName: message.senderName || null,
          message: message.message,
          isRead: message.isRead || false,
          conversationId: message.conversationId.toLowerCase(),
          walletAddress: message.walletAddress?.toLowerCase() ?? null,
          clientSentAt: message.clientSentAt ?? null,
          createdAt: new Date(),
        };
        this.supportTicketsMem.push(row);
        return row;
      }
      const [newMessage] = await db.insert(supportTickets).values({
        senderType: message.senderType,
        senderWallet: message.senderWallet?.toLowerCase() || null,
        senderName: message.senderName || null,
        message: message.message,
        isRead: message.isRead || false,
        conversationId: message.conversationId.toLowerCase(),
        walletAddress: message.walletAddress?.toLowerCase() ?? null,
        clientSentAt: message.clientSentAt ?? null,
      }).returning();
      return newMessage;
    } catch {
      return {
        id: randomUUID(),
        senderType: message.senderType,
        senderWallet: message.senderWallet?.toLowerCase() || null,
        senderName: message.senderName || null,
        message: message.message,
        isRead: message.isRead || false,
        conversationId: message.conversationId.toLowerCase(),
        walletAddress: message.walletAddress?.toLowerCase() ?? null,
        clientSentAt: message.clientSentAt ?? null,
        createdAt: new Date(),
      };
    }
  }

  async markMessagesAsRead(conversationId: string): Promise<void> {
    const cid = conversationId.toLowerCase();
    if (!db) {
      for (const m of this.supportTicketsMem) {
        if (m.conversationId.toLowerCase() === cid) m.isRead = true;
      }
      return;
    }
    try {
      await db.update(supportTickets)
        .set({ isRead: true })
        .where(eq(supportTickets.conversationId, cid));
    } catch {
      // ignore if DB is down
    }
  }

  async createLead(lead: InsertLead): Promise<Lead> {
    try {
      if (!db) {
        return {
          id: randomUUID(),
          email: lead.email,
          name: lead.name || null,
          source: lead.source || "landing",
          walletAddress: lead.walletAddress || null,
          createdAt: new Date(),
        };
      }
      const [newLead] = await db.insert(leads).values({
        email: lead.email,
        name: lead.name || null,
        source: lead.source || "landing",
        walletAddress: lead.walletAddress || null,
      }).returning();
      return newLead;
    } catch {
      return {
        id: randomUUID(),
        email: lead.email,
        name: lead.name || null,
        source: lead.source || "landing",
        walletAddress: lead.walletAddress || null,
        createdAt: new Date(),
      };
    }
  }

  async getAllLeads(): Promise<Lead[]> {
    if (!db) return [];
    try {
      return await db.select().from(leads).orderBy(desc(leads.createdAt));
    } catch {
      return [];
    }
  }
}

export const storage = new MemStorage();
