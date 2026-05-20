/**
 * Lazy-resolve diagram PNGs so the candles page does not pull every asset into the main bundle.
 * Paths are relative to this file → repo `attached_assets/generated_images/`.
 */
const loaders = {
  ...import.meta.glob<{ default: string }>("/attached_assets/generated_images/*.png", {
    import: "default",
    eager: false,
  }),
  ...import.meta.glob<{ default: string }>("../../../attached_assets/generated_images/*.png", {
    import: "default",
    eager: false,
  }),
};

const loaderByFilename = new Map<string, () => Promise<{ default: string }>>();
for (const [path, loader] of Object.entries(loaders)) {
  const slash = path.replace(/\\/g, "/");
  const file = slash.split("/").pop();
  if (file) loaderByFilename.set(file, loader as () => Promise<{ default: string }>);
}

export function loadCandlestickPatternImageUrl(filename: string): Promise<string | null> {
  const fn = loaderByFilename.get(filename);
  if (!fn) return Promise.resolve(null);
  return fn().then((m) => m.default);
}
