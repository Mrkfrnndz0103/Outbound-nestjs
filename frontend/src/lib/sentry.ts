import * as Sentry from "@sentry/react";

const clampSampleRate = (value: unknown, fallback: number): number => {
  const parsed = Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 0), 1);
};

const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN)?.trim();
const environment =
  (process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT)?.trim() ||
  (process.env.NODE_ENV === "production" ? "production" : "development");
const release = (process.env.NEXT_PUBLIC_SENTRY_RELEASE)?.trim() || undefined;
const tracesSampleRate = clampSampleRate(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  0.1,
);

export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    sendDefaultPii: false,
    tracesSampleRate,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

export { Sentry };
