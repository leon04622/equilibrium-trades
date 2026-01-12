import type { PatternDefinition } from "@shared/schema";

export const tradingPatterns: PatternDefinition[] = [
  // Continuation Patterns - Bullish
  {
    id: "bull-flag",
    name: "Bull Flag",
    type: "continuation",
    direction: "bullish",
    description: "A bullish continuation pattern that forms after a strong upward move. The price consolidates in a downward-sloping channel before continuing higher.",
    howToIdentify: [
      "Strong upward move (the 'pole')",
      "Price consolidates in a downward channel",
      "Volume decreases during consolidation",
      "Breakout occurs on increased volume"
    ],
    entryStrategy: "Enter on breakout above the upper trendline of the flag with volume confirmation",
    exitStrategy: "Target is typically the height of the pole added to the breakout point. Place stop loss below the flag low.",
    successRate: 67,
    difficulty: "beginner",
    iconName: "TrendingUp"
  },
  {
    id: "ascending-triangle",
    name: "Ascending Triangle",
    type: "continuation",
    direction: "bullish",
    description: "A bullish pattern with a flat resistance line and rising support line. Indicates buyers are becoming more aggressive.",
    howToIdentify: [
      "Horizontal resistance level tested multiple times",
      "Higher lows forming ascending support line",
      "Volume often decreases as pattern develops",
      "Breakout typically occurs 2/3 through the pattern"
    ],
    entryStrategy: "Enter on confirmed breakout above resistance with volume spike",
    exitStrategy: "Measure the height of the triangle at its widest point and project from breakout. Stop below the most recent higher low.",
    successRate: 72,
    difficulty: "beginner",
    iconName: "Triangle"
  },
  {
    id: "symmetrical-triangle",
    name: "Symmetrical Triangle",
    type: "continuation",
    direction: "neutral",
    description: "A neutral pattern where price makes lower highs and higher lows, converging to a point. Can break either direction but often continues the prior trend.",
    howToIdentify: [
      "Converging trendlines with lower highs and higher lows",
      "Decreasing volume as the pattern develops",
      "At least two touches on each trendline",
      "Breakout usually occurs before the apex"
    ],
    entryStrategy: "Wait for confirmed breakout in either direction. Enter on retest of breakout level.",
    exitStrategy: "Target equals the height of the triangle's base. Place stop on the opposite side of the triangle.",
    successRate: 65,
    difficulty: "intermediate",
    iconName: "Minimize2"
  },
  {
    id: "pennant",
    name: "Pennant",
    type: "continuation",
    direction: "bullish",
    description: "Similar to a flag but with converging trendlines forming a small symmetrical triangle after a strong move.",
    howToIdentify: [
      "Strong directional move (pole)",
      "Small symmetrical triangle consolidation",
      "Duration is typically 1-3 weeks",
      "Volume spikes on pole, decreases in pennant"
    ],
    entryStrategy: "Enter on breakout in the direction of the prior trend",
    exitStrategy: "Target is the height of the pole projected from breakout point. Stop below pennant low for longs.",
    successRate: 66,
    difficulty: "beginner",
    iconName: "Flag"
  },
  {
    id: "cup-and-handle",
    name: "Cup and Handle",
    type: "continuation",
    direction: "bullish",
    description: "A bullish pattern resembling a cup with a handle. The cup is a rounded bottom, followed by a slight pullback (handle) before breakout.",
    howToIdentify: [
      "U-shaped cup formation (not V-shaped)",
      "Handle forms as slight pullback after cup",
      "Handle should be in upper half of cup",
      "Volume increases on breakout"
    ],
    entryStrategy: "Enter on breakout above the handle's resistance level",
    exitStrategy: "Target is the depth of the cup added to the breakout point. Stop below the handle low.",
    successRate: 68,
    difficulty: "intermediate",
    iconName: "Coffee"
  },
  
  // Continuation Patterns - Bearish
  {
    id: "bear-flag",
    name: "Bear Flag",
    type: "continuation",
    direction: "bearish",
    description: "A bearish continuation pattern that forms after a strong downward move. Price consolidates in an upward channel before continuing lower.",
    howToIdentify: [
      "Strong downward move (the 'pole')",
      "Price consolidates in an upward channel",
      "Volume decreases during consolidation",
      "Breakdown occurs on increased volume"
    ],
    entryStrategy: "Enter short on breakdown below the lower trendline with volume confirmation",
    exitStrategy: "Target is the height of the pole subtracted from breakdown point. Stop above flag high.",
    successRate: 65,
    difficulty: "beginner",
    iconName: "TrendingDown"
  },
  {
    id: "descending-triangle",
    name: "Descending Triangle",
    type: "continuation",
    direction: "bearish",
    description: "A bearish pattern with a flat support line and descending resistance line. Indicates sellers are becoming more aggressive.",
    howToIdentify: [
      "Horizontal support level tested multiple times",
      "Lower highs forming descending resistance line",
      "Volume often decreases as pattern develops",
      "Breakdown typically occurs 2/3 through pattern"
    ],
    entryStrategy: "Enter short on confirmed breakdown below support with volume spike",
    exitStrategy: "Measure triangle height and project down from breakdown. Stop above most recent lower high.",
    successRate: 70,
    difficulty: "beginner",
    iconName: "Triangle"
  },

  // Reversal Patterns
  {
    id: "head-and-shoulders",
    name: "Head and Shoulders",
    type: "reversal",
    direction: "bearish",
    description: "A reversal pattern with three peaks - the middle one (head) being highest. Signals a bullish-to-bearish reversal.",
    howToIdentify: [
      "Left shoulder forms with moderate high",
      "Head forms as the highest point",
      "Right shoulder forms lower than head",
      "Neckline connects the two troughs",
      "Volume typically decreases through pattern"
    ],
    entryStrategy: "Enter short on neckline break with volume confirmation. Conservative entry on retest of neckline.",
    exitStrategy: "Target is the height from head to neckline, projected down from breakout. Stop above right shoulder.",
    successRate: 74,
    difficulty: "intermediate",
    iconName: "Activity"
  },
  {
    id: "inverse-head-and-shoulders",
    name: "Inverse Head & Shoulders",
    type: "reversal",
    direction: "bullish",
    description: "A bullish reversal pattern - the inverse of head and shoulders. Three troughs with the middle one being lowest.",
    howToIdentify: [
      "Left shoulder forms with moderate low",
      "Head forms as the lowest point",
      "Right shoulder forms higher than head",
      "Neckline connects the two peaks",
      "Volume increases on breakout"
    ],
    entryStrategy: "Enter long on neckline breakout with volume confirmation",
    exitStrategy: "Target is the height from head to neckline, projected up from breakout. Stop below right shoulder.",
    successRate: 73,
    difficulty: "intermediate",
    iconName: "Activity"
  },
  {
    id: "double-top",
    name: "Double Top",
    type: "reversal",
    direction: "bearish",
    description: "A bearish reversal pattern where price tests a resistance level twice and fails, forming an 'M' shape.",
    howToIdentify: [
      "Two peaks at approximately the same level",
      "Moderate trough between peaks",
      "Second peak often has lower volume",
      "Breakdown below the trough confirms pattern"
    ],
    entryStrategy: "Enter short on break below the trough between peaks",
    exitStrategy: "Target is the height from peaks to trough, projected down. Stop above the second peak.",
    successRate: 72,
    difficulty: "beginner",
    iconName: "ArrowBigDown"
  },
  {
    id: "double-bottom",
    name: "Double Bottom",
    type: "reversal",
    direction: "bullish",
    description: "A bullish reversal pattern where price tests a support level twice and holds, forming a 'W' shape.",
    howToIdentify: [
      "Two troughs at approximately the same level",
      "Moderate peak between troughs",
      "Second trough often has lower volume",
      "Breakout above the peak confirms pattern"
    ],
    entryStrategy: "Enter long on break above the peak between troughs",
    exitStrategy: "Target is the height from troughs to peak, projected up. Stop below the second trough.",
    successRate: 71,
    difficulty: "beginner",
    iconName: "ArrowBigUp"
  },
  {
    id: "triple-top",
    name: "Triple Top",
    type: "reversal",
    direction: "bearish",
    description: "A bearish reversal with three peaks at similar levels. Stronger signal than double top due to more failed attempts.",
    howToIdentify: [
      "Three peaks at approximately same resistance",
      "Two troughs between the peaks",
      "Volume typically decreases with each peak",
      "Breakdown below support confirms pattern"
    ],
    entryStrategy: "Enter short on break below the support level connecting troughs",
    exitStrategy: "Target is the height of pattern projected down. Stop above the third peak.",
    successRate: 75,
    difficulty: "intermediate",
    iconName: "ChevronsDown"
  },
  {
    id: "triple-bottom",
    name: "Triple Bottom",
    type: "reversal",
    direction: "bullish",
    description: "A bullish reversal with three troughs at similar levels. Stronger signal than double bottom.",
    howToIdentify: [
      "Three troughs at approximately same support",
      "Two peaks between the troughs",
      "Volume may increase on third test",
      "Breakout above resistance confirms pattern"
    ],
    entryStrategy: "Enter long on break above the resistance level connecting peaks",
    exitStrategy: "Target is the height of pattern projected up. Stop below the third trough.",
    successRate: 74,
    difficulty: "intermediate",
    iconName: "ChevronsUp"
  },
  {
    id: "diamond",
    name: "Diamond Pattern",
    type: "reversal",
    direction: "neutral",
    description: "A rare reversal pattern that looks like a diamond shape. Forms when market first expands then contracts.",
    howToIdentify: [
      "Price range first expands (broadening)",
      "Then price range contracts (symmetrical triangle)",
      "Creates diamond-like shape",
      "Volume irregular, often high at widest point"
    ],
    entryStrategy: "Enter on breakout from the diamond in the direction of the break",
    exitStrategy: "Target is the height of the diamond at its widest. Place wide stop as this is a volatile pattern.",
    successRate: 62,
    difficulty: "advanced",
    iconName: "Diamond"
  },
  {
    id: "wedge-rising",
    name: "Rising Wedge",
    type: "reversal",
    direction: "bearish",
    description: "A bearish pattern where price makes higher highs and higher lows but in a narrowing range that slopes upward.",
    howToIdentify: [
      "Both support and resistance lines slope upward",
      "Lines converge (getting narrower)",
      "Volume typically decreases",
      "Breakdown usually occurs before apex"
    ],
    entryStrategy: "Enter short on breakdown below the lower trendline",
    exitStrategy: "Target is the height of the wedge at entry. Stop above the most recent high.",
    successRate: 68,
    difficulty: "intermediate",
    iconName: "ArrowUpRight"
  },
  {
    id: "wedge-falling",
    name: "Falling Wedge",
    type: "reversal",
    direction: "bullish",
    description: "A bullish pattern where price makes lower highs and lower lows in a narrowing, downward-sloping range.",
    howToIdentify: [
      "Both support and resistance lines slope downward",
      "Lines converge (getting narrower)",
      "Volume typically decreases",
      "Breakout usually occurs before apex"
    ],
    entryStrategy: "Enter long on breakout above the upper trendline",
    exitStrategy: "Target is the height of the wedge at entry. Stop below the most recent low.",
    successRate: 69,
    difficulty: "intermediate",
    iconName: "ArrowDownRight"
  },
  {
    id: "rounding-bottom",
    name: "Rounding Bottom",
    type: "reversal",
    direction: "bullish",
    description: "A long-term bullish reversal pattern resembling a bowl or saucer. Indicates a slow, steady shift from bearish to bullish sentiment.",
    howToIdentify: [
      "Gradual, U-shaped price curve",
      "Extended formation (weeks to months)",
      "Volume follows the same U-shape",
      "Breakout above the pattern's rim"
    ],
    entryStrategy: "Enter on breakout above the left rim of the saucer with volume",
    exitStrategy: "Target is the depth of the pattern added to breakout. Wide stop as this is a major pattern.",
    successRate: 70,
    difficulty: "advanced",
    iconName: "Circle"
  },
  {
    id: "engulfing-bullish",
    name: "Bullish Engulfing",
    type: "reversal",
    direction: "bullish",
    description: "A two-candle reversal pattern where a large bullish candle completely engulfs the previous bearish candle.",
    howToIdentify: [
      "Occurs after a downtrend",
      "First candle is bearish (red)",
      "Second candle opens lower but closes higher than first candle's open",
      "Second candle's body completely engulfs first"
    ],
    entryStrategy: "Enter long at the close of the engulfing candle or on the next candle open",
    exitStrategy: "Target recent swing highs. Stop below the low of the engulfing candle.",
    successRate: 63,
    difficulty: "beginner",
    iconName: "ArrowUpCircle"
  },
  {
    id: "engulfing-bearish",
    name: "Bearish Engulfing",
    type: "reversal",
    direction: "bearish",
    description: "A two-candle reversal pattern where a large bearish candle completely engulfs the previous bullish candle.",
    howToIdentify: [
      "Occurs after an uptrend",
      "First candle is bullish (green)",
      "Second candle opens higher but closes lower than first candle's open",
      "Second candle's body completely engulfs first"
    ],
    entryStrategy: "Enter short at the close of the engulfing candle or on the next candle open",
    exitStrategy: "Target recent swing lows. Stop above the high of the engulfing candle.",
    successRate: 62,
    difficulty: "beginner",
    iconName: "ArrowDownCircle"
  },
  {
    id: "morning-star",
    name: "Morning Star",
    type: "reversal",
    direction: "bullish",
    description: "A three-candle bullish reversal pattern. A large bearish candle, followed by a small-bodied candle, then a large bullish candle.",
    howToIdentify: [
      "First candle: large bearish in downtrend",
      "Second candle: small body, gaps down",
      "Third candle: large bullish that closes into first candle",
      "More reliable with volume increase on third candle"
    ],
    entryStrategy: "Enter long at the close of the third candle",
    exitStrategy: "Target is the high of the first candle or recent resistance. Stop below the low of the pattern.",
    successRate: 64,
    difficulty: "intermediate",
    iconName: "Sunrise"
  },
  {
    id: "evening-star",
    name: "Evening Star",
    type: "reversal",
    direction: "bearish",
    description: "A three-candle bearish reversal pattern. A large bullish candle, followed by a small-bodied candle, then a large bearish candle.",
    howToIdentify: [
      "First candle: large bullish in uptrend",
      "Second candle: small body, gaps up",
      "Third candle: large bearish that closes into first candle",
      "More reliable with volume increase on third candle"
    ],
    entryStrategy: "Enter short at the close of the third candle",
    exitStrategy: "Target is the low of the first candle or recent support. Stop above the high of the pattern.",
    successRate: 63,
    difficulty: "intermediate",
    iconName: "Sunset"
  }
];

export function getPatternById(id: string): PatternDefinition | undefined {
  return tradingPatterns.find(p => p.id === id);
}

export function getPatternsByType(type: 'continuation' | 'reversal'): PatternDefinition[] {
  return tradingPatterns.filter(p => p.type === type);
}

export function getPatternsByDirection(direction: 'bullish' | 'bearish' | 'neutral'): PatternDefinition[] {
  return tradingPatterns.filter(p => p.direction === direction);
}

export function getPatternsByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): PatternDefinition[] {
  return tradingPatterns.filter(p => p.difficulty === difficulty);
}
