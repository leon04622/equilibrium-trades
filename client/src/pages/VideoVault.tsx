import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Loader2, Lock, Play, Sparkles, X, Clock3, ShieldCheck, Film, SearchX } from "lucide-react";
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
import { StatePanel } from "@/components/state-panel";

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

function estimateLessonDuration(description: string, title: string): string {
  const source = `${description} ${title}`.toLowerCase();
  const explicit = source.match(/(\d+)\s*(min|mins|minute|minutes)\b/);
  if (explicit) return `${explicit[1]} min`;
  const words = source.trim().split(/\s+/).filter(Boolean).length;
  const estimated = Math.min(24, Math.max(6, Math.round(words / 22) || 8));
  return `${estimated} min`;
}

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

/** react-player and some browsers handle relative media URLs poorly in dialogs — always pass absolute. */
function absolutePlaybackUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  try {
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    const base = typeof window !== "undefined" ? window.location.origin : "";
    if (t.startsWith("/") && base) return `${base}${t}`;
    return new URL(t, base || "http://localhost").href;
  } catch {
    return t;
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
  const playUrl = absolutePlaybackUrl(url);

  useEffect(() => {
    setLoadError(null);
  }, [url]);

  if (!playUrl.trim()) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg bg-black p-4 text-center text-sm text-zinc-300">
        <p>No playable URL for this lesson. Re-save the video in Command Center with a YouTube, Vimeo, or https link.</p>
      </div>
    );
  }

  return (
    <div className="relative isolate w-full shrink-0 overflow-hidden rounded-lg bg-black pt-[56.25%]">
      <div className="absolute inset-0">
        {loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-zinc-300">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" asChild>
              <a href={playUrl} target="_blank" rel="noopener noreferrer">
                Open in new tab
              </a>
            </Button>
          </div>
        ) : isUploadedVaultFileUrl(playUrl) ? (
          <video
            key={playUrl}
            className="absolute inset-0 h-full w-full bg-black object-contain"
            src={playUrl}
            controls
            muted
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
            key={playUrl}
            url={playUrl}
            width="100%"
            height="100%"
            style={{ position: "absolute", top: 0, left: 0 }}
            controls
            playing={false}
            muted
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

function VaultUpgradeInline() {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-lg border border-primary/25 bg-primary/5 p-8 text-center">
      <Lock className="h-10 w-10 text-primary shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold text-base">Equilibrium Pro required</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Connect a subscribed wallet or upgrade to unlock in-app playback for the Educational Vault.
        </p>
      </div>
      <Button asChild size="lg" className="gap-2">
        <Link to="/pricing" data-testid="vault-dialog-upgrade-pricing">
          <Sparkles className="h-4 w-4" />
          Upgrade to Pro — ${TIER_PRO}/mo
        </Link>
      </Button>
    </div>
  );
}

/** Educational Vault — lessons from GET /api/videos, grouped by the category name set in Command Center. */
export default function VideoVault() {
  const { isConnected, address } = useWallet();
  const { isPro, isLoading: subLoading, tier, isSyncError, refetch: refetchUserSync } = useSubscription();
  const [active, setActive] = useState<VaultItem | null>(null);

  /** Same /api/videos list as Admin Command Center; refetched for all visitors (playback stays Pro). */
  const {
    data: apiVideos = [],
    isLoading: listLoading,
    isError: listError,
    error: listErrorObj,
    refetch: refetchVideos,
  } = useQuery<TutorialVideo[]>({
    queryKey: ["/api/videos", address ?? ""],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (address?.trim()) {
        const wallet = address.trim();
        headers["x-wallet-address"] = wallet;
        headers.Authorization = `Bearer ${wallet}`;
      }
      const res = await fetch("/api/videos", { credentials: "include", headers });
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
    staleTime: 0,
    gcTime: 10 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled: Boolean(address),
  });

  useEffect(() => {
    void refetchVideos();
  }, [refetchVideos]);

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

  const accessChecking = isConnected && (subLoading || isPro === null);
  /** Pro (including master bypass) → no upgrade CTA; non‑Pro / logged‑out see inline upgrade in the player area. */
  const showUpgradeBanner = isConnected && isPro === false;

  if (listLoading) {
    return (
      <div className="max-w-6xl mx-auto min-h-[60vh] bg-background p-4 md:p-6">
        <StatePanel
          loading
          icon={<Loader2 className="h-6 w-6" />}
          title="Loading Educational Vault"
          description="Pulling down the latest premium lessons and playback data from the live vault."
          className="min-h-[60vh]"
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-6xl mx-auto min-h-[60vh] bg-background">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/12 via-background to-background shadow-xl shadow-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr] xl:items-end">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary/90 text-primary-foreground">
                  <GraduationCap className="mr-1 h-3 w-3" />
                  Members Vault
                </Badge>
                <Badge variant="outline" className="border-primary/20 bg-background/70">
                  Premium playback and walkthroughs
                </Badge>
                {isPro === true && tier != null && (
                  <Badge variant="secondary" className="capitalize">
                    {tier}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-display font-bold tracking-tight md:text-4xl">
                  A premium lesson library designed around the exact workflows your members are paying for.
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                  Vault content is grouped by practical use inside the product, so members can move from education to
                  execution without losing context.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-2xl border bg-background/80 p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Film className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">{items.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Published lessons currently live in the vault.</p>
              </div>
              <div className="rounded-2xl border bg-background/80 p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">Persistent member access</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lessons are served from the live backend so members keep the same access after refresh or deploy.
                </p>
              </div>
              <div className="rounded-2xl border bg-background/80 p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Clock3 className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">On-demand walkthroughs</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Members can open lessons without leaving the platform workflow.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative rounded-xl border bg-card/40">
        <div className="p-4 md:p-6 space-y-10">
          {showUpgradeBanner && (
            <div
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
              data-testid="vault-paywall-banner"
            >
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">
                    {isSyncError
                      ? "Could not load your subscription tier"
                      : accessChecking
                        ? "Loading subscription from your account…"
                        : `Pro subscription required for full access — $${TIER_PRO}/mo`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                    {isSyncError
                      ? "Retry sync — tier is loaded from the server, not the browser session."
                      : accessChecking
                        ? "Confirming your plan from Mongo-backed /api/user/sync."
                        : "Lessons play in the player below for everyone; this banner is informational for non‑Pro accounts."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {isSyncError ? (
                  <Button variant="default" className="gap-2" onClick={() => void refetchUserSync()}>
                    <Loader2 className="h-4 w-4" />
                    Retry subscription sync
                  </Button>
                ) : (
                  <Button asChild variant="default" className="gap-2">
                    <Link to="/pricing" data-testid="vault-upgrade-pricing">
                      <Sparkles className="h-4 w-4" />
                      Upgrade to Pro
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}

          {listError ? (
            <StatePanel
              icon={<SearchX className="h-6 w-6" />}
              title="The vault couldn't be loaded"
              description={
                listErrorObj instanceof Error ? listErrorObj.message : "Could not load the video library."
              }
              actionLabel="Try again"
              onAction={() => void refetchVideos()}
              contentClassName="min-h-[260px]"
            />
          ) : items.length === 0 ? (
            <StatePanel
              icon={<Film className="h-6 w-6" />}
              title="The vault is ready for its first lesson"
              description="No videos are published yet. As soon as an admin adds lessons, they will appear here for members."
              contentClassName="min-h-[260px]"
            />
          ) : (
            vaultGroups.map((group) => (
              <section key={group.title} className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-background/70 p-5 shadow-sm">
                  <h2 className="text-xl font-semibold">{group.title}</h2>
                  <p className="text-sm text-muted-foreground">{group.description}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.items.map((item) => (
                    <Card
                      key={item.id}
                      className="overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-xl hover:shadow-primary/5"
                      onClick={() => setActive(item)}
                      data-testid={`vault-card-${item.id}`}
                    >
                      <div className="aspect-video relative bg-muted overflow-hidden">
                        <img
                          src={item.thumbnailUrl}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                        <div className="absolute left-3 top-3">
                          <Badge variant="secondary" className="bg-black/45 text-white backdrop-blur">
                            {item.vaultHeading}
                          </Badge>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-95 group-hover:opacity-100 transition-opacity">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/92 text-black shadow-lg ring-4 ring-white/20">
                            <Play className="h-6 w-6 fill-current" />
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-4 space-y-3">
                        <h3 className="font-semibold line-clamp-2 leading-snug">{item.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            {estimateLessonDuration(item.description, item.title)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Play className="h-3.5 w-3.5" />
                            Open lesson
                          </span>
                        </div>
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
              {active.videoUrl.trim() ? (
                isPro === true ? (
                  <PlayerFrame key={active.id} url={active.videoUrl} title={active.title} />
                ) : isPro === false ? (
                  <VaultUpgradeInline />
                ) : null
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8 rounded-lg border border-dashed">
                  No playable URL for this lesson. Re-save the video in Command Center with a YouTube link, Vimeo, or
                  uploaded file.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
