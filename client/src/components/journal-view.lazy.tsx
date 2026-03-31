import { lazy } from "react";

/** Single lazy boundary so JournalView is not pulled into the main entry chunk. */
export const LazyJournalView = lazy(() =>
  import("./JournalView").then((m) => ({ default: m.JournalView })),
);
