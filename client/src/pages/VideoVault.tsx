import { useState, lazy, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Loader2, Lock, Play, Sparkles } from "lucide-react";
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
  parseVideosApiList,
  tutorialToPlayUrl,
} from "@/lib/video-vault";
import type { AcademySection, TutorialVideo } from "@shared/schema";

const ReactPlayer = lazy(() => import("react-player/lazy"));

export type VaultItem = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  academySection: AcademySection;
};

const ACADEMY_IDS = new Set<AcademySection>(["beginner_patterns", "sma_masterclass", "live_sessions"]);

function mapApiToVaultItems(apiVideos: TutorialVideo[]): VaultItem[] {
  return apiVideos.map((v) => {
    const rawSection = v.academySection as string | null | undefined;
    const section: AcademySection =
      rawSection && ACADEMY_IDS.has(rawSection as AcademySection)
        ? (rawSection as AcademySection)
        : inferAcademySection(v);
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      thumbnailUrl:
        (v.thumbnailPath && v.thumbnailPath.trim()) ||
        "https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=640&q=80",
      videoUrl: tutorialToPlayUrl(v),
      academySection: section,
    };
  });
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

/** Educational Vault — content from `tutorial_videos` (PostgreSQL), grouped by admin category → academy section. */
export default function VideoVault() {
  const { isConnected } = useWallet();
  const { isSubscribed, isLoading: subLoading, tier } = useSubscription();
  const [active, setActive] = useState<VaultItem | null>(null);

  /** Same `tutorial_videos` rows as Admin → Video Manager; keep fresh for all visitors (playback stays Pro). */
  const {
    data: apiVideos = [],
    isLoading: listLoading,
    isError: listError,
    error: listErrorObj,
    refetch: refetchVideos,
  } = useQuery<TutorialVideo[]>({
    queryKey: ["/api/videos"],
    queryFn: async () => {
      const res = await fetch("/api/videos", { credentials: "include" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText || "Failed to load videos");
      }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(
          "Video library did not return JSON. Use the app URL that serves the API (same host as the site), not a separate dev frontend.",
        );
      }
      const raw: unknown = await res.json();
      return parseVideosApiList(raw);
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const items = useMemo(() => mapApiToVaultItems(apiVideos), [apiVideos]);

  const bySection = useMemo(() => {
    const map: Record<AcademySection, VaultItem[]> = {
      beginner_patterns: [],
      sma_masterclass: [],
      live_sessions: [],
    };
    for (const it of items) {
      map[it.academySection].push(it);
    }
    return map;
  }, [items]);

  const accessChecking = isConnected && subLoading;
  const canPlayVideos = isConnected && !subLoading && isSubscribed;

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-1">
            <GraduationCap className="h-6 w-6" />
            <span className="text-xs font-semibold uppercase tracking-wider">Pro</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight">Educational Vault</h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm md:text-base">
            Pro-only library from the same list as Command Center → Video Manager (uploads and links). Grouped by Beginner
            Patterns, SMA Masterclass, and Live Sessions.
            {isSubscribed && (
              <Badge variant="secondary" className="ml-2 align-middle">
                {tier}
              </Badge>
            )}
          </p>
        </div>
      </div>

      <div className="relative rounded-xl border bg-card/40">
        <div className="p-4 md:p-6 space-y-10">
          {!canPlayVideos && (
            <div
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
              data-testid="vault-paywall-banner"
            >
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">
                    {!isConnected
                      ? "Connect your wallet to unlock playback"
                      : accessChecking
                        ? "Checking your subscription…"
                        : `Pro subscription required to watch — $${TIER_PRO}/mo`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                    {!isConnected
                      ? "Anyone can browse lessons below. Connect so we can verify Pro from billing."
                      : accessChecking
                        ? "One moment while we confirm your plan."
                        : "Browse the library below. Upgrade to stream lessons added in Command Center → Videos."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button asChild variant="default" className="gap-2">
                  <Link to="/pricing" data-testid="vault-upgrade-pricing">
                    <Sparkles className="h-4 w-4" />
                    Upgrade to Pro
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {listError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {listErrorObj instanceof Error ? listErrorObj.message : "Could not load the video library."}
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetchVideos()}>
                Try again
              </Button>
            </div>
          ) : listLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              Loading library from server…
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">
              No videos in the library yet. An admin can add lessons from the Command Center → Videos tab.
            </p>
          ) : (
            VAULT_SECTION_META.map((section) => (
              <section key={section.id} className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">{section.label}</h2>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bySection[section.id].length === 0 ? (
                    <p className="text-sm text-muted-foreground col-span-full">
                      No videos in this section — use category labels like “Beginner Patterns”, “SMA Masterclass”, or
                      “Live” when publishing.
                    </p>
                  ) : (
                    bySection[section.id].map((item) => (
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
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-semibold line-clamp-2 leading-snug">{item.title}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                        </CardContent>
                      </Card>
                    ))
                  )}
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
              {canPlayVideos ? (
                active.videoUrl.trim() ? (
                  <PlayerFrame url={active.videoUrl} title={active.title} />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8 rounded-lg border border-dashed">
                    No playable URL for this lesson. Re-save the video in Command Center with a YouTube link, Vimeo, or
                    uploaded file.
                  </p>
                )
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {!isConnected
                      ? "Connect your wallet and use an active Pro plan to play videos here."
                      : accessChecking
                        ? "Confirming your subscription…"
                        : "Upgrade to Pro to stream lessons from the vault."}
                  </p>
                  <Button asChild>
                    <Link to="/pricing">{!isConnected ? "Connect & upgrade" : "Upgrade to Pro"}</Link>
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
