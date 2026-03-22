import { 
  type User, type InsertUser, 
  type Pattern, type InsertPattern,
  type DetectedPattern, type InsertDetectedPattern,
  type SmaSignal, type InsertSmaSignal,
  type SubscriptionTier, type InsertSubscriptionTier,
  type TradeGrade, type InsertTradeGrade, type WeeklyStats,
  type TutorialVideo, type InsertTutorialVideo,
  type WalletUser, type InsertWalletUser,
  type SupportMessage, type InsertSupportMessage,
  type Lead, type InsertLead,
  tutorialVideos, supportMessages, walletUsers, leads
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

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
  updateWalletUserSubscription(walletAddress: string, tier: 'free' | 'pro' | 'elite', active: boolean, expiresAt?: Date | null): Promise<WalletUser | undefined>;
  
  // Support Messages
  getMessages(conversationId: string): Promise<SupportMessage[]>;
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

  constructor() {
    this.users = new Map();
    this.patterns = new Map();
    this.detectedPatterns = new Map();
    this.smaSignals = new Map();
    this.subscriptionTiers = new Map();
    this.tradeGrades = new Map();
    
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

  // Tutorial Videos - Now using database for persistence
  async getAllVideos(): Promise<TutorialVideo[]> {
    const videos = await db.select().from(tutorialVideos).orderBy(desc(tutorialVideos.createdAt));
    return videos;
  }

  async getVideo(id: string): Promise<TutorialVideo | undefined> {
    const [video] = await db.select().from(tutorialVideos).where(eq(tutorialVideos.id, id));
    return video;
  }

  async createVideo(video: InsertTutorialVideo): Promise<TutorialVideo> {
    const [newVideo] = await db.insert(tutorialVideos).values({
      title: video.title,
      description: video.description,
      duration: video.duration || "",
      category: video.category,
      youtubeId: video.youtubeId || null,
      videoPath: video.videoPath || null,
      thumbnailPath: video.thumbnailPath || null,
    }).returning();
    return newVideo;
  }

  async deleteVideo(id: string): Promise<boolean> {
    const result = await db.delete(tutorialVideos).where(eq(tutorialVideos.id, id)).returning();
    return result.length > 0;
  }

  // Wallet Users (Hyperliquid onboarding) - Using database for persistence
  async getWalletUser(walletAddress: string): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    const [user] = await db.select().from(walletUsers).where(eq(walletUsers.walletAddress, normalizedAddress));
    if (!user) return undefined;
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      builderCodeApproved: user.builderCodeApproved ?? false,
      subscriptionTier: (user.subscriptionTier as 'free' | 'pro' | 'elite') ?? 'free',
      subscriptionActive: user.subscriptionActive ?? false,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      subscribedAt: user.subscribedAt ?? null,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };
  }

  async getAllWalletUsers(): Promise<WalletUser[]> {
    const users = await db.select().from(walletUsers).orderBy(desc(walletUsers.createdAt));
    return users.map(user => ({
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      builderCodeApproved: user.builderCodeApproved ?? false,
      subscriptionTier: (user.subscriptionTier as 'free' | 'pro' | 'elite') ?? 'free',
      subscriptionActive: user.subscriptionActive ?? false,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      subscribedAt: user.subscribedAt ?? null,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    }));
  }

  async createWalletUser(user: InsertWalletUser): Promise<WalletUser> {
    const normalizedAddress = user.walletAddress.toLowerCase();
    const [newUser] = await db.insert(walletUsers).values({
      walletAddress: normalizedAddress,
      email: user.email ?? null,
      builderCodeApproved: user.builderCodeApproved ?? false,
      subscriptionTier: user.subscriptionTier ?? 'free',
      subscriptionActive: user.subscriptionActive ?? false,
    }).returning();
    return {
      id: newUser.id,
      walletAddress: newUser.walletAddress,
      email: newUser.email,
      builderCodeApproved: newUser.builderCodeApproved ?? false,
      subscriptionTier: (newUser.subscriptionTier as 'free' | 'pro' | 'elite') ?? 'free',
      subscriptionActive: newUser.subscriptionActive ?? false,
      subscriptionExpiresAt: newUser.subscriptionExpiresAt,
      subscribedAt: newUser.subscribedAt ?? null,
      createdAt: newUser.createdAt ?? new Date(),
      updatedAt: newUser.updatedAt ?? new Date(),
    };
  }

  async updateWalletUserApproval(walletAddress: string, approved: boolean): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    const [user] = await db.update(walletUsers)
      .set({ builderCodeApproved: approved, updatedAt: new Date() })
      .where(eq(walletUsers.walletAddress, normalizedAddress))
      .returning();
    if (!user) return undefined;
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      builderCodeApproved: user.builderCodeApproved ?? false,
      subscriptionTier: (user.subscriptionTier as 'free' | 'pro' | 'elite') ?? 'free',
      subscriptionActive: user.subscriptionActive ?? false,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      subscribedAt: user.subscribedAt ?? null,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };
  }

  async updateWalletUserEmail(walletAddress: string, email: string): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    const [user] = await db.update(walletUsers)
      .set({ email, updatedAt: new Date() })
      .where(eq(walletUsers.walletAddress, normalizedAddress))
      .returning();
    if (!user) return undefined;
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      builderCodeApproved: user.builderCodeApproved ?? false,
      subscriptionTier: (user.subscriptionTier as 'free' | 'pro' | 'elite') ?? 'free',
      subscriptionActive: user.subscriptionActive ?? false,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      subscribedAt: user.subscribedAt ?? null,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };
  }

  async updateWalletUserSubscription(
    walletAddress: string, 
    tier: 'free' | 'pro' | 'elite', 
    active: boolean, 
    expiresAt?: Date | null
  ): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    // Fetch current record to determine if subscribedAt should be set
    const [existing] = await db.select().from(walletUsers).where(eq(walletUsers.walletAddress, normalizedAddress));
    const now = new Date();
    const setSubscribedAt = active && existing && !existing.subscribedAt ? now : (existing?.subscribedAt ?? null);
    const [user] = await db.update(walletUsers)
      .set({ 
        subscriptionTier: tier, 
        subscriptionActive: active, 
        subscriptionExpiresAt: expiresAt ?? null,
        subscribedAt: setSubscribedAt,
        updatedAt: now,
      })
      .where(eq(walletUsers.walletAddress, normalizedAddress))
      .returning();
    if (!user) return undefined;
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      builderCodeApproved: user.builderCodeApproved ?? false,
      subscriptionTier: (user.subscriptionTier as 'free' | 'pro' | 'elite') ?? 'free',
      subscriptionActive: user.subscriptionActive ?? false,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      subscribedAt: user.subscribedAt ?? null,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };
  }

  // Support Messages - Using database for persistence
  async getMessages(conversationId: string): Promise<SupportMessage[]> {
    const messages = await db.select().from(supportMessages)
      .where(eq(supportMessages.conversationId, conversationId.toLowerCase()))
      .orderBy(supportMessages.createdAt);
    return messages;
  }

  async getAllConversations(): Promise<{ conversationId: string; lastMessage: SupportMessage; unreadCount: number }[]> {
    const messages = await db.select().from(supportMessages).orderBy(desc(supportMessages.createdAt));
    
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
      unreadCount: data.messages.filter(m => !m.isRead && m.senderType === 'user').length,
    }));
  }

  async createMessage(message: InsertSupportMessage): Promise<SupportMessage> {
    const [newMessage] = await db.insert(supportMessages).values({
      senderType: message.senderType,
      senderWallet: message.senderWallet?.toLowerCase() || null,
      senderName: message.senderName || null,
      message: message.message,
      isRead: message.isRead || false,
      conversationId: message.conversationId.toLowerCase(),
    }).returning();
    return newMessage;
  }

  async markMessagesAsRead(conversationId: string): Promise<void> {
    await db.update(supportMessages)
      .set({ isRead: true })
      .where(eq(supportMessages.conversationId, conversationId.toLowerCase()));
  }

  async createLead(lead: InsertLead): Promise<Lead> {
    const [newLead] = await db.insert(leads).values({
      email: lead.email,
      name: lead.name || null,
      source: lead.source || "landing",
      walletAddress: lead.walletAddress || null,
    }).returning();
    return newLead;
  }

  async getAllLeads(): Promise<Lead[]> {
    return await db.select().from(leads).orderBy(desc(leads.createdAt));
  }
}

export const storage = new MemStorage();
