import { 
  type User, type InsertUser, 
  type Pattern, type InsertPattern,
  type DetectedPattern, type InsertDetectedPattern,
  type SmaSignal, type InsertSmaSignal,
  type SubscriptionTier, type InsertSubscriptionTier
} from "@shared/schema";
import { randomUUID } from "crypto";

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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private patterns: Map<string, Pattern>;
  private detectedPatterns: Map<string, DetectedPattern>;
  private smaSignals: Map<string, SmaSignal>;
  private subscriptionTiers: Map<string, SubscriptionTier>;

  constructor() {
    this.users = new Map();
    this.patterns = new Map();
    this.detectedPatterns = new Map();
    this.smaSignals = new Map();
    this.subscriptionTiers = new Map();
    
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
}

export const storage = new MemStorage();
