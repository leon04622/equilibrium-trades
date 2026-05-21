import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { IChartApi, ISeriesApi, MouseEventParams, Time } from "lightweight-charts";
import { lightweightTimeToSeconds } from "@/lib/chart-time";
import { extendTrendlineToWidth } from "@/lib/chart-drawing-geometry";
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
  trendline: "#EAC043",
  hline: "#a78bfa",
  rect: "#fbbf24",
  polyline: "#22d3ee",
  bull_flag: "#00c853",
};

const PREVIEW_STROKE = "#EAC043";
const ANCHOR_FILL = "#ffffff";
const ANCHOR_STROKE = "#2962ff";

type ChartDrawingProviderProps = {
  enabled: boolean;
  coin: string;
  interval: string;
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  paneRef: RefObject<HTMLDivElement | null>;
  layoutTick?: number;
  chartReadyTick?: number;
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
  isDrawMode: boolean;
  finishPolyline: () => void;
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

/** Map lightweight-charts click/crosshair params → stored point + pixel coords. */
function paramToChartPoint(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  param: MouseEventParams,
): { pt: ChartDrawingPoint; px: number; py: number } | null {
  if (!param.point || param.time === undefined) return null;
  const timeSec = lightweightTimeToSeconds(param.time as Time);
  const price = series.coordinateToPrice(param.point.y);
  if (timeSec == null || price == null || !Number.isFinite(price)) return null;
  return { pt: { time: timeSec, price }, px: param.point.x, py: param.point.y };
}

export function ChartDrawingProvider({
  enabled,
  coin,
  interval,
  chartRef,
  seriesRef,
  paneRef,
  layoutTick = 0,
  chartReadyTick = 0,
  children,
}: ChartDrawingProviderProps) {
  const { address } = useWallet();
  const [tool, setTool] = useState<DrawTool>("select");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [draftPoints, setDraftPoints] = useState<ChartDrawingPoint[]>([]);
  const [cursorPoint, setCursorPoint] = useState<ChartDrawingPoint | null>(null);
  const [, bump] = useState(0);
  const repaintRafRef = useRef(0);
  const repaint = useCallback(() => {
    if (repaintRafRef.current) return;
    repaintRafRef.current = requestAnimationFrame(() => {
      repaintRafRef.current = 0;
      bump((n) => n + 1);
    });
  }, []);

  const isDrawMode = enabled && tool !== "select";

  useEffect(() => {
    setDrawings(loadChartDrawings(coin, interval, address));
    setDraftPoints([]);
    setCursorPoint(null);
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
        const hit = 14;

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

  /** Native chart clicks — reliable time/price (TradingView-style). */
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !enabled || tool === "select") return;

    const onClick = (param: MouseEventParams) => {
      const hit = paramToChartPoint(chart, series, param);
      if (!hit) return;
      applyChartPoint(hit.pt, hit.px, hit.py);
    };

    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
  }, [chartRef, seriesRef, enabled, tool, applyChartPoint, chartReadyTick]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !enabled || tool === "select") return;

    const onCrosshair = (param: MouseEventParams) => {
      if (!param.point) {
        setCursorPoint(null);
        return;
      }
      let timeSec: number | null = null;
      if (param.time !== undefined) {
        timeSec = lightweightTimeToSeconds(param.time as Time);
      } else {
        const rawTime = chart.timeScale().coordinateToTime(param.point.x);
        timeSec = rawTime != null ? lightweightTimeToSeconds(rawTime as Time) : null;
      }
      const price = series.coordinateToPrice(param.point.y);
      if (timeSec == null || price == null || !Number.isFinite(price)) {
        setCursorPoint(null);
        return;
      }
      setCursorPoint({ time: timeSec, price });
    };

    chart.subscribeCrosshairMove(onCrosshair);
    return () => chart.unsubscribeCrosshairMove(onCrosshair);
  }, [chartRef, seriesRef, enabled, tool, chartReadyTick]);

  const finishPolyline = useCallback(() => {
    if (tool !== "polyline" || draftPoints.length < 2) return;
    commitDrawing("polyline", draftPoints, "Pattern");
  }, [tool, draftPoints, commitDrawing]);

  /** TradingView / Hyperliquid: draw tool selected → chart pans off; clicks place points. */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !enabled) return;
    const pan = tool === "select";
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: pan,
        horzTouchDrag: pan,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: pan,
        axisPressedMouseMove: pan,
      },
    });
  }, [chartRef, enabled, tool, chartReadyTick]);

  /** Block TP/SL / order-line drag handles from stealing clicks while drawing. */
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || !enabled) return;
    const block = tool !== "select";
    pane.querySelectorAll<SVGElement>("[data-tpsl-kind]").forEach((node) => {
      node.style.pointerEvents = block ? "none" : "auto";
    });
    const apex = pane.querySelector<SVGElement>("[data-testid='apex-sovereign-order-layer']");
    if (apex) apex.style.pointerEvents = block ? "none" : "auto";
    pane.querySelectorAll<HTMLElement>("[data-testid^='drag-handle-']").forEach((node) => {
      node.style.pointerEvents = block ? "none" : "auto";
    });
    const orderLines = pane.querySelector<HTMLElement>("[data-testid='chart-order-lines']");
    if (orderLines) {
      orderLines.style.pointerEvents = block ? "none" : "none";
    }
  }, [paneRef, enabled, tool, layoutTick]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || !enabled) return;
    const onContext = (e: MouseEvent) => {
      if (tool === "select" || draftPoints.length === 0) return;
      e.preventDefault();
      setDraftPoints([]);
    };
    pane.addEventListener("contextmenu", onContext);
    return () => pane.removeEventListener("contextmenu", onContext);
  }, [paneRef, enabled, tool, draftPoints.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraftPoints([]);
        setCursorPoint(null);
        setTool("select");
        return;
      }
      if (!enabled) return;
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "l" || e.key === "L") {
        setTool("trendline");
        setDraftPoints([]);
      }
      if (e.key === "Enter" && tool === "polyline") {
        finishPolyline();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, tool, finishPolyline]);

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
      const sw = 2;
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
        const paneW = paneRef.current?.clientWidth ?? 800;
        const ext = extendTrendlineToWidth(
          pxs[0].x,
          pxs[0].y,
          pxs[1].x,
          pxs[1].y,
          paneW,
        );
        paths.push(
          <line
            key={d.id}
            x1={ext.x1}
            y1={ext.y1}
            x2={ext.x2}
            y2={ext.y2}
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
        if (d.label && d.id !== "draft") {
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
      }
    };

    const renderAnchors = (points: ChartDrawingPoint[], keyPrefix: string) => {
      for (let i = 0; i < points.length; i++) {
        const px = pointToPixel(chart, series, points[i]!);
        if (!px) continue;
        paths.push(
          <circle
            key={`${keyPrefix}-anchor-${i}`}
            cx={px.x}
            cy={px.y}
            r={5}
            fill={ANCHOR_FILL}
            stroke={ANCHOR_STROKE}
            strokeWidth={2}
          />,
        );
      }
    };

    const renderPreviewToCursor = (from: ChartDrawingPoint, key: string) => {
      if (!cursorPoint) return;
      const a = pointToPixel(chart, series, from);
      const b = pointToPixel(chart, series, cursorPoint);
      if (!a || !b) return;
      paths.push(
        <line
          key={key}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={PREVIEW_STROKE}
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.9}
        />,
      );
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
        color: PREVIEW_STROKE,
        updatedAt: 0,
      };
      renderDrawing(draft, true);
      renderAnchors(draftPoints, "draft");
      const last = draftPoints[draftPoints.length - 1]!;
      if (tool === "trendline" || tool === "polyline" || tool === "bull_flag") {
        renderPreviewToCursor(last, "preview-seg");
      }
      if (tool === "rect" && cursorPoint) {
        const a = pointToPixel(chart, series, draftPoints[0]!);
        const b = pointToPixel(chart, series, cursorPoint);
        if (a && b) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          paths.push(
            <rect
              key="preview-rect"
              x={x}
              y={y}
              width={Math.abs(b.x - a.x)}
              height={Math.abs(b.y - a.y)}
              fill={PREVIEW_STROKE}
              fillOpacity={0.08}
              stroke={PREVIEW_STROKE}
              strokeWidth={2}
              strokeDasharray="6 4"
            />,
          );
        }
      }
    } else if (tool === "hline" && cursorPoint) {
      const y = series.priceToCoordinate(cursorPoint.price);
      const paneW = paneRef.current?.clientWidth ?? 800;
      if (y != null) {
        paths.push(
          <line
            key="preview-hline"
            x1={0}
            y1={y}
            x2={paneW}
            y2={y}
            stroke={TOOL_COLORS.hline}
            strokeWidth={2}
            strokeDasharray="6 4"
          />,
        );
      }
    }

    return paths;
  }, [drawings, draftPoints, tool, cursorPoint, chartRef, seriesRef, paneRef, layoutTick, chartReadyTick]);

  const guideText =
    tool === "select"
      ? "Pan: drag · Zoom: scroll · V = cursor · L = line"
      : tool === "bull_flag"
        ? bullFlagGuideStep(draftPoints.length)
        : tool === "trendline"
          ? draftPoints.length === 0
            ? "Click 1st point"
            : "Click 2nd point"
          : tool === "rect"
            ? draftPoints.length === 0
              ? "Click corner"
              : "Click opposite corner"
            : tool === "polyline"
              ? "Click points · Enter to finish"
              : tool === "hline"
                ? "Click price level"
                : tool === "erase"
                  ? "Click shape to delete"
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
      isDrawMode,
      finishPolyline,
    }),
    [enabled, tool, drawings, guideText, svgElements, isDrawMode, finishPolyline],
  );

  return (
    <ChartDrawingCtx.Provider value={ctxValue}>
      {children}
    </ChartDrawingCtx.Provider>
  );
}

const DRAW_TOOLS: { id: DrawTool; icon: ReactNode; title: string }[] = [
  { id: "select", icon: <MousePointer2 className="h-4 w-4" />, title: "Cursor (pan & zoom)" },
  { id: "trendline", icon: <TrendingUp className="h-4 w-4" />, title: "Trend line" },
  { id: "hline", icon: <Minus className="h-4 w-4" />, title: "Horizontal line" },
  { id: "rect", icon: <Square className="h-4 w-4" />, title: "Rectangle" },
  { id: "polyline", icon: <Pencil className="h-4 w-4" />, title: "Brush / polyline" },
  { id: "bull_flag", icon: <Flag className="h-4 w-4" />, title: "Bull flag" },
  { id: "erase", icon: <Eraser className="h-4 w-4" />, title: "Eraser" },
];

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
          title="Clear all"
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
        <p className="mt-auto px-1 pb-2 text-center text-[9px] leading-tight text-[#d1d4dc] font-medium">
          {guideText}
        </p>
      ) : null}
    </aside>
  );
}

/** Renders committed + draft drawings (no pointer capture). */
export function ChartDrawingCanvas() {
  const { enabled, svgElements } = useChartDrawingCtx();
  if (!enabled) return null;
  return (
    <svg
      className="absolute inset-0 z-[60] overflow-visible pointer-events-none"
      aria-hidden
    >
      <g>{svgElements}</g>
    </svg>
  );
}

/** Marks draw mode for tests; clicks go to lightweight-charts subscribeClick. */
export function ChartDrawingInteractionLayer() {
  const { enabled, isDrawMode } = useChartDrawingCtx();
  if (!enabled || !isDrawMode) return null;
  return (
    <div
      className="absolute inset-0 z-[25] pointer-events-none cursor-crosshair"
      data-testid="chart-drawing-interaction"
      aria-hidden
    />
  );
}
