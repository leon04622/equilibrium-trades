import { useMemo } from "react";
import { useTrading, type Position } from "@/lib/trading-context";
import { cn } from "@/lib/utils";

function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return "$0.00";
  const abs = Math.abs(v);
  if (abs >= 1000) {
    return `$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${abs.toFixed(2)}`;
}

function formatSignedUsd(v: number): string {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-8) return "$0.00";
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}${formatUsd(v)}`;
}

function formatSignedPct(v: number): string {
  if (!Number.isFinite(v)) return "0.00%";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function positionRoePct(p: Position): number {
  if (p.margin > 0) return (p.unrealizedPnl / p.margin) * 100;
  return p.unrealizedPnlPercent ?? 0;
}

type PnlCardProps = {
  label: string;
  value: string;
  sub?: string;
  tone: "profit" | "loss" | "neutral";
  className?: string;
};

function PnlCard({ label, value, sub, tone, className }: PnlCardProps) {
  return (
    <div
      className={cn(
        "flex min-w-[7.5rem] flex-1 flex-col gap-0.5 rounded-lg border px-2.5 py-2 sm:min-w-[8.5rem] sm:px-3",
        tone === "profit" && "border-bullish/25 bg-bullish/5",
        tone === "loss" && "border-bearish/25 bg-bearish/5",
        tone === "neutral" && "border-border/80 bg-muted/20",
        className,
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-base font-bold tabular-nums sm:text-lg",
          tone === "profit" && "text-bullish",
          tone === "loss" && "text-bearish",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </span>
      {sub ? <span className="text-[10px] text-muted-foreground tabular-nums">{sub}</span> : null}
    </div>
  );
}

function AllPositionsPnlCard({
  positions,
  loading,
}: {
  positions: Position[];
  loading: boolean;
}) {
  const open = positions.filter((p) => p.size > 0);
  const total = open.reduce((s, p) => s + (p.unrealizedPnl || 0), 0);
  const tone = total > 0 ? "profit" : total < 0 ? "loss" : "neutral";

  return (
    <div
      className={cn(
        "flex min-w-[11rem] flex-[1.4] flex-col gap-1 rounded-lg border px-2.5 py-2 sm:min-w-[14rem] sm:px-3",
        tone === "profit" && "border-bullish/25 bg-bullish/5",
        tone === "loss" && "border-bearish/25 bg-bearish/5",
        tone === "neutral" && "border-border/80 bg-muted/20",
      )}
      data-testid="pnl-card-all-positions"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          All positions
        </span>
        {!loading && open.length > 0 && (
          <span
            className={cn(
              "font-mono text-xs font-bold tabular-nums",
              tone === "profit" && "text-bullish",
              tone === "loss" && "text-bearish",
            )}
          >
            {formatSignedUsd(total)}
          </span>
        )}
      </div>

      {loading ? (
        <span className="font-mono text-sm text-muted-foreground">…</span>
      ) : open.length === 0 ? (
        <span className="text-[10px] text-muted-foreground">No open positions</span>
      ) : (
        <ul className="max-h-[4.5rem] space-y-1 overflow-y-auto pr-0.5 scrollbar-thin">
          {open.map((p) => {
            const roe = positionRoePct(p);
            const rowTone = p.unrealizedPnl > 0 ? "text-bullish" : p.unrealizedPnl < 0 ? "text-bearish" : "";
            return (
              <li
                key={p.id || `${p.coin}-${p.side}`}
                className="flex items-center justify-between gap-2 text-[10px] leading-tight"
              >
                <span className="min-w-0 truncate font-medium text-foreground">
                  {p.coin}{" "}
                  <span className={p.side === "long" ? "text-bullish" : "text-bearish"}>
                    {p.side === "long" ? "Long" : "Short"}
                  </span>
                  <span className="text-muted-foreground"> {p.leverage}x</span>
                </span>
                <span className={cn("shrink-0 font-mono font-semibold tabular-nums", rowTone)}>
                  {formatSignedUsd(p.unrealizedPnl)}{" "}
                  <span className="font-normal opacity-90">({formatSignedPct(roe)})</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type TradingPnlCardsProps = {
  className?: string;
};

/** Exchange-style P&L score cards — unrealized total, every open position, equity, available. */
export function TradingPnlCards({ className }: TradingPnlCardsProps) {
  const {
    connected,
    positions,
    unifiedAccountUsd,
    balance,
    marginUsed,
    isLoadingAccount,
  } = useTrading();

  const stats = useMemo(() => {
    const open = positions.filter((p) => p.size > 0);
    const totalUnrealized = open.reduce((s, p) => s + (p.unrealizedPnl || 0), 0);
    const totalMargin = open.reduce((s, p) => s + (p.margin || 0), 0);
    const roePct = totalMargin > 0 ? (totalUnrealized / totalMargin) * 100 : 0;
    return { totalUnrealized, roePct, openCount: open.length };
  }, [positions]);

  if (!connected) return null;

  const loading = isLoadingAccount && unifiedAccountUsd <= 0;
  const unrealTone =
    stats.totalUnrealized > 0 ? "profit" : stats.totalUnrealized < 0 ? "loss" : "neutral";

  return (
    <div
      className={cn("flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin", className)}
      data-testid="trading-pnl-cards"
      role="status"
      aria-live="polite"
    >
      <PnlCard
        label="Unrealized P&L"
        value={loading ? "…" : formatSignedUsd(stats.totalUnrealized)}
        sub={
          loading
            ? undefined
            : stats.openCount > 0
              ? `${formatSignedPct(stats.roePct)} ROE · ${stats.openCount} position${stats.openCount === 1 ? "" : "s"}`
              : "No open positions"
        }
        tone={loading ? "neutral" : unrealTone}
      />

      <AllPositionsPnlCard positions={positions} loading={loading} />

      <PnlCard
        label="Account equity"
        value={loading ? "…" : formatUsd(unifiedAccountUsd)}
        sub="Perps + spot on Hyperliquid"
        tone="neutral"
      />

      <PnlCard
        label="Available"
        value={loading ? "…" : formatUsd(balance)}
        sub={marginUsed > 0 ? `${formatUsd(marginUsed)} in margin` : "Free collateral"}
        tone="neutral"
      />
    </div>
  );
}
