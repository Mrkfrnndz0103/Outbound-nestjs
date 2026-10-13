export type RealtimeMetricChannel = "requests" | "intraday";

export type RealtimeRefreshMetrics = {
  startedAt: number;
  requests: { signals: number; invalidations: number; lastSignalAt: number | null; lastInvalidationAt: number | null };
  intraday: { signals: number; invalidations: number; lastSignalAt: number | null; lastInvalidationAt: number | null };
};

const metrics: RealtimeRefreshMetrics = {
  startedAt: Date.now(),
  requests: { signals: 0, invalidations: 0, lastSignalAt: null, lastInvalidationAt: null },
  intraday: { signals: 0, invalidations: 0, lastSignalAt: null, lastInvalidationAt: null },
};

function now() {
  return Date.now();
}

export function recordRealtimeSignal(channel: RealtimeMetricChannel) {
  const timestamp = now();
  metrics[channel].signals += 1;
  metrics[channel].lastSignalAt = timestamp;
}

export function recordRealtimeInvalidation(channel: RealtimeMetricChannel) {
  const timestamp = now();
  metrics[channel].invalidations += 1;
  metrics[channel].lastInvalidationAt = timestamp;
}

export function getRealtimeRefreshMetrics(): RealtimeRefreshMetrics {
  return structuredClone(metrics);
}

export function resetRealtimeRefreshMetrics() {
  metrics.startedAt = now();
  for (const channel of ["requests", "intraday"] as const) {
    metrics[channel].signals = 0;
    metrics[channel].invalidations = 0;
    metrics[channel].lastSignalAt = null;
    metrics[channel].lastInvalidationAt = null;
  }
}

if (typeof window !== "undefined") {
  window.__SOC5_REALTIME_METRICS__ = getRealtimeRefreshMetrics;
}

declare global {
  interface Window {
    __SOC5_REALTIME_METRICS__?: () => RealtimeRefreshMetrics;
  }
}
