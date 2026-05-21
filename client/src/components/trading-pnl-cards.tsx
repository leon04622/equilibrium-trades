import { useMemo } from "react";
import { useTrading } from "@/lib/trading-context";
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

type TradingPnlCardsProps = {
  /** Active chart symbol (perp coin id or spot @N). */
  activeCoin: string;
  /** Display name for the position card, e.g. HYPE-USDC */
  activeLabel?: string;
  className?: string;
};

/** Exchange-style P&L score cards — unrealized, active pair, equity, available. */
export function TradingPnlCards({ activeCoin, activeLabel, className }: TradingPnlCardsProps) {
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
    const activePos = open.find((p) => p.coin === activeCoin) ?? null;
    return { totalUnrealized, roePct, activePos, openCount: open.length };
  }, [positions, activeCoin]);

  if (!connected) return null;

  const loading = isLoadingAccount && unifiedAccountUsd <= 0;
  const unrealTone =
    stats.totalUnrealized > 0 ? "profit" : stats.totalUnrealized < 0 ? "loss" : "neutral";
  const activeTone = stats.activePos
    ? stats.activePos.unrealizedPnl > 0
      ? "profit"
      : stats.activePos.unrealizedPnl < 0
        ? "loss"
        : "neutral"
    : "neutral";

  const pairName = activeLabel?.trim() || activeCoin;

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

      <PnlCard
        label={stats.activePos ? `${pairName} P&L` : "This market"}
        value={
          loading
            ? "…"
            : stats.activePos
              ? formatSignedUsd(stats.activePos.unrealizedPnl)
              : "—"
        }
        sub={
          stats.activePos
            ? `${stats.activePos.side === "long" ? "Long" : "Short"} · ${formatSignedPct(stats.activePos.unrealizedPnlPercent)} ROE`
            : "No position here"
        }
        tone={loading ? "neutral" : activeTone}
      />

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
