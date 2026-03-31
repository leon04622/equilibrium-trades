import { Button } from "@/components/ui/button";
import { usePaywall } from "@/lib/paywall-context";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type PremiumFeatureLockProps = {
  locked: boolean;
  featureLabel?: string;
  title?: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Tier-2 paywall: blurred content + “Upgrade to Pro” CTA ($50/mo). Touch-friendly targets.
 */
export function PremiumFeatureLock({
  locked,
  featureLabel = "this Pro feature",
  title = "Upgrade to Pro",
  subtitle,
  className,
  children,
}: PremiumFeatureLockProps) {
  const { openPaywall } = usePaywall();

  if (!locked) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn("relative min-h-[160px] overflow-hidden rounded-md", className)}>
      <div
        className="pointer-events-none flex h-full min-h-[160px] flex-col select-none blur-[3px] opacity-[0.42] saturate-50"
        aria-hidden
      >
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/45 px-4 py-8 backdrop-blur-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center space-y-1.5 max-w-sm">
          <p className="text-base font-semibold tracking-tight">{title}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {subtitle ?? `Unlock ${featureLabel} with an active Pro subscription.`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            One membership unlocks the full platform workflow, not just this page.
          </p>
        </div>
        <Button
          size="lg"
          className="h-12 min-h-[48px] w-full max-w-xs text-base font-semibold touch-manipulation shadow-lg"
          onClick={() => openPaywall(featureLabel)}
        >
          Unlock Pro for $50/mo
        </Button>
      </div>
    </div>
  );
}
