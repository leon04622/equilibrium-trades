/**
 * Read-only position / TP / SL labels aligned to the candlestick series.
 * Data comes only from TradingContext (refreshAccount). No drag, edit, or local TP/SL state.
 */
import { useMemo, useState, useEffect, useRef, type CSSProperties } from "react";
import { useTrading } from "@/lib/trading-context";
import { selectTpSlOrders } from "@/lib/chart-tpsl-from-orders";
import { cn } from "@/lib/utils";

const HL_TP = "#0ecb81";
const HL_SL = "#f6465d";
const HL_GUTTER_PX = 72;
const HL_TAG_BG = "rgba(19, 23, 34, 0.96)";

function fmt(p: number): string {
  if (!p || p === 0) return "0";
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtSize(s: number): string {
  if (s < 0.001) return s.toFixed(6);
  if (s < 1) return s.toFixed(4);
  return s.toFixed(3);
}

function fmtPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

type LineLayout = { mode: "px"; y: number } | { mode: "pct"; pct: number };

function layoutForPrice(
  price: number,
  priceToCoordinate: ((p: number) => number | null) | undefined,
  effMin: number,
  effMax: number,
): LineLayout {
  if (priceToCoordinate) {
    const y = priceToCoordinate(price);
    if (y !== null && Number.isFinite(y)) return { mode: "px", y };
  }
  const span = effMax - effMin || 1;
  return { mode: "pct", pct: ((effMax - price) / span) * 100 };
}

interface Props {
  coin: string;
  currentPrice: number;
  visiblePriceRange?: { min: number; max: number } | null;
  priceToCoordinate?: (price: number) => number | null;
}

export function HlReadonlyChartOverlay({
  coin,
  currentPrice,
  visiblePriceRange,
  priceToCoordinate,
}: Props) {
  const { positions, openOrders } = useTrading();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const position = useMemo(() => positions.find((p) => p.coin === coin), [positions, coin]);
  const { tpPrice, slPrice } = useMemo(
    () => selectTpSlOrders(coin, position, openOrders),
    [coin, position, openOrders],
  );

  if (!position) return null;

  const isLong = position.side === "long";
  const entry = position.entryPrice;
  const size = position.size;
  const unrealizedPnl =
    position.unrealizedPnl ?? (isLong ? size * (currentPrice - entry) : size * (entry - currentPrice));
  const pnlPositive = unrealizedPnl >= 0;
  const liqPrice = position.liquidationPrice;

  const priceLevels: number[] = [currentPrice, entry].filter((p) => p > 0);
  if (tpPrice) priceLevels.push(tpPrice);
  if (slPrice) priceLevels.push(slPrice);
  if (liqPrice && liqPrice > 0) priceLevels.push(liqPrice);

  const rawMin = Math.min(...priceLevels);
  const rawMax = Math.max(...priceLevels);
  const span = rawMax - rawMin || currentPrice * 0.06;
  const pad = span * 0.25;
  const effMin = visiblePriceRange?.min ?? rawMin - pad;
  const effMax = visiblePriceRange?.max ?? rawMax + pad;

  const centerStyleFromLayout = (layout: LineLayout): CSSProperties => {
    if (layout.mode === "px") {
      return { top: layout.y, transform: "translateY(-50%)" };
    }
    return { top: `${layout.pct}%`, transform: "translateY(-50%)" };
  };

  type Row = {
    key: string;
    price: number;
    lineColor: string;
    color: string;
    dashed: boolean;
    label: string;
    pnlLabel?: string;
    sizeLabel: string;
    labelSide: "left" | "right";
    rowZ: number;
    kind: "entry" | "liq" | "tp" | "sl";
  };

  const rows: Row[] = [];
  rows.push({
    key: "entry",
    price: entry,
    color: "text-blue-400",
    lineColor: "#60a5fa",
    dashed: true,
    label: `Entry ${fmt(entry)}`,
    pnlLabel: `PNL ${fmtPnl(unrealizedPnl)}`,
    sizeLabel: fmtSize(size),
    labelSide: "left",
    rowZ: 14,
    kind: "entry",
  });

  if (liqPrice && liqPrice > 0) {
    rows.push({
      key: "liq",
      price: liqPrice,
      color: "text-orange-400",
      lineColor: "#f97316",
      dashed: true,
      label: `Liq. ${fmt(liqPrice)}`,
      sizeLabel: "",
      labelSide: "left",
      rowZ: 12,
      kind: "liq",
    });
  }

  if (tpPrice && tpPrice > 0) {
    rows.push({
      key: "tp",
      price: tpPrice,
      color: "text-[#0ecb81]",
      lineColor: HL_TP,
      dashed: false,
      label: "TP",
      sizeLabel: fmtSize(size),
      labelSide: "right",
      rowZ: 42,
      kind: "tp",
    });
  }

  if (slPrice && slPrice > 0) {
    rows.push({
      key: "sl",
      price: slPrice,
      color: "text-[#f6465d]",
      lineColor: HL_SL,
      dashed: false,
      label: "SL",
      sizeLabel: fmtSize(size),
      labelSide: "right",
      rowZ: 46,
      kind: "sl",
    });
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[17] overflow-hidden pointer-events-none"
      style={{ height: containerHeight || undefined }}
      data-testid="hl-readonly-chart-overlay"
    >
      {rows.map((row) => {
        const layout = layoutForPrice(row.price, priceToCoordinate, effMin, effMax);
        if (layout.mode === "pct" && (layout.pct < -12 || layout.pct > 112)) return null;
        if (layout.mode === "px" && (layout.y < -80 || layout.y > containerHeight + 80)) return null;

        const centerStyle = centerStyleFromLayout(layout);
        const z = row.rowZ;

        return (
          <div
            key={row.key}
            className="pointer-events-none absolute left-0 right-0"
            style={{ ...centerStyle, zIndex: z }}
          >
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 opacity-[0.78]"
              style={{
                right: HL_GUTTER_PX,
                height: row.dashed ? 0 : 1,
                borderTopWidth: row.dashed ? 1 : 0,
                borderTopStyle: row.dashed ? "dashed" : undefined,
                borderTopColor: row.dashed ? row.lineColor : undefined,
                backgroundColor: row.dashed ? undefined : row.lineColor,
              }}
            />
            {row.labelSide === "right" ? (
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-stretch justify-center"
                style={{ width: HL_GUTTER_PX, zIndex: z + 4 }}
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-0.5 pl-1 pr-0.5 py-0.5 font-mono tabular-nums select-none",
                    "border-y border-r border-white/[0.08] rounded-r-sm rounded-l-none",
                  )}
                  style={{
                    minHeight: 22,
                    background: HL_TAG_BG,
                    borderLeft: `2px solid ${row.lineColor}`,
                  }}
                >
                  <div className="flex flex-col items-end leading-tight min-w-0 flex-1 overflow-hidden">
                    <span className={cn("text-[10px] font-semibold leading-tight truncate w-full text-right", row.color)}>
                      {row.kind === "tp" ? `TP: $${fmt(row.price)}` : `SL: $${fmt(row.price)}`}
                    </span>
                    <span className="text-[8px] text-white/35 font-normal truncate text-right w-full">{row.sizeLabel}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute left-2 top-1/2 -translate-y-1/2" style={{ zIndex: 30 }}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1 rounded text-[11px] font-mono font-semibold",
                    "bg-[#1a1f2e] border border-white/15 shadow-lg select-none whitespace-nowrap",
                    row.color,
                  )}
                >
                  {row.pnlLabel ? (
                    <>
                      <span
                        className={cn("text-[10px] font-semibold", pnlPositive ? "text-[#22c55e]" : "text-[#ef4444]")}
                      >
                        {row.pnlLabel}
                      </span>
                      <span className="opacity-50">{row.sizeLabel}</span>
                    </>
                  ) : (
                    <>
                      <span>{row.label}</span>
                      {row.sizeLabel && <span className="opacity-50">{row.sizeLabel}</span>}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
