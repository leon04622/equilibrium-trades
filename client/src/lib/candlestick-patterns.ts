export interface CandlestickPattern {
  id: string;
  name: string;
  type: "bullish" | "bearish" | "neutral";
  category: "single" | "double" | "triple";
  description: string;
  psychology: string;
  howToIdentify: string[];
  tradingImplication: string;
  reliability: "low" | "moderate" | "high";
  iconType: "bullish" | "bearish" | "neutral";
  /** Basename under `attached_assets/generated_images/` — loaded on demand. */
  imageFile?: string;
}

export const candlestickPatterns: CandlestickPattern[] = [
  // Single Candle Patterns - Bullish
  {
    id: "hammer",
    name: "Hammer",
    type: "bullish",
    category: "single",
    description: "A bullish reversal pattern that forms at the bottom of a downtrend. It has a small body at the top and a long lower shadow (at least 2x the body).",
    psychology: "Sellers pushed price down during the session, but buyers stepped in and drove it back up near the open, showing rejection of lower prices.",
    howToIdentify: [
      "Small real body at the upper end of the trading range",
      "Long lower shadow (at least 2x the body length)",
      "Little or no upper shadow",
      "Appears after a downtrend"
    ],
    tradingImplication: "Signals potential trend reversal from bearish to bullish. Confirmation comes from a bullish candle following the hammer.",
    reliability: "moderate",
    iconType: "bullish",
    imageFile: "hammer_candlestick_pattern_diagram.png"
  },
  {
    id: "inverted-hammer",
    name: "Inverted Hammer",
    type: "bullish",
    category: "single",
    description: "A bullish reversal pattern at the bottom of a downtrend with a small body at the bottom and a long upper shadow.",
    psychology: "Buyers tried to push price higher but faced resistance. However, the fact that sellers couldn't push it much lower shows waning bearish momentum.",
    howToIdentify: [
      "Small real body at the lower end of the trading range",
      "Long upper shadow (at least 2x the body)",
      "Little or no lower shadow",
      "Appears after a downtrend"
    ],
    tradingImplication: "Suggests buyers are testing resistance. Requires bullish confirmation on the next candle to confirm reversal.",
    reliability: "moderate",
    iconType: "bullish",
    imageFile: "inverted_hammer_pattern_diagram.png"
  },
  {
    id: "bullish-marubozu",
    name: "Bullish Marubozu",
    type: "bullish",
    category: "single",
    description: "A strong bullish candle with no shadows. The open equals the low and the close equals the high.",
    psychology: "Extreme bullish conviction - buyers controlled the entire session from open to close with no hesitation.",
    howToIdentify: [
      "Long bullish body",
      "No upper shadow (close = high)",
      "No lower shadow (open = low)",
      "Larger than average candle size"
    ],
    tradingImplication: "Strong bullish momentum. Often indicates continuation of uptrend or start of new bullish move.",
    reliability: "high",
    iconType: "bullish",
    imageFile: "marubozu_candlestick_pattern.png"
  },
  {
    id: "dragonfly-doji",
    name: "Dragonfly Doji",
    type: "bullish",
    category: "single",
    description: "A doji with a long lower shadow and no upper shadow. Open, high, and close are at the same level.",
    psychology: "Sellers pushed price down significantly but buyers brought it all the way back to the open, showing strong rejection of lower prices.",
    howToIdentify: [
      "Open, high, and close at the same price",
      "Long lower shadow",
      "No upper shadow",
      "T-shaped appearance"
    ],
    tradingImplication: "Bullish reversal signal at the bottom of a downtrend. More significant with higher volume.",
    reliability: "moderate",
    iconType: "bullish",
    imageFile: "dragonfly_doji_pattern_diagram.png"
  },

  // Single Candle Patterns - Bearish
  {
    id: "hanging-man",
    name: "Hanging Man",
    type: "bearish",
    category: "single",
    description: "Identical to a hammer but appears at the top of an uptrend. Signals potential reversal to the downside.",
    psychology: "During an uptrend, significant selling pressure emerged (long lower shadow), warning that the trend may be weakening.",
    howToIdentify: [
      "Small real body at the upper end",
      "Long lower shadow (at least 2x the body)",
      "Little or no upper shadow",
      "Appears after an uptrend"
    ],
    tradingImplication: "Warning sign that the uptrend may be ending. Confirmation needed from a bearish candle following.",
    reliability: "moderate",
    iconType: "bearish",
    imageFile: "hanging_man_pattern_diagram.png"
  },
  {
    id: "shooting-star",
    name: "Shooting Star",
    type: "bearish",
    category: "single",
    description: "A bearish reversal pattern at the top of an uptrend with a small body at the bottom and a long upper shadow.",
    psychology: "Buyers pushed price to new highs but sellers overwhelmed them, pushing price back down near the open.",
    howToIdentify: [
      "Small real body at the lower end",
      "Long upper shadow (at least 2x the body)",
      "Little or no lower shadow",
      "Appears after an uptrend"
    ],
    tradingImplication: "Strong bearish reversal signal. The longer the upper shadow, the more significant the rejection.",
    reliability: "high",
    iconType: "bearish",
    imageFile: "shooting_star_pattern_diagram.png"
  },
  {
    id: "bearish-marubozu",
    name: "Bearish Marubozu",
    type: "bearish",
    category: "single",
    description: "A strong bearish candle with no shadows. The open equals the high and the close equals the low.",
    psychology: "Extreme bearish conviction - sellers controlled the entire session with no buyer resistance.",
    howToIdentify: [
      "Long bearish body",
      "No upper shadow (open = high)",
      "No lower shadow (close = low)",
      "Larger than average candle size"
    ],
    tradingImplication: "Strong bearish momentum. Indicates continuation of downtrend or start of new bearish move.",
    reliability: "high",
    iconType: "bearish",
    imageFile: "marubozu_candlestick_pattern.png"
  },
  {
    id: "gravestone-doji",
    name: "Gravestone Doji",
    type: "bearish",
    category: "single",
    description: "A doji with a long upper shadow and no lower shadow. Open, low, and close are at the same level.",
    psychology: "Buyers pushed price up significantly but sellers brought it all the way back down, showing strong rejection of higher prices.",
    howToIdentify: [
      "Open, low, and close at the same price",
      "Long upper shadow",
      "No lower shadow",
      "Inverted T-shaped appearance"
    ],
    tradingImplication: "Bearish reversal signal at the top of an uptrend. Stronger with higher volume.",
    reliability: "moderate",
    iconType: "bearish",
    imageFile: "gravestone_doji_pattern_diagram.png"
  },

  // Single Candle Patterns - Neutral
  {
    id: "doji",
    name: "Doji",
    type: "neutral",
    category: "single",
    description: "A candle where open and close are virtually the same. Represents indecision in the market.",
    psychology: "Neither buyers nor sellers could gain control. Often signals potential trend change when appearing after a strong move.",
    howToIdentify: [
      "Open and close are at the same (or very close) price",
      "Can have upper and lower shadows of any length",
      "Cross or plus sign appearance",
      "Body is extremely small or nonexistent"
    ],
    tradingImplication: "Signals indecision. Most significant after extended trends. Wait for confirmation candle.",
    reliability: "low",
    iconType: "neutral",
    imageFile: "doji_candlestick_pattern_diagram.png"
  },
  {
    id: "spinning-top",
    name: "Spinning Top",
    type: "neutral",
    category: "single",
    description: "A candle with a small body and upper/lower shadows of similar length. Shows indecision.",
    psychology: "Both buyers and sellers had their moments but neither could maintain control, ending near where it started.",
    howToIdentify: [
      "Small real body (can be bullish or bearish)",
      "Upper and lower shadows present",
      "Shadows are longer than the body",
      "Shadows roughly equal in length"
    ],
    tradingImplication: "Indecision pattern. In a trend, may signal weakening momentum. Wait for confirmation.",
    reliability: "low",
    iconType: "neutral",
    imageFile: "spinning_top_pattern_diagram.png"
  },

  // Double Candle Patterns - Bullish
  {
    id: "bullish-engulfing",
    name: "Bullish Engulfing",
    type: "bullish",
    category: "double",
    description: "A two-candle reversal pattern where a large bullish candle completely engulfs the previous bearish candle.",
    psychology: "After bearish control, buyers overwhelmed sellers with such force that they erased all of the previous losses and more.",
    howToIdentify: [
      "First candle is bearish (red)",
      "Second candle is bullish (green)",
      "Second candle's body completely covers the first",
      "Appears after a downtrend"
    ],
    tradingImplication: "Strong bullish reversal signal. The larger the engulfing candle, the more significant.",
    reliability: "high",
    iconType: "bullish",
    imageFile: "bullish_engulfing_pattern_diagram.png"
  },
  {
    id: "piercing-line",
    name: "Piercing Line",
    type: "bullish",
    category: "double",
    description: "A two-candle bullish reversal where the second candle opens below the first's low but closes above its midpoint.",
    psychology: "Bears initially continued selling (gap down), but buyers took over and pushed price through the halfway point of the prior candle.",
    howToIdentify: [
      "First candle is long and bearish",
      "Second candle opens below the first's low",
      "Second candle closes above the midpoint of the first",
      "Appears in a downtrend"
    ],
    tradingImplication: "Bullish reversal signal. More reliable when the second candle closes closer to the first's open.",
    reliability: "moderate",
    iconType: "bullish",
    imageFile: "piercing_line_pattern_diagram.png"
  },
  {
    id: "tweezer-bottom",
    name: "Tweezer Bottom",
    type: "bullish",
    category: "double",
    description: "Two candles with matching lows at the bottom of a downtrend, signaling support.",
    psychology: "Price found the same support level twice, indicating strong buying interest at that level.",
    howToIdentify: [
      "Two consecutive candles",
      "Both candles have the same or very similar lows",
      "First candle often bearish, second often bullish",
      "Appears at the bottom of a downtrend"
    ],
    tradingImplication: "Suggests strong support level. Bullish reversal more likely when second candle is bullish.",
    reliability: "moderate",
    iconType: "bullish",
    imageFile: "tweezer_bottoms_pattern_diagram.png"
  },
  {
    id: "bullish-harami",
    name: "Bullish Harami",
    type: "bullish",
    category: "double",
    description: "A small bullish candle contained within the body of the previous larger bearish candle.",
    psychology: "After a strong bearish move, the small candle shows selling pressure is exhausting and buyers are emerging.",
    howToIdentify: [
      "First candle is large and bearish",
      "Second candle is small and bullish",
      "Second candle's body is within the first's body",
      "Appears after a downtrend"
    ],
    tradingImplication: "Potential reversal signal. Less reliable than engulfing; wait for confirmation.",
    reliability: "low",
    iconType: "bullish",
    imageFile: "bullish_harami_pattern_diagram.png"
  },

  // Double Candle Patterns - Bearish
  {
    id: "bearish-engulfing",
    name: "Bearish Engulfing",
    type: "bearish",
    category: "double",
    description: "A two-candle reversal pattern where a large bearish candle completely engulfs the previous bullish candle.",
    psychology: "After bullish control, sellers overwhelmed buyers with such force that they erased all prior gains and more.",
    howToIdentify: [
      "First candle is bullish (green)",
      "Second candle is bearish (red)",
      "Second candle's body completely covers the first",
      "Appears after an uptrend"
    ],
    tradingImplication: "Strong bearish reversal signal. Very reliable at resistance levels.",
    reliability: "high",
    iconType: "bearish",
    imageFile: "bearish_engulfing_pattern_diagram.png"
  },
  {
    id: "dark-cloud-cover",
    name: "Dark Cloud Cover",
    type: "bearish",
    category: "double",
    description: "A two-candle bearish reversal where the second candle opens above the first's high but closes below its midpoint.",
    psychology: "Bulls initially continued buying (gap up), but sellers took control and pushed price below the halfway point.",
    howToIdentify: [
      "First candle is long and bullish",
      "Second candle opens above the first's high",
      "Second candle closes below the midpoint of the first",
      "Appears in an uptrend"
    ],
    tradingImplication: "Bearish reversal signal. More reliable when the second candle closes closer to the first's open.",
    reliability: "moderate",
    iconType: "bearish",
    imageFile: "dark_cloud_cover_pattern.png"
  },
  {
    id: "tweezer-top",
    name: "Tweezer Top",
    type: "bearish",
    category: "double",
    description: "Two candles with matching highs at the top of an uptrend, signaling resistance.",
    psychology: "Price hit the same resistance level twice, indicating strong selling interest at that level.",
    howToIdentify: [
      "Two consecutive candles",
      "Both candles have the same or very similar highs",
      "First candle often bullish, second often bearish",
      "Appears at the top of an uptrend"
    ],
    tradingImplication: "Suggests strong resistance level. Bearish reversal more likely when second candle is bearish.",
    reliability: "moderate",
    iconType: "bearish",
    imageFile: "tweezer_tops_pattern_diagram.png"
  },
  {
    id: "bearish-harami",
    name: "Bearish Harami",
    type: "bearish",
    category: "double",
    description: "A small bearish candle contained within the body of the previous larger bullish candle.",
    psychology: "After a strong bullish move, the small candle shows buying pressure is exhausting and sellers are emerging.",
    howToIdentify: [
      "First candle is large and bullish",
      "Second candle is small and bearish",
      "Second candle's body is within the first's body",
      "Appears after an uptrend"
    ],
    tradingImplication: "Potential reversal signal. Requires confirmation from subsequent candles.",
    reliability: "low",
    iconType: "bearish",
    imageFile: "bearish_harami_pattern_diagram.png"
  },

  // Triple Candle Patterns - Bullish
  {
    id: "morning-star",
    name: "Morning Star",
    type: "bullish",
    category: "triple",
    description: "A three-candle bullish reversal: bearish candle, small-bodied candle (star), and bullish candle.",
    psychology: "Downtrend continues, then indecision appears, followed by strong buying that reverses the trend.",
    howToIdentify: [
      "First candle is long and bearish",
      "Second candle gaps down and has a small body",
      "Third candle is bullish and closes well into the first candle's body",
      "Appears at the bottom of a downtrend"
    ],
    tradingImplication: "Strong bullish reversal signal. More reliable when the third candle closes above the first's midpoint.",
    reliability: "high",
    iconType: "bullish",
    imageFile: "morning_star_pattern_diagram.png"
  },
  {
    id: "morning-doji-star",
    name: "Morning Doji Star",
    type: "bullish",
    category: "triple",
    description: "Like a morning star but the middle candle is a doji, showing complete indecision before the reversal.",
    psychology: "The doji shows the battle between buyers and sellers reached a standstill before buyers won.",
    howToIdentify: [
      "First candle is long and bearish",
      "Second candle is a doji that gaps down",
      "Third candle is bullish and closes well into the first candle's body",
      "Doji indicates strong indecision"
    ],
    tradingImplication: "Very strong bullish reversal signal. The doji adds significance to the pattern.",
    reliability: "high",
    iconType: "bullish",
    imageFile: "morning_star_pattern_diagram.png"
  },
  {
    id: "three-white-soldiers",
    name: "Three White Soldiers",
    type: "bullish",
    category: "triple",
    description: "Three consecutive long bullish candles, each opening within the previous body and closing near its high.",
    psychology: "Sustained buying pressure over three periods indicates strong bullish momentum and conviction.",
    howToIdentify: [
      "Three consecutive bullish candles",
      "Each opens within the previous candle's body",
      "Each closes progressively higher",
      "Small or no upper shadows"
    ],
    tradingImplication: "Strong bullish continuation/reversal. Watch for exhaustion if candles get smaller.",
    reliability: "high",
    iconType: "bullish",
    imageFile: "three_white_soldiers_pattern.png"
  },
  {
    id: "three-inside-up",
    name: "Three Inside Up",
    type: "bullish",
    category: "triple",
    description: "A bullish harami followed by a bullish candle that closes above the first candle's high.",
    psychology: "Confirmation of the harami pattern - the third candle proves buyers have taken control.",
    howToIdentify: [
      "First candle is long and bearish",
      "Second candle is bullish and inside the first",
      "Third candle is bullish and closes above the first candle's high",
      "Appears in a downtrend"
    ],
    tradingImplication: "Reliable bullish reversal. The third candle provides confirmation.",
    reliability: "high",
    iconType: "bullish"
  },

  // Triple Candle Patterns - Bearish
  {
    id: "evening-star",
    name: "Evening Star",
    type: "bearish",
    category: "triple",
    description: "A three-candle bearish reversal: bullish candle, small-bodied candle (star), and bearish candle.",
    psychology: "Uptrend continues, then indecision appears, followed by strong selling that reverses the trend.",
    howToIdentify: [
      "First candle is long and bullish",
      "Second candle gaps up and has a small body",
      "Third candle is bearish and closes well into the first candle's body",
      "Appears at the top of an uptrend"
    ],
    tradingImplication: "Strong bearish reversal signal. More reliable when the third candle closes below the first's midpoint.",
    reliability: "high",
    iconType: "bearish",
    imageFile: "evening_star_pattern_diagram.png"
  },
  {
    id: "evening-doji-star",
    name: "Evening Doji Star",
    type: "bearish",
    category: "triple",
    description: "Like an evening star but the middle candle is a doji, showing complete indecision before the reversal.",
    psychology: "The doji shows the battle between buyers and sellers reached a standstill before sellers won.",
    howToIdentify: [
      "First candle is long and bullish",
      "Second candle is a doji that gaps up",
      "Third candle is bearish and closes well into the first candle's body",
      "Doji indicates strong indecision"
    ],
    tradingImplication: "Very strong bearish reversal signal. The doji adds significance to the pattern.",
    reliability: "high",
    iconType: "bearish",
    imageFile: "evening_star_pattern_diagram.png"
  },
  {
    id: "three-black-crows",
    name: "Three Black Crows",
    type: "bearish",
    category: "triple",
    description: "Three consecutive long bearish candles, each opening within the previous body and closing near its low.",
    psychology: "Sustained selling pressure over three periods indicates strong bearish momentum and conviction.",
    howToIdentify: [
      "Three consecutive bearish candles",
      "Each opens within the previous candle's body",
      "Each closes progressively lower",
      "Small or no lower shadows"
    ],
    tradingImplication: "Strong bearish continuation/reversal. Watch for exhaustion if candles get smaller.",
    reliability: "high",
    iconType: "bearish",
    imageFile: "three_black_crows_pattern.png"
  },
  {
    id: "three-inside-down",
    name: "Three Inside Down",
    type: "bearish",
    category: "triple",
    description: "A bearish harami followed by a bearish candle that closes below the first candle's low.",
    psychology: "Confirmation of the harami pattern - the third candle proves sellers have taken control.",
    howToIdentify: [
      "First candle is long and bullish",
      "Second candle is bearish and inside the first",
      "Third candle is bearish and closes below the first candle's low",
      "Appears in an uptrend"
    ],
    tradingImplication: "Reliable bearish reversal. The third candle provides confirmation.",
    reliability: "high",
    iconType: "bearish"
  },

  // Additional Important Patterns
  {
    id: "abandoned-baby-bullish",
    name: "Bullish Abandoned Baby",
    type: "bullish",
    category: "triple",
    description: "Rare but powerful pattern: bearish candle, gapped-down doji, then gapped-up bullish candle.",
    psychology: "Complete isolation of the doji shows a dramatic shift from selling to buying.",
    howToIdentify: [
      "First candle is bearish",
      "Second candle is a doji that gaps below the first",
      "Third candle gaps above the doji",
      "Clear gaps on both sides of the doji"
    ],
    tradingImplication: "Very rare and very reliable bullish reversal. Gaps make this pattern significant.",
    reliability: "high",
    iconType: "bullish"
  },
  {
    id: "abandoned-baby-bearish",
    name: "Bearish Abandoned Baby",
    type: "bearish",
    category: "triple",
    description: "Rare but powerful pattern: bullish candle, gapped-up doji, then gapped-down bearish candle.",
    psychology: "Complete isolation of the doji shows a dramatic shift from buying to selling.",
    howToIdentify: [
      "First candle is bullish",
      "Second candle is a doji that gaps above the first",
      "Third candle gaps below the doji",
      "Clear gaps on both sides of the doji"
    ],
    tradingImplication: "Very rare and very reliable bearish reversal. Gaps make this pattern significant.",
    reliability: "high",
    iconType: "bearish"
  }
];

export const getCandlesByType = (type: "bullish" | "bearish" | "neutral") =>
  candlestickPatterns.filter(p => p.type === type);

export const getCandlesByCategory = (category: "single" | "double" | "triple") =>
  candlestickPatterns.filter(p => p.category === category);

export const getCandlesByReliability = (reliability: "low" | "moderate" | "high") =>
  candlestickPatterns.filter(p => p.reliability === reliability);
