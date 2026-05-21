import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SharePositionSnapshot } from "@/lib/share-position-types";

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return p.toFixed(4);
}

type Props = {
  data: SharePositionSnapshot;
  className?: string;
};

/** Branded position card preview (HL-style layout, Equilibrium branding, no referral). */
export function SharePositionCard({ data, className }: Props) {
  const profit = data.roePct >= 0;
  const sideLabel = data.side === "long" ? "LONG" : "SHORT";

  return (
    <div
      className={cn(
        "relative aspect-[52/30] w-full min-h-[200px] max-w-[520px] overflow-hidden rounded-xl border border-border/60",
        className,
      )}
      data-testid="share-position-card"
    >
      <div
        className="absolute inset-0 bg-[#0a0e14]"
        aria-hidden
      />
      {/* Topographic-style rings */}
      <div
        className="pointer-events-none absolute -right-[20%] top-1/2 h-[140%] w-[80%] -translate-y-1/2 opacity-30"
        aria-hidden
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border",
              profit ? "border-bullish/25" : "border-bearish/25",
            )}
            style={{
              width: `${40 + i * 14}%`,
              height: `${40 + i * 14}%`,
            }}
          />
        ))}
        <div
          className={cn(
            "absolute left-1/2 top-[18%] h-0 w-0 -translate-x-1/2 border-l-[28px] border-r-[28px] border-b-[48px] border-l-transparent border-r-transparent opacity-40",
            profit ? "border-b-bullish" : "border-b-bearish",
          )}
        />
      </div>

      <div className="relative z-10 flex h-full flex-col p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 ring-1 ring-primary/30">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-wide text-foreground/95">Equilibrium</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-bold text-foreground">{data.coin}</span>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
              data.side === "long"
                ? "bg-bullish/15 text-bullish border border-bullish/30"
                : "bg-bearish/15 text-bearish border border-bearish/30",
            )}
          >
            {sideLabel} {data.leverage}x
          </span>
        </div>

        <p
          className={cn(
            "mt-3 font-mono text-4xl font-bold tracking-tight sm:text-5xl",
            profit ? "text-bullish" : "text-bearish",
          )}
        >
          {profit ? "+" : ""}
          {data.roePct.toFixed(1)}%
        </p>

        <div className="mt-auto flex flex-wrap gap-6 pt-4 text-xs text-muted-foreground">
          <div>
            <p className="uppercase tracking-wide text-[10px]">Entry price</p>
            <p className="mt-0.5 font-mono text-sm text-foreground">{fmtPrice(data.entryPrice)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-[10px]">Mark price</p>
            <p className="mt-0.5 font-mono text-sm text-foreground">{fmtPrice(data.markPrice)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
