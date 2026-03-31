import type { Express } from "express";
import * as Sentry from "@sentry/node";

function tracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n);
}

/**
 * Optional error + performance telemetry. Set `SENTRY_DSN` in production (server-side DSN).
 * No-op when unset so local dev and tests are unchanged.
 */
export function initServerSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
    tracesSampleRate: tracesSampleRate(),
    integrations: [Sentry.expressIntegration()],
  });
}

export function isServerSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN?.trim());
}

/** Call after all routes; forwards to the next error middleware (JSON handler). */
export function setupSentryExpressErrorHandler(app: Express): void {
  if (!isServerSentryEnabled()) return;
  Sentry.setupExpressErrorHandler(app);
}
