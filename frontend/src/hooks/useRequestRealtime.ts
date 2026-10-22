import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  recordRealtimeInvalidation,
  recordRealtimeSignal,
} from "../lib/realtimeMetrics";
import {
  REQUEST_REALTIME_REFRESH_EVENT,
  requestQueryKey,
} from "../lib/requestRefresh";
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
  const disconnectedChannels = new Set<ChannelName>();
  let recoveryScheduled = false;
  let recoveryInFlight = false;

  const recoverWhenSettled = () => {
    if (recoveryScheduled || recoveryInFlight) return;

    recoveryScheduled = true;
    void Promise.resolve().then(() => {
      recoveryScheduled = false;
      if (recoveryInFlight || !disconnectedChannels.size) return;

      const channels = new Set(disconnectedChannels);
      disconnectedChannels.clear();
      recoveryInFlight = true;
      void Promise.resolve(recover(channels)).finally(() => {
        recoveryInFlight = false;
        if (disconnectedChannels.size) recoverWhenSettled();
      });
    });
  };

  return (channel: ChannelName, status: RealtimeSubscriptionStatus) => {
    if (status === "SUBSCRIBED") {
      if (!hasSubscribed.has(channel)) {
        hasSubscribed.add(channel);
        return;
      }
      if (disconnectedChannels.has(channel)) recoverWhenSettled();
      return;
    }

    if (hasSubscribed.has(channel)) disconnectedChannels.add(channel);
  };
}

export function useRequestRealtime(user: Pick<User, "id" | "role">, enabled = true) {
  const queryClient = useQueryClient();
  const { id, role } = user;
  const requestRefreshTimer = useRef<number | null>(null);
  const intradayRefreshTimer = useRef<number | null>(null);
  const notificationRefreshTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const sound = createNotificationSound();
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const invalidateRequestQueries = () => {
      recordRealtimeInvalidation("requests");
      window.dispatchEvent(new Event(REQUEST_REALTIME_REFRESH_EVENT));

      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requests"] }),
        queryClient.invalidateQueries({ queryKey: ["request-details"] }),
        queryClient.invalidateQueries({ queryKey: ["request-metrics"] }),
        queryClient.invalidateQueries({ queryKey: ["request-analytics"] }),
      ]);
    };
    const refreshRequestQueries = () => {
      recordRealtimeSignal("requests");
      if (requestRefreshTimer.current !== null) return;

      requestRefreshTimer.current = window.setTimeout(() => {
        requestRefreshTimer.current = null;
        void invalidateRequestQueries();
      }, 250);
    };
    const refreshIntradayDispatch = () => {
      recordRealtimeSignal("intraday");
      if (intradayRefreshTimer.current !== null) return;

      intradayRefreshTimer.current = window.setTimeout(() => {
        intradayRefreshTimer.current = null;
        recordRealtimeInvalidation("intraday");
        void queryClient.invalidateQueries({
          queryKey: ["intraday-dispatch"],
        });
      }, 250);
    };
    const refreshNotifications = (payload: { new: Record<string, unknown> }) => {
      if (!isNotificationForUser(payload.new, { id, role })) return;
      recordRealtimeSignal("notifications");
      if (notificationRefreshTimer.current !== null) return;
      sound.play();

      notificationRefreshTimer.current = window.setTimeout(() => {
        notificationRefreshTimer.current = null;
        recordRealtimeInvalidation("notifications");
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        void queryClient.invalidateQueries({
          queryKey: requestQueryKey("notification-queue"),
        });
      }, 250);
    };
    const recoverAfterReconnect = createRealtimeRecoveryTracker((channels) =>
      Promise.all([
        ...(channels.has("requests") ? [invalidateRequestQueries()] : []),
        ...(channels.has("intraday")
          ? [
              queryClient.invalidateQueries({
                queryKey: ["intraday-dispatch"],
              }),
            ]
          : []),
        ...(channels.has("notifications")
          ? [
              queryClient.invalidateQueries({ queryKey: ["notifications"] }),
              queryClient.invalidateQueries({
                queryKey: requestQueryKey("notification-queue"),
              }),
            ]
          : []),
      ]),
    );

    const channel = supabase
      .channel("requests-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "requests",
        },
        refreshRequestQueries,
      )
      .subscribe((status) => recoverAfterReconnect("requests", status));

    const intradayChannel = supabase
      .channel("intraday-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "intraday_dispatch",
        },
        refreshIntradayDispatch,
      )
      .subscribe((status) => recoverAfterReconnect("intraday", status));

    const notificationsChannel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        refreshNotifications,
      )
      .subscribe((status) => recoverAfterReconnect("notifications", status));

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      sound.dispose();
      if (requestRefreshTimer.current !== null) {
        window.clearTimeout(requestRefreshTimer.current);
        requestRefreshTimer.current = null;
      }
      if (intradayRefreshTimer.current !== null) {
        window.clearTimeout(intradayRefreshTimer.current);
        intradayRefreshTimer.current = null;
      }
      if (notificationRefreshTimer.current !== null) {
        window.clearTimeout(notificationRefreshTimer.current);
        notificationRefreshTimer.current = null;
      }
      void supabase.removeChannel(channel);
      void supabase.removeChannel(intradayChannel);
      void supabase.removeChannel(notificationsChannel);
    };
  }, [queryClient, id, role, enabled]);
}
