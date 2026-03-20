# TP/SL Drag-and-Drop — Deep Research Report & Fix Plan

**Date:** March 20, 2026  
**Scope:** Full codebase audit of the drag-and-drop Take Profit / Stop Loss functionality on the trading chart.

---

## 1. Executive Summary

The drag-and-drop TP/SL system is architecturally sound and partially functional — the console logs confirm that orders **are** being signed and submitted to Hyperliquid in response to drag interactions. However, there are **five distinct bugs** that combine to make the experience unreliable, visually broken, or completely inoperable depending on the browser and user behavior. The single most damaging bug is an **iframe mouse-capture race condition** that causes the drag to silently die mid-gesture whenever the cursor drifts over the TradingView chart area.

---

## 2. Relevant Files

| File | Role |
|---|---|
| `client/src/components/chart-order-lines.tsx` | Renders the TP/SL/Entry/Liq overlay lines; owns all drag logic (`startDrag`, `onMove`, `onUp`) |
| `client/src/pages/trading.tsx` | Hosts the chart + overlay; renders `<ChartOrderLines>` inside both desktop and mobile chart wrappers |
| `client/src/components/trading-view-chart.tsx` | Embeds the TradingView Advanced Chart Widget inside an `<iframe>` |
| `client/src/lib/trading-context.tsx` | Provides `placeTPSL`, `cancelHLOrder`, and all position/order state |
| `client/src/components/active-position-panel.tsx` | Side-panel TP/SL text inputs; shares `placeTPSL` logic but is separate from the chart overlay |

---

## 3. How the Feature Is Supposed to Work

1. When a position exists for the selected coin, `ChartOrderLines` renders horizontal lines for Entry, TP, SL, and Liquidation on an `absolute inset-0` overlay div placed over the chart.
2. Each TP/SL line has an invisible 28px-tall "hit strip" (`pointerEvents: auto`) that the user can grab.
3. On `mousedown` on the hit strip, `startDrag` freezes the current price scale (`rMin`, `rMax`, `containerTop`, `containerHeight`) and sets `dragging = true`.
4. A React effect listening to `dragging` attaches `mousemove`/`mouseup` to `window`.
5. `onMove` converts the cursor's Y-pixel into a price using the frozen scale and updates `dragPrice`.
6. When the mouse is released (`onUp`), the final price is submitted via `placeTPSL`, which cancels any existing TP/SL orders and places new trigger orders on Hyperliquid.
7. A `fixed inset-0 z-[999]` capture div is rendered while dragging to prevent the TradingView iframe from stealing mouse events.

---

## 4. Root Causes & Bugs Found

### Bug 1 — CRITICAL: Iframe Mouse-Capture Race Condition

**File:** `chart-order-lines.tsx` lines 324–326 and 135–195  
**File:** `trading.tsx` lines 333–346

**What happens:**  
The TradingView Advanced Chart Widget embeds as a cross-origin `<iframe>` (src: `https://s3.tradingview.com/...`). Once a mouse pointer enters the iframe's viewport, the browser routes all subsequent `mousemove` and `mouseup` events into the iframe's document — they **never reach the parent window**. The current code relies on `window.addEventListener('mousemove', onMove)` which will stop receiving events the moment the cursor slides over the chart.

The capture div (`fixed inset-0 z-[999]`) is designed to block this, but it is rendered via React state (`setDragging(true)`). This creates a timing gap:

```
User presses mouse on drag strip
  → startDrag() → setDragging(true)                  [sync]
  → React schedules re-render                         [async, next tick]
  → User's mouse moves 2px into the iframe area       [happens in the same frame]
  → Iframe captures all mouse events from this point  [browser-level, irreversible]
  → React re-renders, capture div appears             [too late]
  → onMove and onUp never fire on window again        [drag is dead]
```

This is a classic cross-iframe drag problem. It means the drag works only when the user keeps the mouse strictly within the hit strip width (the 28px strip itself), which on a chart spanning hundreds of pixels is an unreasonably narrow target.

**Evidence:** The console logs show orders being placed — but only when the drag completes without the mouse crossing into the chart area. When the drag dies silently, nothing is logged.

**Fix:** Remove React state from the capture mechanism. Instead, keep a persistent `<div>` as a sibling of the TradingView chart that is always in the DOM, and toggle it synchronously from the `mousedown` handler using a `ref` (no React re-render needed). Because the div is a sibling rendered ABOVE the iframe in the stacking order, it will intercept all mouse events before they reach the iframe.

Concretely:

- In `trading.tsx`, add a `chartCaptureRef = useRef<HTMLDivElement>(null)` and render:
  ```tsx
  <div className="hidden md:block flex-1 min-w-0 relative">
    <TradingViewChart ... />
    {/* Drag capture layer — always present, activated by ref */}
    <div
      ref={chartCaptureRef}
      className="absolute inset-0 z-[50] cursor-ns-resize"
      style={{ pointerEvents: "none" }}
    />
    <ChartOrderLines coin={coin} currentPrice={price} captureRef={chartCaptureRef} />
  </div>
  ```
- Pass `captureRef` as a prop to `ChartOrderLines`.
- In `startDrag`, synchronously set `captureRef.current.style.pointerEvents = "all"` BEFORE any state update.
- In `onUp`, synchronously set it back to `"none"`.
- Remove the `{dragging && <div className="fixed inset-0..." />}` block — the ref-based approach is faster and more reliable.

---

### Bug 2 — HIGH: Overlay Coordinate System Is Decoupled from TradingView

**File:** `chart-order-lines.tsx` lines 82–103

**What happens:**  
The overlay computes its own price-to-pixel mapping using only the prices it knows about (entry, TP ghost, SL ghost, liquidation, current price):

```ts
const { toY, fromY, rMin, rMax } = useMemo(() => {
  const allPrices = [currentPrice, position?.entryPrice, activeTpPrice ?? ghostTpPrice, ...];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const span = maxP - minP || currentPrice * 0.04;
  const pad = span * 0.40;
  const rMin = minP - pad;
  const rMax = maxP + pad;
  ...
}, [...]);
```

The TradingView chart widget renders with its own internal price scale that reflects the user's current zoom level and chart pan position. These two scales are **completely independent**. The TradingView API (the free embedding version used here) exposes no JavaScript interface to read its visible price range.

**Consequence:** The horizontal lines drawn by the overlay will appear at Y-positions that do not correspond to those prices on the underlying candle chart. If the user has zoomed into a tight price range on TradingView but the overlay scale spans a much wider range, the TP line might appear in the middle of the chart even though TradingView shows that price near the top. The lines are effectively floating decorations that do not accurately mark chart prices.

**What can be fixed now (partial):**  
- Use a consistent, broad scale (e.g., ±10% around `currentPrice`) so lines always have room to move anywhere on the chart.
- Add a clear label or note in the UI that says "Overlay scale may not match chart zoom."

**Full fix (requires chart change):**  
To achieve true price alignment, the TradingView widget must be replaced with **Lightweight Charts** (`lightweight-charts` npm package, already installed for `pattern-chart.tsx`). Lightweight Charts exposes `chart.priceScale().coordinateToPrice()` and `chart.timeScale()` programmatically. This is the only way to achieve a pixel-perfect drag-and-drop experience against the candle data.

The `pattern-chart.tsx` component already demonstrates a full working implementation of Lightweight Charts with SMA overlays. Migrating the main trading chart to Lightweight Charts would unblock both Bug 1 and Bug 2 simultaneously (no iframe means no capture issue; direct API access means no coordinate mismatch).

---

### Bug 3 — MEDIUM: No Real-Time Visual Feedback on Invalid Drag Zone

**File:** `chart-order-lines.tsx` lines 138–156 (`onMove`)  
**File:** `trading-context.tsx` lines 571–591 (`placeTPSL` validation)

**What happens:**  
When the user drags a TP line below the entry price (for a long), `placeTPSL` will reject it with an error message. But during the drag, the line renders in green regardless of whether the current drag price is valid. There is no visual cue that the line has entered an invalid zone until the user releases the mouse and sees the toast error.

**Consequence:** Users get confused when they release the drag and see an error. They do not know where the valid zone boundary is.

**Fix:**  
In `onMove`, compute whether the current `newPrice` is valid (TP must be above entry for longs, below for shorts; SL must be below entry for longs, above for shorts). Pass this to a `dragInvalid` state. In the render, change the dragging line's color from green/red to orange/white when `dragInvalid` is true, and show a tooltip like "Must be above entry." The entry line itself can act as a visual boundary indicator during a drag.

---

### Bug 4 — MEDIUM: Ghost Lines Are Too Faint to Discover

**File:** `chart-order-lines.tsx` lines 248–250, 388

**What happens:**  
Ghost lines (shown when no TP/SL is set) render at 45% opacity for the line and 60% opacity for the pill. The text reads "Drag to set TP" but because the overall element is so faint and blends into the chart background, many users will never notice they exist or that they are interactive.

Additionally, the hit strip (`cursor-ns-resize`) does not provide any hover state feedback — there is no visual highlight when the cursor hovers over a draggable strip.

**Fix:**  
- Increase ghost line opacity from 0.45 to 0.65 (line) and 0.75 (pill).
- Add a hover effect to the hit strip: on hover, increase the line opacity to 1 and change the pill to a slightly brighter background (e.g., `hover:opacity-100`).
- Consider adding a subtle blinking/pulsing animation to ghost lines to draw attention.
- Add `title="Drag to move"` to the hit strip div for native browser tooltip.

---

### Bug 5 — LOW: Drag Freezes Captured Container Bounds (No Scroll-Safe Guard)

**File:** `chart-order-lines.tsx` lines 118–128 (`startDrag`)

**What happens:**  
`containerTop` and `containerHeight` are captured via `container.getBoundingClientRect()` at the moment of `mousedown`. If the page scrolls or the layout shifts while the user is dragging (e.g., a toast notification appears, pushing content down), `containerTop` becomes stale and the price-to-pixel mapping drifts — the line will no longer track the cursor correctly.

**Fix:**  
Read `containerRef.current.getBoundingClientRect()` dynamically in `onMove` rather than freezing it at drag start. Only freeze `rMin`/`rMax` (the price scale) — those must not change during drag to keep the price-to-visual mapping stable.

Change `onMove` from:
```ts
const yPct = ((e.clientY - state.containerTop) / state.containerHeight) * 100;
```
To:
```ts
const rect = containerRef.current?.getBoundingClientRect();
if (!rect) return;
const yPct = ((e.clientY - rect.top) / rect.height) * 100;
```

---

## 5. Secondary Issues Observed

### Hooks Error in `ActivePositionPanel`

**File:** `client/src/components/active-position-panel.tsx`  
**Console error:** `Rendered more hooks than during the previous render`

The browser console shows this React invariant violation occurring in `ActivePositionPanel`. This happens when hooks are called conditionally or when the number of hooks in a component changes between renders. In `active-position-panel.tsx`, all hooks are declared before the early return (`if (!position) return null`), which looks correct, but the `getOrderType` `useCallback` depends on `position` which can be `undefined`. If this hook's dependency array causes it to be skipped in some renders, it would trigger the error.

This error does not directly break the drag-and-drop, but it causes cascading React tree errors that can crash components, including potentially `ChartOrderLines` if it's in the same render tree.

**Fix:** Audit the `useCallback` dependencies in `active-position-panel.tsx`. Ensure `getOrderType` handles the `position === undefined` case inside the callback without relying on it in the dependency array in a way that changes hook call count.

---

### `placeTPSL` Cancels ALL Trigger Orders, Not Just TP or SL

**File:** `trading-context.tsx` lines 594–598

```ts
const existingOrders = openOrders.filter(o => o.coin === coin && o.triggerPx);
for (const order of existingOrders) {
  await hlCancelOrder(signer, coin, order.oid);
}
```

When dragging only the TP, this code cancels both the existing TP AND the existing SL before placing the new TP. The SL is then re-placed using the stale `activeSlPrice` from the `onUp` closure. If `refreshAccount()` is slow or the `openOrders` state is slightly out of date, the SL may be placed with a wrong price or not placed at all.

**Fix:** Filter `existingOrders` to only cancel the specific order type being dragged (TP only when dragging TP, SL only when dragging SL). This prevents unnecessary cancellation of the untouched order.

---

## 6. Step-by-Step Fix Plan

Work through these in order. Each step is independent enough to be tested before proceeding to the next.

### Step 1 — Fix the iframe capture race condition (Bug 1) ← Do this first

1. In `trading.tsx`, add a `chartCaptureRef` for both desktop and mobile chart wrappers.
2. Pass the ref to `ChartOrderLines` as a new optional prop: `captureRef?: React.RefObject<HTMLDivElement>`.
3. In `startDrag` (line 108–133 of `chart-order-lines.tsx`), add immediately before `setDragging(true)`:
   ```ts
   if (captureRef?.current) captureRef.current.style.pointerEvents = "all";
   ```
4. In `onUp` (line 158–187), add at the very start of the function:
   ```ts
   if (captureRef?.current) captureRef.current.style.pointerEvents = "none";
   ```
5. Remove the React-rendered capture div (`{dragging && <div className="fixed inset-0 z-[999]..." />}`).
6. Render a persistent but initially-passive capture div as a direct sibling of the TradingView chart in `trading.tsx`:
   ```tsx
   <div
     ref={chartCaptureRef}
     className="absolute inset-0 z-[50] cursor-ns-resize"
     style={{ pointerEvents: "none" }}
   />
   ```

### Step 2 — Fix stale container bounds (Bug 5)

In `chart-order-lines.tsx`, inside `onMove`, replace the use of `state.containerTop` and `state.containerHeight` with a live `getBoundingClientRect()` call on `containerRef.current`. Keep `state.rMin` and `state.rMax` frozen (they must stay constant for the price mapping to work).

### Step 3 — Add drag-zone validation feedback (Bug 3)

1. Add a `dragInvalid` state boolean to `ChartOrderLines`.
2. In `onMove`, after computing `newPrice`, check if it's on the wrong side of `entry`:
   - For TP: invalid if `(isLong && newPrice <= entry) || (!isLong && newPrice >= entry)`
   - For SL: invalid if `(isLong && newPrice >= entry) || (!isLong && newPrice <= entry)`
3. Call `setDragInvalid(isInvalid)`.
4. When `dragInvalid` is true, render the dragging line in orange instead of its normal color.
5. In `onUp`, if `dragInvalid` is true, show a toast and skip calling `placeTPSL`.

### Step 4 — Improve ghost line visibility (Bug 4)

In `chart-order-lines.tsx`:
- Change ghost line opacity from 0.45 → 0.7 (line style, not via the `opacity` key but by adjusting the rgba alpha directly).
- Change ghost pill opacity from `opacity-60` → `opacity-80`.
- Add `hover:opacity-100 transition-opacity` to the draggable hit strip div.
- Add `title="Drag to move"` attribute to the hit strip.

### Step 5 — Fix selective TP/SL cancellation (Secondary issue)

In `trading-context.tsx`, change the cancel logic in `placeTPSL` to only cancel the specific order type being replaced. The caller should pass which type (`"tp"` | `"sl"` | `"both"`) it is updating, or the function can infer it from which of `tpPrice`/`slPrice` is provided.

### Step 6 — Fix hooks violation in `ActivePositionPanel`

Add console logging around the `getOrderType` `useCallback` to confirm the exact cause of the hooks error, then restructure the callback so `position` is read from a ref (not the closure) to prevent hook count changes.

### Step 7 — Long-term: Migrate main chart to Lightweight Charts (Bug 2)

This is a significant change and should be treated as a separate task. The `pattern-chart.tsx` file demonstrates a working Lightweight Charts implementation. Extending it to support all the indicators currently handled by the TradingView widget (`MASimple`, `MAExp`, `BB`, `VWAP`, etc.) and wiring it to `chartSeries.priceToCoordinate()` would permanently solve both the iframe capture issue and the coordinate alignment issue.

---

## 7. Summary Table

| # | Severity | Bug | File(s) | Fix Complexity |
|---|---|---|---|---|
| 1 | Critical | Iframe capture race condition breaks drag mid-gesture | `chart-order-lines.tsx`, `trading.tsx` | Medium — ref-based capture layer swap |
| 2 | High | Overlay price scale doesn't match TradingView chart | `chart-order-lines.tsx` | High — requires chart migration for full fix |
| 3 | Medium | No visual feedback when drag enters invalid price zone | `chart-order-lines.tsx` | Low — add state + color logic |
| 4 | Medium | Ghost lines too faint; no hover feedback on drag strip | `chart-order-lines.tsx` | Low — CSS/opacity changes |
| 5 | Low | Stale container bounds if layout shifts during drag | `chart-order-lines.tsx` | Low — move `getBoundingClientRect` into `onMove` |
| 6 | Low | All trigger orders cancelled when only one type dragged | `trading-context.tsx` | Low — filter cancel list |
| 7 | Low | Hooks violation in `ActivePositionPanel` | `active-position-panel.tsx` | Low — dependency audit |

---

*End of report. All code references are to the current state of the repository as of March 20, 2026.*
