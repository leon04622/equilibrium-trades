import { useMemo, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  GraduationCap,
  Loader2,
  Lock,
  Play,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/use-subscription";
import { useWallet } from "@/lib/wallet-context";
import { TIER_PRO } from "@/lib/subscription-pricing";
import {
  VAULT_SECTION_META,
  inferAcademySection,
  tutorialToPlayUrl,
} from "@/lib/video-vault";
import { cn } from "@/lib/utils";
import type { AcademySection, TutorialVideo } from "@shared/schema";

const ReactPlayer = lazy(() => import("react-player/lazy"));

/** Curated Equilibrium Academy catalog (merged with CRM / `tutorial_videos` for Pro subscribers). */
export const VIDEO_LIBRARY: {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  academySection: AcademySection;
}[] = [
  {
    id: "seed-welcome-academy",
    title: "Welcome to the Equilibrium Academy",
    description:
      "How this vault is organized: patterns first, then SMA mastery, then live-style sessions.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=640&q=80",
    videoUrl: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
    academySection: "beginner_patterns",
  },
  {
    id: "seed-sma-intro",
    title: "SMA Stack Overview (21 / 200)",
    description:
      "Why we anchor on the 21 and 200 SMAs and how they define trend and pullback context.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1642543494126-58b548a28cdf?w=640&q=80",
    videoUrl: "https://vimeo.com/76979871",
    academySection: "sma_masterclass",
  },
  {
    id: "seed-live-routine",
    title: "Pre-Session Routine",
    description:
      "A repeatable checklist before you touch risk: levels, volatility, and invalidation.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=640&q=80",
    videoUrl:
      "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    academySection: "live_sessions",
  },
];

export type VaultMergedItem = (typeof VIDEO_LIBRARY)[number] & { source: "seed" | "crm" };

function mergeVaultItems(apiVideos: TutorialVideo[]): VaultMergedItem[] {
  const fromCrm: VaultMergedItem[] = apiVideos.map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description,
    thumbnailUrl:
      (v.thumbnailPath && v.thumbnailPath.trim()) ||
      "https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=640&q=80",
    videoUrl: tutorialToPlayUrl(v),
    academySection: inferAcademySection(v),
    source: "crm" as const,
  }));
  const seeds: VaultMergedItem[] = VIDEO_LIBRARY.map((s) => ({ ...s, source: "seed" as const }));
  return [...seeds, ...fromCrm];
}

function PlayerFrame({ url, title }: { url: string; title: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black pt-[56.25%]">
      <div className="absolute inset-0">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }
        >
          <ReactPlayer
            url={url}
            width="100%"
            height="100%"
            controls
            playing
            config={{
              youtube: { playerVars: { rel: 0 } },
            }}
          />
        </Suspense>
      </div>
      <span className="sr-only">{title}</span>
    </div>
  );
}

export default function VideoVault() {
  const { isConnected } = useWallet();
  const { isSubscribed, isLoading: subLoading, tier } = useSubscription();
  const [active, setActive] = useState<VaultMergedItem | null>(null);

  const { data: apiVideos = [], isLoading: listLoading } = useQuery<TutorialVideo[]>({
    queryKey: ["/api/videos"],
  });

  const items = useMemo(() => mergeVaultItems(apiVideos), [apiVideos]);

  const bySection = useMemo(() => {
    const map: Record<AcademySection, VaultMergedItem[]> = {
      beginner_patterns: [],
      sma_masterclass: [],
      live_sessions: [],
    };
    for (const it of items) {
      map[it.academySection].push(it);
    }
    return map;
  }, [items]);

  /** Gate vault preview until wallet is connected and Stripe/CRM shows active Pro (or Mentoring). */
  const showGate = !isConnected || subLoading || !isSubscribed;

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-1">
            <GraduationCap className="h-6 w-6" />
            <span className="text-xs font-semibold uppercase tracking-wider">Pro</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight">
            Educational Vault
          </h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm md:text-base">
            Equilibrium Academy — curated lessons, SMA masterclass, and session-style recordings.
            {isSubscribed && (
              <Badge variant="secondary" className="ml-2 align-middle">
                {tier}
              </Badge>
            )}
          </p>
        </div>
      </div>

      <div className="relative rounded-xl border bg-card/40">
        {showGate && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-background/70 px-6 text-center backdrop-blur-md"
            data-testid="vault-paywall-overlay"
          >
            <Lock className="h-10 w-10 text-primary mb-3" />
            <h2 className="text-lg md:text-xl font-semibold max-w-md">
              Unlock the Equilibrium Academy — Upgrade to Pro for ${TIER_PRO}/mo
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              {!isConnected
                ? "Connect your wallet so we can verify your subscription from billing (Stripe + CRM)."
                : subLoading
                  ? "Checking your subscription…"
                  : "Your plan does not include the vault. Upgrade to stream every lesson with YouTube, Vimeo, or direct MP4 links."}
            </p>
            <div className="flex flex-wrap gap-2 mt-5 justify-center">
              <Button asChild className="gap-2">
                <Link to="/pricing" data-testid="vault-upgrade-pricing">
                  <Sparkles className="h-4 w-4" />
                  Upgrade to Pro
                </Link>
              </Button>
            </div>
          </div>
        )}

        <div
          className={cn(
            "p-4 md:p-6 space-y-10 transition-[filter] duration-300",
            showGate && "blur-sm pointer-events-none select-none",
          )}
        >
          {listLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              Loading library…
            </div>
          ) : (
            VAULT_SECTION_META.map((section) => (
              <section key={section.id} className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">{section.label}</h2>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bySection[section.id].map((item) => (
                    <Card
                      key={item.id}
                      className="overflow-hidden cursor-pointer hover-elevate transition-shadow"
                      onClick={() => setActive(item)}
                      data-testid={`vault-card-${item.id}`}
                    >
                      <div className="aspect-video relative bg-muted">
                        <img
                          src={item.thumbnailUrl}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity">
                          <Play className="h-12 w-12 text-white drop-shadow-md" />
                        </div>
                        {item.source === "crm" && (
                          <Badge className="absolute top-2 right-2 text-[10px]" variant="secondary">
                            New
                          </Badge>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold line-clamp-2 leading-snug">{item.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {item.description}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] p-4 sm:p-6">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 leading-snug">{active.title}</DialogTitle>
                <DialogDescription>{active.description}</DialogDescription>
              </DialogHeader>
              {isSubscribed ? (
                <PlayerFrame url={active.videoUrl} title={active.title} />
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Connect an active Pro wallet to play video in the vault.
                  </p>
                  <Button asChild>
                    <Link to="/pricing">Upgrade to Pro</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
