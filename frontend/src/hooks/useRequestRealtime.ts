import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  recordRealtimeInvalidation,
  recordRealtimeSignal,
} from "../lib/realtimeMetrics";
import {
  REQUEST_REALTIME_REFRESH_EVENT,
  requestQueryKey,
} from "../lib/requestRefresh";
import { getApiCooldownMs } from "../lib/api";
import { createRealtimeRefreshScheduler, REALTIME_REFRESH_INTERVAL_MS } from "../lib/realtimeRefresh";
import type { RealtimeMetricChannel } from "../lib/realtimeMetrics";
import { createNotificationSound } from "../lib/notificationSound";
import type { User } from "../types";
import { supabase } from "../lib/supabase";

export type RealtimeSubscriptionStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";

export function isNotificationForUser(
  notification: { user_id?: string | null; target_role?: string | null },
  user: Pick<User, "id" | "role">,
) {
  return notification.user_id
    ? notification.user_id === user.id
    : notification.target_role === user.role;
}

export function createRealtimeRecoveryTracker<ChannelName extends string>(
  recover: (channels: ReadonlySet<ChannelName>) => Promise<unknown> | void,
) {
  const hasSubscribed = new Set<ChannelName>();
  const disconnected = new Set<ChannelName>();
  const ready = new Set<ChannelName>();
  let scheduled = false;
  let inFlight = false;
  let disposed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (disposed || scheduled || inFlight || retryTimer !== undefined || !ready.size) return;
    scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false;
      if (disposed || inFlight || !ready.size) return;
      const channels = new Set(ready);
      ready.clear();
      inFlight = true;
      void Promise.resolve().then(() => recover(channels)).catch(() => {
        channels.forEach(channel => { if (!disconnected.has(channel)) ready.add(channel); });
        if (!disposed && ready.size) retryTimer = setTimeout(() => { retryTimer = undefined; schedule(); }, 5000);
      }).finally(() => { inFlight = false; schedule(); });
    });
  };
  const track = (channel: ChannelName, status: RealtimeSubscriptionStatus) => {
    if (disposed) return;
    if (status === "SUBSCRIBED") {
      if (!hasSubscribed.has(channel)) { hasSubscribed.add(channel); return; }
      if (disconnected.delete(channel)) { ready.add(channel); schedule(); }
    } else if (hasSubscribed.has(channel)) { disconnected.add(channel); ready.delete(channel); }
  };
  return Object.assign(track, { dispose() { disposed = true; if (retryTimer !== undefined) clearTimeout(retryTimer); ready.clear(); } });
}

export function useRequestRealtime(user: Pick<User, "id" | "role">, enabled = true) {
  const queryClient = useQueryClient();
  const { id, role } = user;
  useEffect(() => {
    if (!enabled) return;
    const sound = createNotificationSound();
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const refresh = createRealtimeRefreshScheduler(async channels => {
      const invalidations: Promise<unknown>[] = [];
      const invalidate = (key: readonly string[]) => invalidations.push(queryClient.invalidateQueries({ queryKey: key }, { cancelRefetch: false, throwOnError: true }));
      if (channels.has("requests")) {
        recordRealtimeInvalidation("requests");
        window.dispatchEvent(new Event(REQUEST_REALTIME_REFRESH_EVENT));
        invalidate(["requests"]);
        invalidate(["request-details"]);
        invalidate(["request-metrics"]);
        invalidate(["request-analytics"]);
        invalidate(["request-summary"]);
      }
      if (channels.has("intraday")) { recordRealtimeInvalidation("intraday"); invalidate(["intraday-dispatch"]); }
      if (channels.has("notifications")) {
        recordRealtimeInvalidation("notifications");
        invalidate(["notifications"]);
        if (!channels.has("requests")) invalidate(requestQueryKey("notification-queue"));
      }
      await Promise.all(invalidations);
    }, getApiCooldownMs);
    const recover = createRealtimeRecoveryTracker<RealtimeMetricChannel>(channels => { channels.forEach(channel => refresh.schedule(channel)); });
    const signal = (channel: RealtimeMetricChannel) => { recordRealtimeSignal(channel); refresh.schedule(channel); };
    let lastSoundAt = Number.NEGATIVE_INFINITY;
    const requests = supabase.channel("requests-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, () => signal("requests"))
      .subscribe(status => recover("requests", status));
    const intraday = supabase.channel("intraday-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "intraday_dispatch" }, () => signal("intraday"))
      .subscribe(status => recover("intraday", status));
    const notifications = supabase.channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, payload => {
        if (!isNotificationForUser(payload.new, { id, role })) return;
        if (Date.now() - lastSoundAt >= REALTIME_REFRESH_INTERVAL_MS) { sound.play(); lastSoundAt = Date.now(); }
        signal("notifications");
      }).subscribe(status => recover("notifications", status));
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      sound.dispose(); refresh.dispose(); recover.dispose();
      void supabase.removeChannel(requests);
      void supabase.removeChannel(intraday);
      void supabase.removeChannel(notifications);
    };
  }, [queryClient, id, role, enabled]);
}
