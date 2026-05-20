import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { 
  Info, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Pause,
  Play,
  Lock,
  Flame,
  ZoomIn,
  ZoomOut,
  Crosshair
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useBookmapFeed } from "@/hooks/use-bookmap-feed";
import type { HeatmapCell, HeatmapGridMeta, HeatmapTrade } from "@shared/heatmap-grid";

type HeatmapData = HeatmapCell;

const PLOT_PAD_LEFT = 52;
const PLOT_PAD_RIGHT = 4;
const PLOT_PAD_TOP = 8;
const PLOT_PAD_BOTTOM = 22;

/** Zoom slider 20–100 → ~0.5%–2.5% price window each side of mid. */
function zoomToRange(zoom: number): number {
  return 0.005 + ((zoom - 20) / 80) * 0.02;
}

function priceToY(price: number, meta: HeatmapGridMeta, height: number): number {
  const plotH = height - PLOT_PAD_TOP - PLOT_PAD_BOTTOM;
  const ratio = (price - meta.minPrice) / (meta.maxPrice - meta.minPrice);
  return PLOT_PAD_TOP + plotH * (1 - Math.max(0, Math.min(1, ratio)));
}

function timeToX(
  time: number,
  minTime: number,
  maxTime: number,
  width: number,
): number {
  if (maxTime <= minTime) return width - PLOT_PAD_RIGHT;
  const plotW = width - PLOT_PAD_LEFT - PLOT_PAD_RIGHT;
  const ratio = (time - minTime) / (maxTime - minTime);
  return PLOT_PAD_LEFT + ratio * plotW;
}

interface OrderBookLevel {
  px: string;
  sz: string;
  n: number;
}

interface LiquidityHeatmapProps {
  coin: string;
  locked?: boolean;
  className?: string;
}

export function LiquidityHeatmap({ coin, locked = false, className }: LiquidityHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [zoom, setZoom] = useState([50]);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [scrollPosition, setScrollPosition] = useState(100);
  const [historyFrames, setHistoryFrames] = useState<HeatmapData[][][]>([]);
  const maxHistoryFrames = 300;
  const isLive = scrollPosition >= 95;
  const lastFrameLenRef = useRef(0);

  const {
    connected: feedConnected,
    feedSource,
    heatmap: heatmapData,
    meta: gridMeta,
    largeOrders,
    recentTrades,
    midPrice: feedMidPrice,
  } = useBookmapFeed({
    coin,
    rangePct: zoomToRange(zoom[0]),
    paused: isPaused,
    enabled: !locked,
  });

  const currentPrice = feedMidPrice;

  // Get the heatmap data to display based on scroll position
  const displayHeatmap = (() => {
    if (isLive || historyFrames.length === 0) {
      return heatmapData;
    }
    // Map scroll position (0-94) to history frame index
    const frameIndex = Math.floor((scrollPosition / 95) * historyFrames.length);
    return historyFrames[Math.min(frameIndex, historyFrames.length - 1)] || heatmapData;
  })();

  // Fetch current ticker and order book
  const { data: tickers = [] } = useQuery<any[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 5000,
  });

  const { data: orderBook } = useQuery<{ coin: string; levels: OrderBookLevel[][] }>({
    queryKey: ["/api/hyperliquid/orderbook", coin],
    refetchInterval: 1000,
  });

  const currentTicker = tickers.find((t) => t.coin === coin);
  const tickerPrice = currentTicker ? parseFloat(currentTicker.markPx) : 0;

  const bids = orderBook?.levels?.[0] || [];
  const asks = orderBook?.levels?.[1] || [];

  useEffect(() => {
    setHistoryFrames([]);
    setScrollPosition(100);
    lastFrameLenRef.current = 0;
  }, [coin]);

  useEffect(() => {
    if (isPaused || heatmapData.length === 0) return;
    if (heatmapData.length === lastFrameLenRef.current) return;
    lastFrameLenRef.current = heatmapData.length;
    setHistoryFrames((prev) => {
      const next = [...prev, heatmapData];
      return next.length > maxHistoryFrames ? next.slice(-maxHistoryFrames) : next;
    });
  }, [heatmapData, isPaused]);

  // Draw heatmap on canvas — Bookmap: time → X, price → Y, liquidity = heat
  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const meta = gridMeta;

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);

    if (displayHeatmap.length === 0 || !meta) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(239, 68, 68, 0.08)");
      gradient.addColorStop(0.5, "rgba(80, 80, 100, 0.04)");
      gradient.addColorStop(1, "rgba(34, 197, 94, 0.08)");
      ctx.fillStyle = gradient;
      ctx.fillRect(PLOT_PAD_LEFT, 0, width - PLOT_PAD_LEFT, height);
      return;
    }

    const columns = displayHeatmap.length;
    const rows = displayHeatmap[0]?.length || 0;
    if (rows === 0 || columns === 0) return;

    const times = displayHeatmap.map((col) => col[0]?.time ?? 0);
    const minTime = times[0] ?? 0;
    const maxTime = times[times.length - 1] ?? minTime;
    const plotW = width - PLOT_PAD_LEFT - PLOT_PAD_RIGHT;

    let maxVolume = 0;
    for (const column of displayHeatmap) {
      for (const cell of column) {
        maxVolume = Math.max(
          maxVolume,
          cell.totalVolume ?? cell.bidVolume + cell.askVolume,
        );
      }
    }

    /** Bookmap-style heat: dark → cyan → yellow → orange */
    const heatColor = (intensity: number) => {
      if (intensity < 0.03) return null;
      const t = Math.pow(Math.min(1, intensity), 0.48);
      const r = Math.floor(8 + t * 247);
      const g = Math.floor(t < 0.45 ? t * 200 : 90 + (t - 0.45) * 330);
      const b = Math.floor(140 - t * 130);
      return `rgba(${r},${Math.min(255, g)},${Math.max(0, b)},${0.12 + t * 0.82})`;
    };

    const sideTint = (intensity: number, side: "bid" | "ask") => {
      if (intensity < 0.08) return null;
      const t = Math.pow(intensity, 0.6);
      return side === "bid"
        ? `rgba(0, 200, 83, ${0.08 + t * 0.35})`
        : `rgba(255, 82, 82, ${0.08 + t * 0.35})`;
    };

    const trail = new Array(rows).fill(0);

    for (let col = 0; col < columns; col++) {
      const t0 = displayHeatmap[col][0]?.time ?? minTime;
      const t1 =
        col < columns - 1
          ? displayHeatmap[col + 1][0]?.time ?? t0 + 1
          : maxTime + 1;
      const x0 = timeToX(t0, minTime, maxTime, width);
      const x1 = timeToX(t1, minTime, maxTime, width);
      const cellW = Math.max(1, x1 - x0);

      for (let row = 0; row < rows; row++) {
        const cell = displayHeatmap[col][row];
        const yTop = priceToY(cell.priceLevel + meta.binSize / 2, meta, height);
        const yBot = priceToY(cell.priceLevel - meta.binSize / 2, meta, height);
        const cellH = Math.max(1, yBot - yTop);

        const total = cell.totalVolume ?? cell.bidVolume + cell.askVolume;
        trail[row] = Math.max(total, trail[row] * 0.94);
        const intensity = maxVolume > 0 ? trail[row] / maxVolume : 0;

        const base = heatColor(intensity);
        if (base) {
          ctx.fillStyle = base;
          ctx.fillRect(x0, yTop, cellW + 0.5, cellH + 0.5);
        }

        const isBidSide = cell.priceLevel <= meta.midPrice;
        const sideVol = isBidSide ? cell.bidVolume : cell.askVolume;
        const sideIntensity = maxVolume > 0 ? sideVol / maxVolume : 0;
        const tint = sideTint(sideIntensity, isBidSide ? "bid" : "ask");
        if (tint) {
          ctx.fillStyle = tint;
          ctx.fillRect(x0, yTop, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // Current book depth strip (COB) on right edge of heatmap
    const lastCol = displayHeatmap[columns - 1];
    if (lastCol) {
      let cobMax = 0;
      for (const cell of lastCol) {
        cobMax = Math.max(cobMax, cell.bidVolume, cell.askVolume);
      }
      const cobW = 36;
      const cobX = width - PLOT_PAD_RIGHT - cobW;
      for (const cell of lastCol) {
        const yMid = priceToY(cell.priceLevel, meta, height);
        const isBid = cell.priceLevel <= meta.midPrice;
        const vol = isBid ? cell.bidVolume : cell.askVolume;
        const barW = cobMax > 0 ? (vol / cobMax) * cobW : 0;
        if (barW < 1) continue;
        ctx.fillStyle = isBid ? "rgba(0,200,83,0.55)" : "rgba(255,82,82,0.55)";
        if (isBid) {
          ctx.fillRect(cobX + cobW - barW, yMid - 1, barW, 2);
        } else {
          ctx.fillRect(cobX + cobW - barW, yMid - 1, barW, 2);
        }
      }
    }

    // Executed trades as bubbles (Bookmap volume dots)
    if (isLive) {
      const bubbleSource = recentTrades.length > 0 ? recentTrades : largeOrders;
      for (const item of bubbleSource) {
        if (item.price < meta.minPrice || item.price > meta.maxPrice) continue;
        const orderY = priceToY(item.price, meta, height);
        const orderX = timeToX(item.timestamp, minTime, maxTime, width);
        if (orderX < PLOT_PAD_LEFT || orderX > width - PLOT_PAD_RIGHT) continue;

        const bubbleSize = Math.min(14, Math.max(3, Math.sqrt(item.size) * 2.5));
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = item.side === "bid" ? "#00c853" : "#ff5252";
        ctx.beginPath();
        ctx.arc(orderX, orderY, bubbleSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    const displayPrice = currentPrice || tickerPrice;
    if (displayPrice >= meta.minPrice && displayPrice <= meta.maxPrice) {
      const priceY = priceToY(displayPrice, meta, height);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PLOT_PAD_LEFT, priceY);
      ctx.lineTo(width - PLOT_PAD_RIGHT, priceY);
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(PLOT_PAD_LEFT, priceY - 9, 50, 18);
      ctx.fillStyle = "#000";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(formatPrice(displayPrice), PLOT_PAD_LEFT + 4, priceY + 4);
    }

    // Price axis labels (left)
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 8; i++) {
      const p = meta.minPrice + ((meta.maxPrice - meta.minPrice) * i) / 8;
      const y = priceToY(p, meta, height);
      ctx.fillText(formatPrice(p), PLOT_PAD_LEFT - 4, y + 3);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(PLOT_PAD_LEFT, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Time axis (bottom)
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i <= 4; i++) {
      const t = minTime + ((maxTime - minTime) * i) / 4;
      const x = timeToX(t, minTime, maxTime, width);
      ctx.fillText(formatTime(t), x, height - 6);
    }

    if (showCrosshair && mousePos && mousePos.x > PLOT_PAD_LEFT) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PLOT_PAD_LEFT, mousePos.y);
      ctx.lineTo(width, mousePos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, height - PLOT_PAD_BOTTOM);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [
    displayHeatmap,
    gridMeta,
    largeOrders,
    recentTrades,
    currentPrice,
    tickerPrice,
    showCrosshair,
    mousePos,
    isLive,
  ]);

  // Redraw when data changes
  useEffect(() => {
    drawHeatmap();
  }, [drawHeatmap]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        drawHeatmap();
      }
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    return () => resizeObserver.disconnect();
  }, [drawHeatmap]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Calculate max size for order book depth bars
  const maxBidSize = Math.max(...bids.map((b) => parseFloat(b.sz) || 0), 1);
  const maxAskSize = Math.max(...asks.map((a) => parseFloat(a.sz) || 0), 1);

  // Locked state - show preview
  if (locked) {
    return (
      <Card className={cn("overflow-hidden", className)} data-testid="liquidity-heatmap">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Flame className="h-4 w-4 text-warning" />
              Liquidity Heatmap
            </CardTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Elite Feature
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative h-64">
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Lock className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">Unlock Bookmap-style Heatmap</p>
            <p className="text-xs text-muted-foreground text-center mb-4 max-w-[200px]">
              See real-time order flow and identify where institutional orders are placed
            </p>
            <Link to="/">
              <Button size="sm" data-testid="button-upgrade-heatmap">
                Upgrade to Elite
              </Button>
            </Link>
          </div>
          
          <div className="absolute inset-0 blur-sm pointer-events-none bg-gradient-to-b from-bullish/20 via-transparent to-bearish/20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-[#0d0d0d]", className)} data-testid="liquidity-heatmap">
      {/* Bookmap-style Header Toolbar */}
      <div className="flex items-center justify-between gap-4 px-3 py-2 bg-[#1a1a1a] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <Badge
            variant={feedConnected ? (isLive ? "default" : "secondary") : "destructive"}
            className="text-xs"
          >
            <Activity className="h-3 w-3 mr-1" />
            {!feedConnected
              ? "Connecting..."
              : isLive
                ? feedSource === "hyperliquid"
                  ? "LIVE"
                  : "LIVE (REST)"
                : "HISTORY"}
          </Badge>
          <span className="text-sm font-semibold text-white">{coin}/USDC</span>
          {(currentPrice || tickerPrice) > 0 && (
            <span className="text-sm font-mono text-yellow-400">
              ${formatPrice(currentPrice || tickerPrice)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7",
              showCrosshair && "bg-white/10"
            )}
            onClick={() => setShowCrosshair(!showCrosshair)}
            data-testid="button-crosshair"
          >
            <Crosshair className="h-4 w-4 text-white/70" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsPaused(!isPaused)}
            data-testid="button-pause-heatmap"
          >
            {isPaused ? <Play className="h-4 w-4 text-white/70" /> : <Pause className="h-4 w-4 text-white/70" />}
          </Button>
          <div className="flex items-center gap-1 ml-2">
            <ZoomOut className="h-3 w-3 text-white/50" />
            <Slider
              value={zoom}
              onValueChange={setZoom}
              min={20}
              max={100}
              className="w-20"
            />
            <ZoomIn className="h-3 w-3 text-white/50" />
          </div>
        </div>
      </div>

      {/* Timeline scrollbar */}
      <div className="h-6 bg-[#111] border-b border-[#333] flex items-center gap-2 px-3">
        <span className="text-[10px] text-white/40">Timeline ({historyFrames.length} frames)</span>
        <input
          type="range"
          min={0}
          max={100}
          value={scrollPosition}
          onChange={(e) => setScrollPosition(parseInt(e.target.value))}
          className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400"
          data-testid="slider-timeline"
        />
        <span className={cn(
          "text-[10px] min-w-[50px] text-right font-mono",
          isLive ? "text-yellow-400" : "text-white/60"
        )}>
          {isLive ? "LIVE" : `${Math.round((100 - scrollPosition) / 100 * 5)}m ago`}
        </span>
        {!isLive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px] text-yellow-400"
            onClick={() => setScrollPosition(100)}
            data-testid="button-go-live"
          >
            Go Live
          </Button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Heatmap Canvas */}
        <div className="flex-1 relative">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            data-testid="canvas-heatmap"
          />
          
          {!feedConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/90">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto text-white/30 mb-2 animate-pulse" />
                <p className="text-sm text-white/50">Connecting to Hyperliquid book...</p>
              </div>
            </div>
          )}

          {heatmapData.length === 0 && feedConnected && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto text-white/30 mb-2 animate-pulse" />
                <p className="text-sm text-white/50">Building heatmap data...</p>
                <p className="text-xs text-white/30 mt-1">This may take 15-30 seconds</p>
              </div>
            </div>
          )}
        </div>

        {/* Current Order Book (COB) Column - Bookmap style */}
        <div className="w-28 bg-[#111] border-l border-[#333] flex flex-col">
          <div className="p-1 text-center text-[10px] text-white/50 border-b border-[#333]">
            ORDER BOOK
          </div>
          
          {/* Asks (top) */}
          <div className="flex-1 flex flex-col-reverse overflow-hidden">
            {asks.slice(0, 12).map((ask, i) => {
              const size = parseFloat(ask.sz);
              const widthPct = (size / maxAskSize) * 100;
              return (
                <div key={`ask-${i}`} className="relative h-5 flex items-center px-1">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-red-500/30"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="relative text-[10px] font-mono text-red-400 flex-1 text-right">
                    {formatPrice(parseFloat(ask.px))}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Spread indicator */}
          <div className="py-1 px-2 bg-yellow-500/20 text-center">
            <span className="text-[10px] font-mono text-yellow-400">
              {formatPrice(currentPrice || tickerPrice)}
            </span>
          </div>
          
          {/* Bids (bottom) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {bids.slice(0, 12).map((bid, i) => {
              const size = parseFloat(bid.sz);
              const widthPct = (size / maxBidSize) * 100;
              return (
                <div key={`bid-${i}`} className="relative h-5 flex items-center px-1">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-green-500/30"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="relative text-[10px] font-mono text-green-400 flex-1 text-right">
                    {formatPrice(parseFloat(bid.px))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar - Large Orders */}
        <div className="w-52 bg-[#0d0d0d] border-l border-[#333] flex flex-col">
          <div className="p-2 border-b border-[#333]">
            <h3 className="font-semibold text-xs flex items-center gap-2 text-white">
              <AlertTriangle className="h-3 w-3 text-yellow-400" />
              Whale Activity
            </h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {largeOrders.length === 0 ? (
                <div className="text-center py-6 text-white/30">
                  <Info className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-[10px]">Scanning for whales...</p>
                </div>
              ) : (
                largeOrders.slice().reverse().slice(0, 10).map((order, i) => (
                  <div
                    key={`${order.timestamp}-${i}`}
                    className={cn(
                      "p-2 rounded text-xs",
                      order.side === "bid" ? "bg-green-500/10 border-l-2 border-green-500" : "bg-red-500/10 border-l-2 border-red-500"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {order.side === "bid" ? (
                          <TrendingUp className="h-3 w-3 text-green-400" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-400" />
                        )}
                        <span className="font-mono text-white/80">${formatPrice(order.price)}</span>
                      </div>
                      <span className={cn(
                        "font-mono font-semibold",
                        order.side === "bid" ? "text-green-400" : "text-red-400"
                      )}>
                        {order.size.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {formatTime(order.timestamp)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Legend */}
          <div className="p-2 border-t border-[#333] space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-white/60">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>Bid (Buy) Volume</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/60">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span>Ask (Sell) Volume</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/60">
              <div className="h-2 w-4 bg-yellow-500" />
              <span>Current Price</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
