import type { RealtimeMetricChannel } from "./realtimeMetrics";

export const REALTIME_REFRESH_INTERVAL_MS = 5000;

export function createRealtimeRefreshScheduler(
  flush: (channels: ReadonlySet<RealtimeMetricChannel>) => Promise<unknown> | void,
  cooldown: () => number = () => 0,
) {
  const dirty = new Set<RealtimeMetricChannel>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let disposed = false;
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  const arm = () => {
    if (disposed || running || timer !== undefined || dirty.size === 0) return;
    const delay = Math.max(250, lastStartedAt + REALTIME_REFRESH_INTERVAL_MS - Date.now(), cooldown());
    timer = setTimeout(() => {
      timer = undefined;
      if (cooldown() > 0) { arm(); return; }
      const channels = new Set(dirty);
      dirty.clear();
      lastStartedAt = Date.now();
      running = true;
      void Promise.resolve().then(() => flush(channels)).catch(() => {
        channels.forEach(channel => dirty.add(channel));
      }).finally(() => { running = false; arm(); });
    }, delay);
  };
  return {
    schedule(channel: RealtimeMetricChannel) { if (!disposed) { dirty.add(channel); arm(); } },
    dispose() { disposed = true; if (timer !== undefined) clearTimeout(timer); dirty.clear(); },
  };
}
