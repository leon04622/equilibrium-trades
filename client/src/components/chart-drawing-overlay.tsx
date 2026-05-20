import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Time,
} from "lightweight-charts";
import { lightweightTimeToSeconds } from "@/lib/chart-time";
import { Button } from "@/components/ui/button";
import {
  MousePointer2,
  Minus,
  TrendingUp,
  Square,
  Pencil,
  Flag,
  Eraser,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/lib/wallet-context";
import {
  bullFlagGuideStep,
  loadChartDrawings,
  newDrawingId,
  saveChartDrawings,
  type ChartDrawing,
  type ChartDrawingPoint,
  type ChartDrawingType,
} from "@shared/chart-drawings";

export type DrawTool =
  | "select"
  | "trendline"
  | "hline"
  | "rect"
  | "polyline"
  | "bull_flag"
  | "erase";

const TOOL_COLORS: Record<ChartDrawingType, string> = {
  trendline: "#38bdf8",
  hline: "#a78bfa",
  rect: "#fbbf24",
  polyline: "#22d3ee",
  bull_flag: "#00c853",
};

type ChartDrawingProviderProps = {
  enabled: boolean;
  coin: string;
  interval: string;
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  paneRef: RefObject<HTMLDivElement | null>;
  layoutTick?: number;
  children: ReactNode;
};

type ChartDrawingContextValue = {
  enabled: boolean;
  tool: DrawTool;
  setTool: (t: DrawTool) => void;
  drawings: ChartDrawing[];
  setDrawings: React.Dispatch<React.SetStateAction<ChartDrawing[]>>;
  setDraftPoints: React.Dispatch<React.SetStateAction<ChartDrawingPoint[]>>;
  guideText: string | null;
  svgElements: ReactNode;
};

const ChartDrawingCtx = createContext<ChartDrawingContextValue | null>(null);

function useChartDrawingCtx(): ChartDrawingContextValue {
  const v = useContext(ChartDrawingCtx);
  if (!v) throw new Error("Chart drawing components must be inside ChartDrawingProvider");
  return v;
}

function pointToPixel(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  pt: ChartDrawingPoint,
): { x: number; y: number } | null {
  const x = chart.timeScale().timeToCoordinate(pt.time as Time);
  const y = series.priceToCoordinate(pt.price);
  if (x == null || y == null) return null;
  return { x, y };
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const lx = x1 + t * dx;
  const ly = y1 + t * dy;
  return Math.hypot(px - lx, py - ly);
}

export function ChartDrawingProvider({
  enabled,
  coin,
  interval,
  chartRef,
  seriesRef,
  paneRef,
  layoutTick = 0,
  children,
}: ChartDrawingProviderProps) {
  const { address } = useWallet();
  const [tool, setTool] = useState<DrawTool>("select");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [draftPoints, setDraftPoints] = useState<ChartDrawingPoint[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [, bump] = useState(0);
  const repaint = useCallback(() => bump((n) => n + 1), []);

  useEffect(() => {
    setDrawings(loadChartDrawings(coin, interval, address));
    setDraftPoints([]);
  }, [coin, interval, address]);

  useEffect(() => {
    if (!enabled || drawings.length === 0) return;
    saveChartDrawings(coin, interval, drawings, address);
  }, [drawings, coin, interval, address, enabled]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !enabled) return;
    const onRange = () => repaint();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);
    return () => {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange);
      } catch {
        /* disposed */
      }
    };
  }, [chartRef, enabled, repaint]);

  useEffect(() => {
    repaint();
  }, [layoutTick, repaint]);

  const commitDrawing = useCallback(
    (type: ChartDrawingType, points: ChartDrawingPoint[], label?: string) => {
      if (points.length === 0) return;
      const drawing: ChartDrawing = {
        id: newDrawingId(),
        type,
        points,
        color: TOOL_COLORS[type],
        label,
        updatedAt: Date.now(),
      };
      setDrawings((prev) => [...prev, drawing]);
      setDraftPoints([]);
    },
    [],
  );

  const applyChartPoint = useCallback(
    (pt: ChartDrawingPoint, px: number, py: number) => {
      if (tool === "erase") {
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return;
        const hit = 12;

        for (const d of [...drawings].reverse()) {
          const pixels = d.points
            .map((p) => pointToPixel(chart, series, p))
            .filter(Boolean) as { x: number; y: number }[];
          if (pixels.length < 2 && d.type !== "hline") continue;

          let near = false;
          if (d.type === "hline" && pixels[0]) {
            near = Math.abs(py - pixels[0].y) < hit;
          } else {
            for (let i = 0; i < pixels.length - 1; i++) {
              if (
                distToSegment(
                  px,
                  py,
                  pixels[i].x,
                  pixels[i].y,
                  pixels[i + 1].x,
                  pixels[i + 1].y,
                ) < hit
              ) {
                near = true;
                break;
              }
            }
          }
          if (d.type === "rect" && pixels.length >= 2) {
            const [a, b] = pixels;
            const left = Math.min(a.x, b.x);
            const right = Math.max(a.x, b.x);
            const top = Math.min(a.y, b.y);
            const bottom = Math.max(a.y, b.y);
            if (
              px >= left - hit &&
              px <= right + hit &&
              py >= top - hit &&
              py <= bottom + hit
            ) {
              near = true;
            }
          }
          if (near) {
            setDrawings((prev) => prev.filter((x) => x.id !== d.id));
            return;
          }
        }
        return;
      }

      if (tool === "hline") {
        commitDrawing("hline", [pt]);
        return;
      }

      if (tool === "trendline") {
        const next = [...draftPoints, pt];
        if (next.length < 2) {
          setDraftPoints(next);
          return;
        }
        commitDrawing("trendline", next.slice(0, 2));
        return;
      }

      if (tool === "rect") {
        const next = [...draftPoints, pt];
        if (next.length < 2) {
          setDraftPoints(next);
          return;
        }
        commitDrawing("rect", next.slice(0, 2));
        return;
      }

      if (tool === "polyline") {
        setDraftPoints((prev) => [...prev, pt]);
        return;
      }

      if (tool === "bull_flag") {
        const next = [...draftPoints, pt];
        if (next.length < 4) {
          setDraftPoints(next);
          return;
        }
        commitDrawing("bull_flag", next.slice(0, 4), "Bull Flag");
      }
    },
    [tool, draftPoints, commitDrawing, drawings, chartRef, seriesRef],
  );

  const onChartClick = useCallback(
    (param: MouseEventParams<Time>) => {
      if (!enabled || tool === "select") return;
      if (!param.point || param.time == null) return;

      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;

      const timeSec = lightweightTimeToSeconds(param.time);
      const price = series.coordinateToPrice(param.point.y);
      if (timeSec == null || price == null) return;

      applyChartPoint(
        { time: timeSec, price },
        param.point.x,
        param.point.y,
      );
    },
    [enabled, tool, chartRef, seriesRef, applyChartPoint],
  );

  const onChartDblClick = useCallback(
    (param: MouseEventParams<Time>) => {
      if (!enabled || tool !== "polyline" || draftPoints.length < 2) return;
      if (!param.point) return;
      commitDrawing("polyline", draftPoints, "Pattern");
    },
    [enabled, tool, draftPoints, commitDrawing],
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !enabled) return;
    chart.subscribeClick(onChartClick);
    chart.subscribeDblClick(onChartDblClick);
    return () => {
      try {
        chart.unsubscribeClick(onChartClick);
        chart.unsubscribeDblClick(onChartDblClick);
      } catch {
        /* disposed */
      }
    };
  }, [chartRef, enabled, onChartClick, onChartDblClick]);

  /** TP/SL drag handles sit above the canvas; disable them while drawing. */
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || !enabled) return;
    const bundles = pane.querySelectorAll<SVGElement>("[data-tpsl-kind]");
    const pe = tool === "select" ? "auto" : "none";
    bundles.forEach((node) => {
      node.style.pointerEvents = pe;
    });
  }, [paneRef, enabled, tool, layoutTick]);

  /** While a draw tool is active, disable chart pan/zoom so clicks land as drawings. */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !enabled) return;
    const pan = tool === "select";
    chart.applyOptions({
      handleScroll: {
        mouseWheel: pan,
        pressedMouseMove: pan,
        horzTouchDrag: pan,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: pan,
        pinch: pan,
        axisPressedMouseMove: pan,
      },
    });
  }, [chartRef, enabled, tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDraftPoints([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const svgElements = useMemo(() => {
    void layoutTick;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;

    const paths: ReactNode[] = [];

    const renderDrawing = (d: ChartDrawing, dashed = false) => {
      const pxs = d.points
        .map((p) => pointToPixel(chart, series, p))
        .filter(Boolean) as { x: number; y: number }[];
      if (pxs.length === 0) return;

      const stroke = d.color;
      const sw = hoverId === d.id ? 2.5 : 1.75;
      const dash = dashed ? "6 4" : undefined;

      if (d.type === "hline" && pxs[0]) {
        const w = paneRef.current?.clientWidth ?? 800;
        paths.push(
          <line
            key={d.id}
            x1={0}
            y1={pxs[0].y}
            x2={w}
            y2={pxs[0].y}
            stroke={stroke}
            strokeWidth={sw}
            strokeDasharray={dash}
          />,
        );
        return;
      }

      if (d.type === "trendline" && pxs.length >= 2) {
        paths.push(
          <line
            key={d.id}
            x1={pxs[0].x}
            y1={pxs[0].y}
            x2={pxs[1].x}
            y2={pxs[1].y}
            stroke={stroke}
            strokeWidth={sw}
          />,
        );
        return;
      }

      if (d.type === "rect" && pxs.length >= 2) {
        const x = Math.min(pxs[0].x, pxs[1].x);
        const y = Math.min(pxs[0].y, pxs[1].y);
        const w = Math.abs(pxs[1].x - pxs[0].x);
        const h = Math.abs(pxs[1].y - pxs[0].y);
        paths.push(
          <rect
            key={`${d.id}-fill`}
            x={x}
            y={y}
            width={w}
            height={h}
            fill={stroke}
            fillOpacity={0.12}
            stroke="none"
          />,
        );
        paths.push(
          <rect
            key={d.id}
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />,
        );
        return;
      }

      if (d.type === "polyline" && pxs.length >= 2) {
        const dAttr = pxs.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
        paths.push(
          <path key={d.id} d={dAttr} fill="none" stroke={stroke} strokeWidth={sw} />,
        );
        return;
      }

      if (d.type === "bull_flag" && pxs.length >= 4) {
        const [poleLow, poleHigh, flagHigh, flagLow] = pxs;
        paths.push(
          <polygon
            key={`${d.id}-fill`}
            points={`${poleHigh.x},${poleHigh.y} ${flagHigh.x},${flagHigh.y} ${flagLow.x},${flagLow.y} ${poleLow.x},${poleLow.y}`}
            fill={stroke}
            fillOpacity={0.14}
            stroke="none"
          />,
        );
        paths.push(
          <line key={`${d.id}-pole`} x1={poleLow.x} y1={poleLow.y} x2={poleHigh.x} y2={poleHigh.y} stroke={stroke} strokeWidth={sw + 0.5} />,
        );
        paths.push(
          <line key={`${d.id}-top`} x1={poleHigh.x} y1={poleHigh.y} x2={flagHigh.x} y2={flagHigh.y} stroke={stroke} strokeWidth={sw} />,
        );
        paths.push(
          <line key={`${d.id}-bot`} x1={poleLow.x} y1={poleLow.y} x2={flagLow.x} y2={flagLow.y} stroke={stroke} strokeWidth={sw} />,
        );
        if (d.label) {
          paths.push(
            <text
              key={`${d.id}-lbl`}
              x={flagHigh.x + 6}
              y={flagHigh.y - 4}
              fill={stroke}
              fontSize={10}
              fontFamily="monospace"
            >
              {d.label}
            </text>,
          );
        }
        return;
      }
    };

    for (const d of drawings) renderDrawing(d);

    if (draftPoints.length > 0) {
      const draft: ChartDrawing = {
        id: "draft",
        type:
          tool === "bull_flag"
            ? "bull_flag"
            : tool === "rect"
              ? "rect"
              : tool === "hline"
                ? "hline"
                : tool === "polyline"
                  ? "polyline"
                  : "trendline",
        points: draftPoints,
        color: "#94a3b8",
        updatedAt: 0,
      };
      renderDrawing(draft, true);
    }

    return paths;
  }, [drawings, draftPoints, tool, hoverId, chartRef, seriesRef, paneRef, layoutTick]);

  const guideText =
    tool === "bull_flag"
      ? bullFlagGuideStep(draftPoints.length)
      : tool === "trendline"
        ? draftPoints.length === 0
          ? "Click start point"
          : "Click end point"
        : tool === "rect"
          ? draftPoints.length === 0
            ? "Click first corner"
            : "Click opposite corner"
          : tool === "polyline"
            ? "Click points · double-click to finish"
            : tool === "hline"
              ? "Click price level"
              : tool === "erase"
                ? "Click a line or zone to remove"
                : null;

  const ctxValue = useMemo<ChartDrawingContextValue>(
    () => ({
      enabled,
      tool,
      setTool,
      drawings,
      setDrawings,
      setDraftPoints,
      guideText,
      svgElements,
    }),
    [enabled, tool, drawings, guideText, svgElements],
  );

  return (
    <ChartDrawingCtx.Provider value={ctxValue}>
      {children}
    </ChartDrawingCtx.Provider>
  );
}

const DRAW_TOOLS: { id: DrawTool; icon: ReactNode; title: string }[] = [
  { id: "select", icon: <MousePointer2 className="h-4 w-4" />, title: "Cursor — pan & zoom" },
  { id: "trendline", icon: <TrendingUp className="h-4 w-4" />, title: "Trend line" },
  { id: "hline", icon: <Minus className="h-4 w-4" />, title: "Horizontal line" },
  { id: "rect", icon: <Square className="h-4 w-4" />, title: "Rectangle" },
  { id: "polyline", icon: <Pencil className="h-4 w-4" />, title: "Polyline" },
  { id: "bull_flag", icon: <Flag className="h-4 w-4" />, title: "Bull flag (4 clicks)" },
  { id: "erase", icon: <Eraser className="h-4 w-4" />, title: "Eraser" },
];

/** TradingView-style vertical tool rail on the left of the chart. */
export function ChartDrawingLeftToolbar() {
  const {
    enabled,
    tool,
    setTool,
    drawings,
    setDrawings,
    setDraftPoints,
    guideText,
  } = useChartDrawingCtx();

  if (!enabled) return null;

  return (
    <aside
      className="flex w-11 shrink-0 flex-col border-r border-[#2a2e39] bg-[#131722] z-40"
      data-testid="chart-drawing-toolbar"
    >
      <div className="flex flex-col items-center gap-0.5 py-1.5">
        {DRAW_TOOLS.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-sm text-[#b2b5be] hover:text-[#d1d4dc] hover:bg-[#2a2e39]",
              tool === t.id && "bg-[#2a2e39] text-[#2962ff]",
            )}
            title={t.title}
            onClick={() => {
              setTool(t.id);
              setDraftPoints([]);
            }}
            data-testid={`draw-tool-${t.id}`}
          >
            {t.icon}
          </Button>
        ))}
      </div>
      <div className="mx-1.5 border-t border-[#2a2e39]" />
      <div className="flex flex-col items-center gap-0.5 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-sm text-[#b2b5be] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
          title="Undo last"
          disabled={drawings.length === 0}
          onClick={() => setDrawings((prev) => prev.slice(0, -1))}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-sm text-[#f23645] hover:bg-[#2a2e39] disabled:opacity-40"
          title="Clear all drawings"
          disabled={drawings.length === 0}
          onClick={() => {
            setDrawings([]);
            setDraftPoints([]);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {guideText ? (
        <p className="mt-auto px-1 pb-2 text-center text-[8px] leading-tight text-[#787b86]">
          {guideText}
        </p>
      ) : null}
    </aside>
  );
}

export function ChartDrawingCanvas() {
  const { enabled, tool, svgElements } = useChartDrawingCtx();

  if (!enabled) return null;

  return (
    <svg
      className={cn(
        "absolute inset-0 z-[22] overflow-visible pointer-events-none",
        tool !== "select" && "cursor-crosshair",
      )}
      aria-hidden
    >
      <g>{svgElements}</g>
    </svg>
  );
}
