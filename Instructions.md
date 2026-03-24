# Trading Page — SMA Lines & Overlay Lines: Deep Research Report & Fix Plan

**Date:** March 24, 2026  
**Scope:** Full codebase audit of the SMA indicator lines and price overlay lines on the trading chart.

---

## 1. Executive Summary

The trading page chart (`pattern-chart.tsx`) is built on `lightweight-charts` and contains two distinct overlay systems: (a) **SMA indicator lines** (21 SMA white, 200 SMA yellow) that are rendered natively inside the chart canvas, and (b) **position/order overlay lines** (Entry, TP, SL, Liquidation) that have a split implementation — native `createPriceLine()` lines are visible but non-interactive, while a fully interactive `ChartOrderLines` component exists but is **never rendered**. 

The primary architectural problem is that these two systems are incomplete and out of sync. The SMA lines work well for the most part but have edge cases around coin history depth. The overlay line system is split between two implementations, leaving the interactive one dead.

---

## 2. File Map

| File | Role |
|---|---|
| `client/src/pages/trading.tsx` | Main trading page — hosts the chart, timeframe selector, AI toggle |
| `client/src/components/pattern-chart.tsx` | Core chart component — renders candlesticks, SMA21, SMA200, volume, RSI, StochRSI, and native price lines for positions/orders |
| `client/src/components/chart-order-lines.tsx` | Interactive overlay component for TP/SL/Entry/Liq — **exists but is not rendered anywhere** |
| `client/src/components/chart-pattern-overlay.tsx` | Pattern overlay — **dead code**, returns `null` unconditionally on line 14 |
| `client/src/components/sma-indicator.tsx` | SMA status panel used on the Signals page (not Trading page) |
| `server/hyperliquid.ts` | Fetches candle data from Hyperliquid API — requests 500 candles per call |
| `server/routes.ts` | Exposes `/api/hyperliquid/candles/:coin` — passes interval + time range to `getCandles()` |
| `server/sma-detection.ts` | Server-side SMA crossover detection for the Signals page — separate from chart rendering |

---

## 3. How the Chart Is Currently Built

### 3.1 Chart Library
The trading chart (`pattern-chart.tsx`) uses the **`lightweight-charts`** npm library (v5.x, already installed). This is NOT TradingView's free embed widget — it is a full programmable chart with direct JavaScript API access, giving us pixel-perfect control over all drawn elements.

Three stacked chart instances are created:
- **Main chart**: candlesticks + SMA21 + SMA200 + volume histogram + volume SMA
- **RSI chart**: 14-period RSI with 70/50/30 reference lines
- **Stoch RSI chart**: Stochastic RSI (14, 14, 3, 3) with K and D lines

All three charts share synchronized time-scale scrolling via `subscribeVisibleLogicalRangeChange`.

### 3.2 SMA Rendering Pipeline

**Data flow:**
```
Hyperliquid API (500 candles)
  → server/hyperliquid.ts getCandles()   [cached per-interval TTL]
  → GET /api/hyperliquid/candles/:coin
  → pattern-chart.tsx (React Query, refetch every 10s)
  → calcSMA(closes, times, 21)  → sma21SeriesRef.setData()
  → calcSMA(closes, times, 200) → sma200SeriesRef.setData()  [only if ≥200 candles]
```

**`calcSMA` function (line 65–73):**
```ts
function calcSMA(vals: number[], times: Time[], period: number) {
  const out = [];
  for (let i = period - 1; i < vals.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += vals[i - j];
    out.push({ time: times[i], value: s / period });
  }
  return out;
}
```
This is a correct simple moving average. The output array is shorter than `vals` by `period - 1` entries — this is expected behavior for SMA series in lightweight-charts.

**Update strategy:**
- **Full setData**: Called on initial load, symbol change, or interval change (`isKeyChange || isFirstLoad`).
- **Incremental update()**: Called for live bar updates (same symbol+interval). Only the last data point of each SMA is updated, which is correct since the previous candles' SMA values cannot change in a streaming scenario.
- **Fallback setData**: If more than 2 new candles arrive at once, or time goes backward (API returned stale data), a full `setData()` is triggered to recover.

**SMA bias indicator:** A small text badge ("21 > 200 · Bullish bias" or "21 < 200 · Bearish bias") is rendered in the top-left of the chart as an absolutely-positioned `div` overlay. This is re-computed client-side in a `useEffect` that watches the `candles` data.

### 3.3 Position/Order Overlay Lines — TWO Separate Implementations

#### Implementation A: `createPriceLine()` (active, non-interactive)
Inside `pattern-chart.tsx` (lines 574–607), a `useEffect` watches `positions` and `openOrders`. When a position exists for the current coin, it calls `candleSeriesRef.current.createPriceLine()` to draw native lightweight-charts price lines for:
- **TP** (green dashed, labeled "TP")
- **Entry** (blue dashed, labeled "Entry")
- **SL** (red dashed, labeled "SL")
- **Liquidation** (orange dashed, labeled "Liq.")

These lines are pixel-perfectly aligned with the chart's price scale because they use the chart's native API. They update automatically when `positions` or `openOrders` changes. **However, they are purely visual — there are no buttons to edit or cancel orders from these lines.**

#### Implementation B: `ChartOrderLines` component (inactive, interactive)
`client/src/components/chart-order-lines.tsx` is a full-featured React component that renders an absolutely-positioned overlay over the chart area. It includes:
- Dashed horizontal lines for Entry, TP, SL, and Liq
- Labeled pills showing price + size
- Edit (pencil) buttons that open an inline price input
- Cancel (X) buttons that call `cancelHLOrder`
- Confirm/cancel buttons for the inline edit

**Critical finding:** This component is **never imported or rendered in `trading.tsx` or `pattern-chart.tsx`**. It exists entirely as unused code. The interactive TP/SL edit/cancel functionality that it provides is inaccessible to users.

**Coordinate system limitation:** `ChartOrderLines` positions lines using a simplified CSS percentage scale:
```ts
const toYPct = (price: number) => ((rMax - price) / (rMax - rMin)) * 100;
```
Where `rMin` and `rMax` are computed from the minimum/maximum of all known price levels (Entry, TP, SL, Liq, currentPrice) plus 25% padding. This does **not** match the chart's actual visible price range — the chart's zoom/pan state is not accessible from this component. Lines will be at approximately correct vertical positions only when the chart happens to show a similar price range.

---

## 4. Issues Found

### Issue 1 — CRITICAL: `ChartOrderLines` is never rendered

**Files:** `client/src/components/chart-order-lines.tsx`, `client/src/pages/trading.tsx`

The interactive order line overlay component is fully implemented but never used. Users see native `createPriceLine()` lines (read-only) but have no way to edit or cancel TP/SL orders directly from the chart.

**Fix:** Import `ChartOrderLines` in `pattern-chart.tsx` and render it as an `absolute inset-0` child inside the main chart pane div (the `div` with `flexGrow: weights[0]`). Pass `coin` (already available as the `coin` variable) and `currentPrice` (already available as a prop).

Since `pattern-chart.tsx` already imports `useTrading` (for `positions` and `openOrders`), and `ChartOrderLines` also uses `useTrading` internally, no additional prop threading is needed for the data. The component is self-contained.

```tsx
// In pattern-chart.tsx main chart pane div:
<div style={{ flexGrow: weights[0], minHeight: 100 }} className="relative overflow-hidden">
  <div ref={mainContainerRef} className="absolute inset-0" data-testid="pattern-chart" />
  <ChartOrderLines coin={coin} currentPrice={currentPrice} />   {/* ADD THIS */}
  {/* ... rest of overlays */}
</div>
```

When `ChartOrderLines` is active, the duplicate native `createPriceLine()` lines in the chart will show as well, creating double lines. The `createPriceLine()` block in the price lines `useEffect` (lines 574–607 of `pattern-chart.tsx`) should be removed or disabled once `ChartOrderLines` is in place, since the component handles its own rendering.

---

### Issue 2 — HIGH: Coordinate mismatch between `ChartOrderLines` and the chart's price scale

**Files:** `client/src/components/chart-order-lines.tsx` lines 139–146

The CSS percentage-based Y positioning in `ChartOrderLines` will not match the chart's actual displayed price scale. When the chart is zoomed in or panned, the lightweight-charts canvas shows a different price range than the simple min/max-of-known-prices range used by the overlay.

**Example:** If BTC is at 85,000, entry is 84,500, TP is 86,000, SL is 84,000 — the overlay computes `rMin ≈ 83,700` and `rMax ≈ 86,300`. But if the user has zoomed the chart to show 80,000–90,000, the overlay's entry line at ~50% height will NOT align with 84,500 on the chart (which would appear at ~45% height on the zoomed chart).

**Partial fix (acceptable for MVP):** The mismatch is most visible when the chart is heavily zoomed out (showing a wide price range). The current ±25% padding already provides reasonable centering. The fix can be improved by using the `lightweight-charts` API to read the chart's visible price range:

```ts
// In pattern-chart.tsx, expose via a ref or callback:
const visibleRange = mainChartRef.current?.priceScale('right').getVisiblePriceRange();
```

Then pass `visibleMin` and `visibleMax` as props to `ChartOrderLines` so it uses the same price range as the chart for its CSS scaling. This requires a `subscribeVisiblePriceRangeChange` listener on the main chart.

**Full fix:** Replace the CSS overlay approach with `createPriceLine()` for display and a custom draggable extension using `lightweight-charts` coordinate APIs. This is more complex and is described in Issue 3 below.

---

### Issue 3 — HIGH: No drag-and-drop for TP/SL lines

**Files:** `client/src/components/chart-order-lines.tsx`, `client/src/pages/trading.tsx`

`ChartOrderLines` supports inline editing via a number input but no drag-and-drop. The previous `Instructions.md` (March 20 version) described a drag system that was designed for the TradingView iframe embed — which is no longer the active chart. The current chart is `lightweight-charts`, which has a full coordinate API.

The correct approach for a drag-and-drop implementation against `lightweight-charts`:
1. Listen to `mousedown` on the hit strip of a TP/SL line.
2. In `mousemove`, call `mainChartRef.current.priceScale('right').coordinateToPrice(e.clientY - chartTop)` to get the price at the cursor.
3. Call `placeTPSL()` on `mouseup` with the converted price.

This is significantly easier than the TradingView approach since there is no iframe boundary and the chart exposes a direct coordinate conversion API.

---

### Issue 4 — MEDIUM: SMA200 silently absent for new/low-history coins

**Files:** `client/src/components/pattern-chart.tsx` lines 463–465, `server/hyperliquid.ts` line 306

The server always requests 500 candles (going back `500 × msPerCandle` from now). For most coins on major timeframes, 500 candles of history is available from Hyperliquid and `sorted.length >= 200` will be true. However:

- **New listings** may have fewer than 200 candles on any timeframe — SMA200 won't display.
- **1D interval**: 500 candles = ~1.37 years. If a coin was listed less than 200 days ago, SMA200 won't appear.
- **No user feedback**: When SMA200 is absent, users see only the white SMA21 line. The SMA legend ("21" and "200") is always shown regardless of whether the 200-period SMA actually has data.

**Fix:** 
1. In `pattern-chart.tsx`, track whether SMA200 was actually set: `const sma200Available = sorted.length >= 200`.
2. In the SMA legend overlay, dim the "200" label or show "(N/A)" when SMA200 is unavailable.
3. In the SMA bias indicator, only show it when both SMAs are available (currently it shows even when `sma200 = 0` from `smaStatus`).

Specifically, the `smaStatus` effect (lines 244–256) sets `sma200: 0` when `sma200` array is empty, and then `isBullish: sma21 > sma200` would always be `true` (any positive number > 0). This is a bug — the bias badge will show "Bullish bias" for any coin where SMA200 cannot be computed (new listings), which is incorrect.

**Root bug code:**
```ts
const s200 = sma200.length > 0 ? sma200[sma200.length - 1].value : 0;
if (s21 > 0) setSmaStatus({ sma21: s21, sma200: s200, isBullish: s21 > s200 });
//                                                    ↑ s200=0 makes s21 always > s200
```

**Fix:**
```ts
const s200 = sma200.length > 0 ? sma200[sma200.length - 1].value : null;
if (s21 > 0 && s200 !== null) {
  setSmaStatus({ sma21: s21, sma200: s200, isBullish: s21 > s200 });
}
```
This ensures the bias badge only shows when a valid SMA200 is available.

---

### Issue 5 — LOW: `chart-pattern-overlay.tsx` is dead code

**File:** `client/src/components/chart-pattern-overlay.tsx` line 14

The file returns `null` unconditionally with a comment "Don't render any overlay - patterns shown in separate panel instead." The code below `return null` is unreachable. The `LivePattern` type it imports from `@shared/schema` may or may not still exist.

**Fix:** Either delete the file entirely or consolidate any logic that was meant to go there into `pattern-chart.tsx`'s signal overlay card. If keeping the file, remove the dead code to avoid confusion.

---

### Issue 6 — LOW: RSI/StochRSI recalculated from full candle history on every live tick

**File:** `client/src/components/pattern-chart.tsx` lines 551–563

In the incremental update path (non-setData), the code calls `calcRSI(closes, times, 14)` over ALL candles every 10 seconds (the refetch interval). For a 1m chart with 500 candles, this calculates RSI over all 500 data points just to get the last value. It should only `update()` the last RSI point, not recalculate from scratch.

For RSI and Stoch RSI, an incremental calculation approach would:
1. Store the last `gain`, `loss`, `RSI` values in refs.
2. On each new candle, apply the Wilder smoothing formula incrementally.

This is an optimization, not a critical bug — but it adds unnecessary computation on every live update.

---

## 5. Step-by-Step Fix Plan

Work in this order. Each step can be independently tested.

### Step 1 — Fix the false "Bullish bias" badge for low-history coins (Issue 4) ← Quick win

In `pattern-chart.tsx`, update the SMA status effect:

```ts
// Line ~253
const s200 = sma200.length > 0 ? sma200[sma200.length - 1].value : null;
if (s21 > 0 && s200 !== null) {
  setSmaStatus({ sma21: s21, sma200: s200, isBullish: s21 > s200 });
} else if (s21 > 0) {
  setSmaStatus({ sma21: s21, sma200: 0, isBullish: false });
  // Or: setSmaStatus(null) to hide the badge entirely
}
```

Also update the SMA legend to visually indicate when SMA200 is not available:
```tsx
<span className="flex items-center gap-1" style={{ opacity: sorted.length >= 200 ? 1 : 0.35 }}>
  <span className="inline-block w-4 h-0.5" style={{ background: "#f5e642" }} />
  <span className="text-[9px] text-[#b2b5be]">200{sorted.length < 200 ? " (N/A)" : ""}</span>
</span>
```

---

### Step 2 — Render `ChartOrderLines` inside the chart area (Issue 1)

1. Import `ChartOrderLines` in `pattern-chart.tsx`:
   ```ts
   import { ChartOrderLines } from "@/components/chart-order-lines";
   ```

2. Add it as a child of the main chart pane div, after the `mainContainerRef` div:
   ```tsx
   <div style={{ flexGrow: weights[0], minHeight: 100 }} className="relative overflow-hidden">
     <div ref={mainContainerRef} className="absolute inset-0" data-testid="pattern-chart" />
     <ChartOrderLines coin={coin} currentPrice={currentPrice} />
     {/* ... loading overlay, signal card, SMA legend */}
   </div>
   ```

3. Remove the duplicate native `createPriceLine()` block from `pattern-chart.tsx` (lines 574–607) to avoid double lines. Or, keep the native lines for accurate positioning and hide the CSS overlay line (show only the pill labels from `ChartOrderLines` without the dashed line).

---

### Step 3 — Fix coordinate alignment (Issue 2)

Subscribe to the chart's visible price range and pass it to `ChartOrderLines`:

1. In `pattern-chart.tsx`, add state:
   ```ts
   const [visiblePriceRange, setVisiblePriceRange] = useState<{ min: number; max: number } | null>(null);
   ```

2. In the chart initialization effect, after creating the main chart, add a subscription:
   ```ts
   mainChart.priceScale('right').subscribeVisiblePriceRangeChange(range => {
     if (range) setVisiblePriceRange({ min: range.minValue, max: range.maxValue });
   });
   ```

3. Pass to `ChartOrderLines`:
   ```tsx
   <ChartOrderLines 
     coin={coin} 
     currentPrice={currentPrice} 
     visiblePriceRange={visiblePriceRange}
   />
   ```

4. In `ChartOrderLines`, add an optional `visiblePriceRange` prop. When provided, use its `min`/`max` instead of the locally computed `rMin`/`rMax` for the CSS Y positioning.

---

### Step 4 — Add drag-and-drop TP/SL (Issue 3)

This replaces the inline-edit approach with a drag approach that uses `lightweight-charts` coordinate APIs:

1. In `pattern-chart.tsx`, expose the chart ref via a `forwardRef` or by passing a `chartRef` callback prop.
2. In `ChartOrderLines`, accept a `priceToCoordinate` and `coordinateToPrice` function pair.
3. On `mousedown` of a TP/SL line's hit strip:
   - Record `dragging = true`, `dragType = "tp" | "sl"`.
   - Capture `containerTop = containerRef.current.getBoundingClientRect().top`.
4. On `mousemove`:
   - Compute `yRelative = e.clientY - containerTop`.
   - Convert to price via `coordinateToPrice(yRelative)`.
   - Update a `dragPrice` state.
5. On `mouseup`:
   - Call `placeTPSL(coin, isLong, tp, sl, entryPrice)`.
   - Reset drag state.

Since there is no iframe in this chart (unlike the TradingView widget), there is no mouse capture problem. Standard `window.addEventListener` on `mousemove`/`mouseup` will work reliably.

---

### Step 5 — Clean up dead code (Issue 5)

Delete or repurpose `client/src/components/chart-pattern-overlay.tsx`. Update any import references if they exist. Since the file currently returns `null`, deleting it has no visual effect.

---

## 6. Summary Table

| # | Severity | Issue | Files | Fix Complexity |
|---|---|---|---|---|
| 1 | Critical | `ChartOrderLines` component not rendered — TP/SL edit/cancel inaccessible | `pattern-chart.tsx`, `chart-order-lines.tsx` | Low — add import + JSX line |
| 2 | High | CSS overlay Y positions don't match chart price scale | `chart-order-lines.tsx`, `pattern-chart.tsx` | Medium — subscribe to price range, pass as prop |
| 3 | High | No drag-and-drop for TP/SL; only inline text input | `chart-order-lines.tsx` | High — new drag logic using chart coordinate API |
| 4 | Medium | SMA200 absence causes false "Bullish bias" badge for new coins | `pattern-chart.tsx` | Low — null-guard SMA200 value |
| 5 | Low | `chart-pattern-overlay.tsx` is dead unreachable code | `chart-pattern-overlay.tsx` | Low — delete file |
| 6 | Low | RSI/StochRSI recalculated from full history on every live tick | `pattern-chart.tsx` | Medium — incremental calculation with refs |

---

## 7. Architecture Notes

### Why `lightweight-charts` enables cleaner overlays than TradingView widget
The previous `Instructions.md` (March 20, 2026) documented iframe capture race conditions as the primary drag-and-drop blocker. That problem was specific to the TradingView embed widget (cross-origin iframe). The current chart uses `lightweight-charts` directly in the React component tree — there is no iframe. This means:
- Mouse events on overlay elements work normally without any capture div hacks.
- The chart exposes `priceScale().coordinateToPrice()` and `priceScale().priceToCoordinate()` for pixel-perfect drag-to-price conversion.
- All series (SMA, RSI, etc.) are directly in the React component's refs, enabling tight coordination with overlay components.

### SMA calculation accuracy
The client-side `calcSMA` function uses a simple loop sum (O(n×period) per call). For 500 candles and period=200, this is 500×200 = 100,000 iterations per update — fast enough in practice. The calculation matches Hyperliquid's own charting exactly because it uses the same close prices from the same API.

### Data freshness
Candles are refetched every 10 seconds (`refetchInterval: 10000`). The server cache TTL per interval is defined in `server/hyperliquid.ts` (`CANDLE_CACHE_TTL`). The chart uses a smart setData vs update() strategy to minimize redraws: only the last candle's data is pushed via `update()` on each refetch when the symbol/interval hasn't changed.

---

*End of report. All code references are to the current state of the repository as of March 24, 2026.*
