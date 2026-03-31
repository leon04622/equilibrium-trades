import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatePanelProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  className?: string;
  contentClassName?: string;
};

export function StatePanel({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  loading = false,
  className,
  contentClassName,
}: StatePanelProps) {
  return (
    <Card className={cn("border-border/70 bg-card/60 shadow-sm", className)}>
      <CardContent
        className={cn(
          "flex min-h-[220px] flex-col items-center justify-center gap-4 p-8 text-center",
          contentClassName,
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : icon}
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold tracking-tight">{title}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <Button type="button" variant={loading ? "secondary" : "default"} onClick={onAction} className="min-w-32">
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
