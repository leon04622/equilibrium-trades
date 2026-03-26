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
  const cat = (v.category || "").toLowerCase();
  for (const { id, needles } of SECTION_LABEL_MATCH) {
    if (needles.some((n) => cat.includes(n))) return id;
  }
  if (v.category === "platform") return "sma_masterclass";
  if (v.category === "tips") return "live_sessions";
  return "beginner_patterns";
}
