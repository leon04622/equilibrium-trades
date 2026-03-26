/**
 * STABLE TP/SL IMPLEMENTATION — DO NOT MODIFY WITHOUT FULL TESTING
 *
 * This file documents the locked integration between:
 * - `client/src/components/pattern-chart.tsx` — native `IPriceLine` for TP / SL / ghosts; passes
 *   `coordinateToPrice`, `priceToCoordinate`, `nativeTpslLines`, drag callbacks to the overlay.
 * - `client/src/components/chart-order-lines.tsx` — HTML overlay: drag bands, entry/PnL/liq labels,
 *   TP/SL tags, `placeTPSL` / `cancelHLOrder`, inline edit.
 *
 * Layout contract: `PatternChart` must sit in a parent with a **stable, flex-derived height**
 * (`flex-1 min-h-0` in a simple row). Chart/bottom **percentage flex splits** in `trading.tsx`
 * caused misalignment between canvas price lines and overlay hit-testing (symptom: broken drag,
 * flicker, lines “wrong”). Revert those splits before touching TP/SL math.
 *
 * Bump `CHART_TPSL_STABLE_VERSION` only when intentionally shipping a tested TP/SL change.
 */
export const CHART_TPSL_STABLE_VERSION = 2 as const;
