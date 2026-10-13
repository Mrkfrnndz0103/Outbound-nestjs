import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { REQUEST_REALTIME_REFRESH_EVENT } from "../lib/requestRefresh";
import {
  recordRealtimeInvalidation,
  recordRealtimeSignal,
} from "../lib/realtimeMetrics";
import { supabase } from "../lib/supabase";

export type RealtimeSubscriptionStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";

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

export function useRequestRealtime() {
  const queryClient = useQueryClient();
  const requestRefreshTimer = useRef<number | null>(null);
  const intradayRefreshTimer = useRef<number | null>(null);

  useEffect(() => {
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
    const recoverAfterReconnect = createRealtimeRecoveryTracker(
      (channels) =>
        Promise.all([
          ...(channels.has("requests") ? [invalidateRequestQueries()] : []),
          ...(channels.has("intraday")
            ? [
                queryClient.invalidateQueries({
                  queryKey: ["intraday-dispatch"],
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

    return () => {
      if (requestRefreshTimer.current !== null) {
        window.clearTimeout(requestRefreshTimer.current);
        requestRefreshTimer.current = null;
      }
      if (intradayRefreshTimer.current !== null) {
        window.clearTimeout(intradayRefreshTimer.current);
        intradayRefreshTimer.current = null;
      }
      void supabase.removeChannel(channel);
      void supabase.removeChannel(intradayChannel);
    };
  }, [queryClient]);
}
