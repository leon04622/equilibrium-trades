import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

const HL_URL = "https://hyperliquid.xyz";

type Props = {
  className?: string;
  /** Smaller copy for dense footers */
  compact?: boolean;
  showIcon?: boolean;
};

/**
 * Attribution link — use in shell, trading, docs, and guides.
 */
export function PoweredByHyperliquid({ className, compact = false, showIcon = true }: Props) {
  return (
    <a
      href={HL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.07] via-primary/[0.06] to-transparent px-2.5 py-1 shadow-sm shadow-emerald-500/5 transition-all",
        "hover:border-emerald-500/45 hover:from-emerald-500/12 hover:shadow-emerald-500/10",
        compact ? "text-[10px] leading-tight" : "text-[11px] leading-snug",
        className,
      )}
      data-testid="link-powered-by-hyperliquid"
    >
      {showIcon && (
        <Zap
          className={cn(
            "shrink-0 text-emerald-500/85 transition-transform group-hover:scale-110 group-hover:text-emerald-400",
            compact ? "h-2.5 w-2.5" : "h-3 w-3",
          )}
          aria-hidden
        />
      )}
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground group-hover:text-muted-foreground/90">Powered by</span>{" "}
        <span className="font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">Hyperliquid</span>
      </span>
    </a>
  );
}
