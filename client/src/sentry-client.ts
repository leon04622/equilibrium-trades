import * as Sentry from "@sentry/react";

function clientTracesSampleRate(): number {
  const raw = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined;
  if (raw == null || String(raw).trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n);
}

/**
 * Browser SDK — use a Sentry **browser** DSN (`VITE_SENTRY_DSN`). Omit in dev unless testing.
 */
export function initClientSentry(): void {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: clientTracesSampleRate(),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export function captureClientException(error: unknown, context?: Record<string, unknown>): void {
  if (!(import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim()) return;
  Sentry.captureException(error, { extra: context });
}
