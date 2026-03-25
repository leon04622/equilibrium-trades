/**
 * Canonical public origin for redirects, Stripe checkout return URLs, and webhooks.
 * Set PUBLIC_APP_URL (or APP_BASE_URL) on any deployed host.
 */
export function getPublicAppBaseUrl(): string {
  const explicit =
    process.env.PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const port = process.env.PORT || "5000";
  return `http://127.0.0.1:${port}`;
}
