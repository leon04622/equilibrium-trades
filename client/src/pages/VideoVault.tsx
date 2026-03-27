import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Loader2, Lock, Play, Sparkles, X } from "lucide-react";
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
import ReactPlayer from "react-player";

export type VaultItem = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  academySection: AcademySection;
  /** Group title on Educational Vault (admin category or legacy preset). */
  vaultHeading: string;
};

const ACADEMY_IDS = new Set<AcademySection>(["beginner_patterns", "sma_masterclass", "live_sessions"]);

const PRESET_VAULT_LABELS = ["Beginner Patterns", "SMA Masterclass", "Live Trading Sessions"] as const;

/** Stable section title on /videos: admin category string, or legacy inferred preset label. */
function vaultHeadingForVideo(v: TutorialVideo): string {
  const raw = (v.category || "").trim();
  if (raw) {
    const lower = raw.toLowerCase();
    for (const p of PRESET_VAULT_LABELS) {
      if (p.toLowerCase() === lower) return p;
    }
    return raw;
  }
  const rawSection = v.academySection as string | null | undefined;
  const section: AcademySection =
    rawSection && ACADEMY_IDS.has(rawSection as AcademySection)
      ? (rawSection as AcademySection)
      : inferAcademySection(v);
  return VAULT_SECTION_META.find((s) => s.id === section)?.label ?? "Library";
}

function sortVaultHeadings(headings: string[]): string[] {
  const presetRank = (h: string) => {
    const i = PRESET_VAULT_LABELS.findIndex((p) => p.toLowerCase() === h.toLowerCase());
    return i >= 0 ? i : -1;
  };
  const unique = [...new Set(headings)];
  const presets = unique.filter((h) => presetRank(h) >= 0).sort((a, b) => presetRank(a) - presetRank(b));
  const rest = unique
    .filter((h) => presetRank(h) < 0)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return [...presets, ...rest];
}

/** Same-origin uploaded vault files: path has no file extension, so react-player's file player is skipped; native video is more reliable. */
function isUploadedVaultFileUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(t, base);
    return u.pathname.startsWith("/api/uploads/files/");
  } catch {
    return false;
  }
}

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
      vaultHeading: vaultHeadingForVideo(v),
    };
  });
}

function PlayerFrame({ url, title }: { url: string; title: string }) {
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
  }, [url]);

  return (
    <div className="relative isolate w-full shrink-0 overflow-hidden rounded-lg bg-black pt-[56.25%]">
      <div className="absolute inset-0">
        {loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-zinc-300">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open in new tab
              </a>
            </Button>
          </div>
        ) : isUploadedVaultFileUrl(url) ? (
          <video
            key={url}
            className="absolute inset-0 h-full w-full bg-black object-contain"
            src={url}
            controls
            playsInline
            preload="auto"
            title={title}
            onError={() =>
              setLoadError(
                "This video could not be loaded in the player (blocked URL, format, or network).",
              )
            }
          />
        ) : (
          <ReactPlayer
            key={url}
            url={url}
            width="100%"
            height="100%"
            style={{ position: "absolute", top: 0, left: 0 }}
            controls
            playing={false}
            playsinline
            pip={false}
            onError={() =>
              setLoadError(
                "This video could not be loaded in the player (blocked URL, format, or network).",
              )
            }
            config={{
              // Do not set `origin` in playerVars — a mismatch (www vs apex, preview hosts) makes YouTube refuse playback (e.g. Error 153).
              youtube: {
                playerVars: {
                  rel: 0,
                  playsinline: 1,
                },
              },
              vimeo: { playerOptions: { playsinline: true } },
              file: {
                attributes: {
                  playsInline: true,
                  preload: "metadata",
                },
              },
            }}
          />
        )}
      </div>
      <span className="sr-only">{title}</span>
    </div>
  );
}

/** Educational Vault — lessons from GET /api/videos, grouped by the category name set in Command Center. */
export default function VideoVault() {
  const { isConnected } = useWallet();
  const { isSubscribed, isLoading: subLoading, tier } = useSubscription();
  const [active, setActive] = useState<VaultItem | null>(null);

  /** Same /api/videos list as Admin Command Center; refetched for all visitors (playback stays Pro). */
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

  const vaultGroups = useMemo(() => {
    const map = new Map<string, VaultItem[]>();
    for (const it of items) {
      const h = it.vaultHeading;
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(it);
    }
    const order = sortVaultHeadings([...map.keys()]);
    return order.map((title) => ({
      title,
      description:
        VAULT_SECTION_META.find((s) => s.label === title)?.description ??
        "Lessons published under this category in Admin Command Center.",
      items: map.get(title)!,
    }));
  }, [items]);

  const accessChecking = isConnected && subLoading;
  const canPlayVideos = isConnected && !subLoading && isSubscribed;

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-6xl mx-auto min-h-[60vh] bg-background">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-1">
            <GraduationCap className="h-6 w-6" />
            <span className="text-xs font-semibold uppercase tracking-wider">Pro</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight">Educational Vault</h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm md:text-base">
            Pro-only library loaded from <code className="text-xs">/api/videos</code> (same entries as Command Center).
            Lessons are grouped by the <strong>category name</strong> you type when publishing — use the built-in names
            or your own (each distinct name becomes a section).
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
            vaultGroups.map((group) => (
              <section key={group.title} className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">{group.title}</h2>
                  <p className="text-sm text-muted-foreground">{group.description}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.items.map((item) => (
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
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <Dialog
        modal={false}
        open={!!active}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        <DialogContent
          hideClose
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="flex max-h-[min(90dvh,920px)] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-4 overflow-y-auto p-4 sm:p-6"
        >
          {active && (
            <>
              <div className="flex items-start gap-3">
                <DialogHeader className="min-w-0 flex-1 space-y-2 text-left">
                  <DialogTitle className="leading-snug pr-1">{active.title}</DialogTitle>
                  <DialogDescription className="line-clamp-4 sm:line-clamp-none">
                    {active.description}
                  </DialogDescription>
                </DialogHeader>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full border shadow-sm"
                  aria-label="Close video"
                  onClick={() => setActive(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
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
