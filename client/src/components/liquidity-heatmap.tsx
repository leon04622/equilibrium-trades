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
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useBookmapFeed } from "@/hooks/use-bookmap-feed";
import type { HeatmapCell, HeatmapGridMeta } from "@shared/heatmap-grid";
import {
  BOOKMAP_PAD,
  bookmapHeatColor,
  buildSessionVolumeProfile,
  maxHeatmapVolume,
  plotRightEdge,
  priceToY,
  timeToX,
} from "@/lib/bookmap-render";

type HeatmapData = HeatmapCell;

function zoomToRange(zoom: number): number {
  return 0.005 + ((zoom - 20) / 80) * 0.02;
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
  const lastSnapshotTimeRef = useRef(0);

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

  const displayHeatmap = (() => {
    if (isLive || historyFrames.length === 0) return heatmapData;
    const frameIndex = Math.floor((scrollPosition / 95) * historyFrames.length);
    return historyFrames[Math.min(frameIndex, historyFrames.length - 1)] || heatmapData;
  })();

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
    lastSnapshotTimeRef.current = 0;
  }, [coin]);

  useEffect(() => {
    if (isPaused || heatmapData.length === 0) return;
    const lastTime = heatmapData[heatmapData.length - 1]?.[0]?.time ?? 0;
    if (lastTime === lastSnapshotTimeRef.current) return;
    lastSnapshotTimeRef.current = lastTime;
    setHistoryFrames((prev) => {
      const next = [...prev, heatmapData];
      return next.length > maxHistoryFrames ? next.slice(-maxHistoryFrames) : next;
    });
  }, [heatmapData, isPaused]);

  const formatPrice = useCallback((p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  }, []);

  const formatTime = useCallback((ts: number) => {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }, []);

  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const meta = gridMeta;
    const heatEnd = plotRightEdge(width);

    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, 0, width, height);

    if (displayHeatmap.length === 0 || !meta) return;

    const columns = displayHeatmap.length;
    const rows = displayHeatmap[0]?.length || 0;
    if (rows === 0) return;

    const times = displayHeatmap.map((col) => col[0]?.time ?? 0);
    const minTime = times[0] ?? 0;
    const maxTime = times[times.length - 1] ?? minTime;
    const maxVolume = maxHeatmapVolume(displayHeatmap);
    const trail = new Array(rows).fill(0);

    // Vertical time grid (~15s or every 8 columns)
    const gridStep = Math.max(1, Math.floor(columns / 12));
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (let col = 0; col < columns; col += gridStep) {
      const t = displayHeatmap[col][0]?.time ?? minTime;
      const x = timeToX(t, minTime, maxTime, width);
      ctx.beginPath();
      ctx.moveTo(x, BOOKMAP_PAD.top);
      ctx.lineTo(x, height - BOOKMAP_PAD.bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Liquidity heat + persistence trail
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
        trail[row] = Math.max(total, trail[row] * 0.965);
        const intensity = maxVolume > 0 ? trail[row] / maxVolume : 0;
        const color = bookmapHeatColor(intensity);
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x0, yTop, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // Trade bubbles (large, semi-transparent — Bookmap style)
    const bubbles = recentTrades.length > 0 ? recentTrades : largeOrders;
    for (const item of bubbles) {
      if (item.price < meta.minPrice || item.price > meta.maxPrice) continue;
      const orderY = priceToY(item.price, meta, height);
      const orderX = timeToX(item.timestamp, minTime, maxTime, width);
      if (orderX < BOOKMAP_PAD.left || orderX > heatEnd) continue;

      const bubbleSize = Math.min(48, Math.max(6, Math.sqrt(item.size) * 8));
      const isBuy = item.side === "bid";
      ctx.globalAlpha = 0.38;
      const grad = ctx.createRadialGradient(orderX, orderY, 0, orderX, orderY, bubbleSize);
      if (isBuy) {
        grad.addColorStop(0, "rgba(0, 230, 118, 0.9)");
        grad.addColorStop(0.6, "rgba(0, 180, 80, 0.35)");
        grad.addColorStop(1, "rgba(0, 120, 50, 0)");
      } else {
        grad.addColorStop(0, "rgba(255, 82, 82, 0.9)");
        grad.addColorStop(0.6, "rgba(220, 50, 50, 0.35)");
        grad.addColorStop(1, "rgba(160, 30, 30, 0)");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(orderX, orderY, bubbleSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Current order book (COB) — resting depth at right of heat
    const cobX = heatEnd;
    const cobW = BOOKMAP_PAD.cob - 2;
    let cobMax = 0;
    for (const bid of bids) cobMax = Math.max(cobMax, parseFloat(bid.sz) || 0);
    for (const ask of asks) cobMax = Math.max(cobMax, parseFloat(ask.sz) || 0);
    for (const ask of asks) {
      const px = parseFloat(ask.px);
      const sz = parseFloat(ask.sz);
      if (px < meta.minPrice || px > meta.maxPrice) continue;
      const y = priceToY(px, meta, height);
      const barW = cobMax > 0 ? (sz / cobMax) * cobW : 0;
      ctx.fillStyle = "rgba(255, 70, 70, 0.65)";
      ctx.fillRect(cobX, y - 1, barW, 2);
    }
    for (const bid of bids) {
      const px = parseFloat(bid.px);
      const sz = parseFloat(bid.sz);
      if (px < meta.minPrice || px > meta.maxPrice) continue;
      const y = priceToY(px, meta, height);
      const barW = cobMax > 0 ? (sz / cobMax) * cobW : 0;
      ctx.fillStyle = "rgba(0, 200, 83, 0.65)";
      ctx.fillRect(cobX, y - 1, barW, 2);
    }

    // SVP — session volume profile (green right / red left from axis)
    const svp = buildSessionVolumeProfile(recentTrades, meta, minTime, maxTime);
    const svpX = width - BOOKMAP_PAD.svp;
    const svpMid = width - BOOKMAP_PAD.priceAxis - BOOKMAP_PAD.svp / 2;
    let svpMax = 0;
    for (let i = 0; i < rows; i++) {
      svpMax = Math.max(svpMax, svp.buy[i] ?? 0, svp.sell[i] ?? 0);
    }
    const svpBarMax = (BOOKMAP_PAD.svp / 2) * 0.9;

    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    ctx.fillText("SVP", svpMid, BOOKMAP_PAD.top + 8);

    for (let row = 0; row < rows; row++) {
      const cell = displayHeatmap[0][row];
      const yMid = priceToY(cell.priceLevel, meta, height);
      const buyW = svpMax > 0 ? ((svp.buy[row] ?? 0) / svpMax) * svpBarMax : 0;
      const sellW = svpMax > 0 ? ((svp.sell[row] ?? 0) / svpMax) * svpBarMax : 0;
      if (buyW > 0.5) {
        ctx.fillStyle = "rgba(0, 200, 83, 0.75)";
        ctx.fillRect(svpMid, yMid - 1, buyW, 2);
      }
      if (sellW > 0.5) {
        ctx.fillStyle = "rgba(255, 70, 70, 0.75)";
        ctx.fillRect(svpMid - sellW, yMid - 1, sellW, 2);
      }
    }

    // Price axis (right) + current price highlight
    const displayPrice = currentPrice || tickerPrice;
    const priceAxisX = width - BOOKMAP_PAD.priceAxis;

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    for (let i = 0; i <= 10; i++) {
      const p = meta.minPrice + ((meta.maxPrice - meta.minPrice) * i) / 10;
      const y = priceToY(p, meta, height);
      ctx.fillText(formatPrice(p), priceAxisX + 4, y + 3);
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.beginPath();
      ctx.moveTo(BOOKMAP_PAD.left, y);
      ctx.lineTo(heatEnd, y);
      ctx.stroke();
    }

    if (displayPrice >= meta.minPrice && displayPrice <= meta.maxPrice) {
      const priceY = priceToY(displayPrice, meta, height);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(BOOKMAP_PAD.left, priceY);
      ctx.lineTo(heatEnd + cobW, priceY);
      ctx.stroke();
      ctx.setLineDash([]);

      const label = formatPrice(displayPrice);
      ctx.font = "bold 10px monospace";
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(priceAxisX, priceY - 9, tw, 18);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(label, priceAxisX + 5, priceY + 4);
    }

    // Time axis
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px monospace";
    for (let i = 0; i <= 5; i++) {
      const t = minTime + ((maxTime - minTime) * i) / 5;
      const x = timeToX(t, minTime, maxTime, width);
      ctx.fillText(formatTime(t), x, height - 6);
    }

    if (showCrosshair && mousePos && mousePos.x > BOOKMAP_PAD.left && mousePos.x < heatEnd) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(BOOKMAP_PAD.left, mousePos.y);
      ctx.lineTo(heatEnd, mousePos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mousePos.x, BOOKMAP_PAD.top);
      ctx.lineTo(mousePos.x, height - BOOKMAP_PAD.bottom);
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
    bids,
    asks,
    formatPrice,
    formatTime,
  ]);

  useEffect(() => {
    drawHeatmap();
  }, [drawHeatmap]);

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
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  if (locked) {
    return (
      <Card className={cn("overflow-hidden", className)} data-testid="liquidity-heatmap">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Flame className="h-4 w-4 text-warning" />
            Liquidity Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent className="relative h-64">
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Lock className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">Unlock Bookmap-style Heatmap</p>
            <Link to="/">
              <Button size="sm">Upgrade to Elite</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-[#0c0c0c]", className)} data-testid="liquidity-heatmap">
      {/* Top toolbar + Bookmap color scale */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-[#161616] border-b border-[#2a2a2a]">
        <Badge
          variant={feedConnected ? (isLive ? "default" : "secondary") : "destructive"}
          className="text-xs shrink-0"
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
        <span className="text-xs font-mono text-white/80 shrink-0">
          {coin}-USDC:PERP
        </span>
        {(currentPrice || tickerPrice) > 0 && (
          <span className="text-xs font-mono text-red-400 shrink-0">
            {formatPrice(currentPrice || tickerPrice)}
          </span>
        )}

        <div className="flex-1 flex items-center gap-2 min-w-0 px-2">
          <span className="text-[9px] text-white/40 shrink-0 hidden sm:inline">Low</span>
          <div
            className="flex-1 h-2.5 rounded-sm border border-white/10"
            style={{
              background:
                "linear-gradient(90deg, #0a1628 0%, #0e7490 22%, #22d3ee 40%, #eab308 62%, #f97316 82%, #dc2626 100%)",
            }}
            title="Liquidity intensity"
          />
          <span className="text-[9px] text-white/40 shrink-0 hidden sm:inline">High</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", showCrosshair && "bg-white/10")}
            onClick={() => setShowCrosshair(!showCrosshair)}
          >
            <Crosshair className="h-3.5 w-3.5 text-white/70" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? (
              <Play className="h-3.5 w-3.5 text-white/70" />
            ) : (
              <Pause className="h-3.5 w-3.5 text-white/70" />
            )}
          </Button>
          <ZoomOut className="h-3 w-3 text-white/40" />
          <Slider value={zoom} onValueChange={setZoom} min={20} max={100} className="w-16" />
          <ZoomIn className="h-3 w-3 text-white/40" />
        </div>
      </div>

      {/* Timeline */}
      <div className="h-5 bg-[#111] border-b border-[#2a2a2a] flex items-center gap-2 px-3">
        <input
          type="range"
          min={0}
          max={100}
          value={scrollPosition}
          onChange={(e) => setScrollPosition(parseInt(e.target.value))}
          className="flex-1 h-1 bg-white/15 rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:appearance-none"
        />
        <span className={cn("text-[9px] font-mono min-w-[44px] text-right", isLive ? "text-amber-400" : "text-white/50")}>
          {isLive ? "LIVE" : `${Math.round(((100 - scrollPosition) / 100) * 5)}m`}
        </span>
        {!isLive && (
          <Button variant="ghost" size="sm" className="h-4 px-1.5 text-[9px] text-amber-400" onClick={() => setScrollPosition(100)}>
            Live
          </Button>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePos(null)}
            data-testid="canvas-heatmap"
          />

          {!feedConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0c0c0c]/92 z-10">
              <div className="text-center">
                <Activity className="h-10 w-10 mx-auto text-white/25 mb-2 animate-pulse" />
                <p className="text-sm text-white/50">Connecting to Hyperliquid…</p>
              </div>
            </div>
          )}

          {heatmapData.length === 0 && feedConnected && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <p className="text-sm text-white/40">Building liquidity history…</p>
            </div>
          )}
        </div>

        {/* Trade tape */}
        <div className="w-44 shrink-0 bg-[#0c0c0c] border-l border-[#2a2a2a] flex flex-col hidden md:flex">
          <div className="px-2 py-1.5 border-b border-[#2a2a2a] text-[10px] font-semibold text-white/60 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            Trades
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1.5 space-y-0.5">
              {recentTrades.length === 0 ? (
                <p className="text-[10px] text-white/30 text-center py-4">Waiting for trades…</p>
              ) : (
                recentTrades
                  .slice()
                  .reverse()
                  .slice(0, 24)
                  .map((t, i) => (
                    <div
                      key={`${t.timestamp}-${i}`}
                      className={cn(
                        "flex justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono",
                        t.side === "bid" ? "text-green-400" : "text-red-400",
                      )}
                    >
                      <span>{formatPrice(t.price)}</span>
                      <span className="text-white/50">{t.size.toFixed(3)}</span>
                    </div>
                  ))
              )}
            </div>
          </ScrollArea>
          <div className="p-2 border-t border-[#2a2a2a] space-y-1 text-[9px] text-white/45">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400/80" />
              Buy aggressor
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-red-400/80" />
              Sell aggressor
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm bg-gradient-to-r from-[#0a1628] to-[#dc2626]" />
              Resting liquidity
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
