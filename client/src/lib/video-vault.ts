import type { AcademySection, TutorialVideo } from "@shared/schema";
import { extractYoutubeVideoIdFromUrl, extractVimeoVideoIdFromUrl } from "@shared/schema";

const YT_STANDALONE_ID = /^[a-zA-Z0-9_-]{6,}$/;

function str(raw: unknown): string {
  if (raw == null) return "";
  return String(raw);
}

function optStr(r: Record<string, unknown>, camel: string, snake: string): string | null {
  const a = r[camel];
  const b = r[snake];
  const v = a !== undefined && a !== null && a !== "" ? a : b;
  if (v == null || v === "") return null;
  return String(v);
}

/**
 * Coerce one `/api/videos` row from JSON. Handles camelCase or snake_case keys (proxies, older clients, hand-rolled APIs).
 */
export function coerceTutorialVideoFromApi(raw: unknown): TutorialVideo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id).trim();
  if (!id) return null;

  const created = r.createdAt ?? r.created_at;
  let createdAt: Date;
  if (created instanceof Date) createdAt = created;
  else if (created != null && created !== "") {
    const d = new Date(String(created));
    createdAt = Number.isNaN(d.getTime()) ? new Date() : d;
  } else {
    createdAt = new Date();
  }

  return {
    id,
    title: str(r.title),
    description: str(r.description),
    duration: str(r.duration),
    category: str(r.category),
    youtubeId: optStr(r, "youtubeId", "youtube_id"),
    videoPath: optStr(r, "videoPath", "video_path"),
    thumbnailPath: optStr(r, "thumbnailPath", "thumbnail_path"),
    academySection: optStr(r, "academySection", "academy_section"),
    createdAt,
  } as TutorialVideo;
}

/** Parse GET /api/videos body: array, or `{ videos: [...] }`, or null-safe. */
export function parseVideosApiList(raw: unknown): TutorialVideo[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map(coerceTutorialVideoFromApi).filter((v): v is TutorialVideo => v != null);
  }
  if (typeof raw === "object" && Array.isArray((raw as { videos?: unknown }).videos)) {
    return parseVideosApiList((raw as { videos: unknown[] }).videos);
  }
  return [];
}

export const VAULT_SECTION_META: { id: AcademySection; label: string; description: string }[] = [
  {
    id: "beginner_patterns",
    label: "Beginner Patterns",
    description: "Foundational chart patterns and how to read structure.",
  },
  {
    id: "sma_masterclass",
    label: "SMA Masterclass",
    description: "21/200 SMA methodology, setups, and discipline.",
  },
  {
    id: "live_sessions",
    label: "Live Trading Sessions",
    description: "Recorded walkthroughs, execution, and platform workflows.",
  },
];

export function tutorialToPlayUrl(v: Pick<TutorialVideo, "youtubeId" | "videoPath">): string {
  const rawId = v.youtubeId?.trim();
  if (rawId) {
    const fromUrl = extractYoutubeVideoIdFromUrl(rawId);
    const id = fromUrl ?? (YT_STANDALONE_ID.test(rawId) ? rawId : undefined);
    if (id) return `https://www.youtube.com/watch?v=${id}`;
    const vim = extractVimeoVideoIdFromUrl(rawId);
    if (vim) return `https://vimeo.com/${vim}`;
  }
  const p = (v.videoPath || "").trim();
  if (!p) return "";
  const ytFromPath = extractYoutubeVideoIdFromUrl(p);
  if (ytFromPath) return `https://www.youtube.com/watch?v=${ytFromPath}`;
  const vimFromPath = extractVimeoVideoIdFromUrl(p);
  if (vimFromPath) return `https://vimeo.com/${vimFromPath}`;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (typeof window !== "undefined" && p.startsWith("/")) {
    return `${window.location.origin}${p}`;
  }
  return p;
}

const SECTION_LABEL_MATCH: { id: AcademySection; needles: string[] }[] = [
  {
    id: "beginner_patterns",
    needles: ["beginner", "pattern", "strategy", "continuation", "reversal", "foundational"],
  },
  {
    id: "sma_masterclass",
    needles: ["sma", "masterclass", "21", "200", "platform", "methodology"],
  },
  {
    id: "live_sessions",
    needles: ["live", "session", "walkthrough", "execution", "tips", "routine"],
  },
];

/** Resolve vault row for API videos (admin category labels + legacy `category` / `academySection`). */
export function inferAcademySection(v: TutorialVideo): AcademySection {
  const s = v.academySection;
  if (s === "beginner_patterns" || s === "sma_masterclass" || s === "live_sessions") {
    return s;
  }
  const cat = (v.category || "").trim().toLowerCase();
  if (cat === "beginner patterns" || cat === "sma masterclass" || cat === "live trading sessions") {
    if (cat === "sma masterclass") return "sma_masterclass";
    if (cat === "live trading sessions") return "live_sessions";
    return "beginner_patterns";
  }
  for (const { id, needles } of SECTION_LABEL_MATCH) {
    if (needles.some((n) => cat.includes(n))) return id;
  }
  if (v.category === "platform") return "sma_masterclass";
  if (v.category === "tips") return "live_sessions";
  return "beginner_patterns";
}
