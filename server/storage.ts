import { 
  type User, type InsertUser, 
  type Pattern, type InsertPattern,
  type DetectedPattern, type InsertDetectedPattern,
  type SmaSignal, type InsertSmaSignal,
  type SubscriptionTier, type InsertSubscriptionTier,
  type TradeGrade, type InsertTradeGrade, type WeeklyStats,
  type TutorialVideo, type InsertTutorialVideo,
  type WalletUser, type InsertWalletUser,
  tutorialVideos
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
  createWalletUser(user: InsertWalletUser): Promise<WalletUser>;
  updateWalletUserApproval(walletAddress: string, approved: boolean): Promise<WalletUser | undefined>;
  updateWalletUserEmail(walletAddress: string, email: string): Promise<WalletUser | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private patterns: Map<string, Pattern>;
  private detectedPatterns: Map<string, DetectedPattern>;
  private smaSignals: Map<string, SmaSignal>;
  private subscriptionTiers: Map<string, SubscriptionTier>;
  private tradeGrades: Map<string, TradeGrade>;
  private walletUsers: Map<string, WalletUser>;

  constructor() {
    this.users = new Map();
    this.patterns = new Map();
    this.detectedPatterns = new Map();
    this.smaSignals = new Map();
    this.subscriptionTiers = new Map();
    this.tradeGrades = new Map();
    this.walletUsers = new Map();
    
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
      createdAt: new Date()
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

  // Wallet Users (Hyperliquid onboarding)
  async getWalletUser(walletAddress: string): Promise<WalletUser | undefined> {
    // Normalize address to lowercase for comparison
    const normalizedAddress = walletAddress.toLowerCase();
    return Array.from(this.walletUsers.values()).find(
      u => u.walletAddress.toLowerCase() === normalizedAddress
    );
  }

  async createWalletUser(user: InsertWalletUser): Promise<WalletUser> {
    const id = randomUUID();
    const now = new Date();
    const newUser: WalletUser = {
      id,
      walletAddress: user.walletAddress.toLowerCase(),
      email: user.email ?? null,
      builderCodeApproved: user.builderCodeApproved ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.walletUsers.set(id, newUser);
    return newUser;
  }

  async updateWalletUserApproval(walletAddress: string, approved: boolean): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    const user = Array.from(this.walletUsers.values()).find(
      u => u.walletAddress.toLowerCase() === normalizedAddress
    );
    if (user) {
      user.builderCodeApproved = approved;
      user.updatedAt = new Date();
      this.walletUsers.set(user.id, user);
    }
    return user;
  }

  async updateWalletUserEmail(walletAddress: string, email: string): Promise<WalletUser | undefined> {
    const normalizedAddress = walletAddress.toLowerCase();
    const user = Array.from(this.walletUsers.values()).find(
      u => u.walletAddress.toLowerCase() === normalizedAddress
    );
    if (user) {
      user.email = email;
      user.updatedAt = new Date();
      this.walletUsers.set(user.id, user);
    }
    return user;
  }
}

export const storage = new MemStorage();
