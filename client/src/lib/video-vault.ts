import type { AcademySection, TutorialVideo } from "@shared/schema";

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
  if (v.youtubeId?.trim()) {
    return `https://www.youtube.com/watch?v=${v.youtubeId.trim()}`;
  }
  return (v.videoPath || "").trim();
}

/** Resolve vault row for API videos (legacy rows use `category` when `academySection` is null). */
export function inferAcademySection(v: TutorialVideo): AcademySection {
  const s = v.academySection;
  if (s === "beginner_patterns" || s === "sma_masterclass" || s === "live_sessions") {
    return s;
  }
  if (v.category === "platform") return "sma_masterclass";
  if (v.category === "tips") return "live_sessions";
  return "beginner_patterns";
}
