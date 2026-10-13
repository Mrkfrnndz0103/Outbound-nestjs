import { describe, expect, it } from "vitest";
import {
  getRealtimeRefreshMetrics,
  recordRealtimeInvalidation,
  recordRealtimeSignal,
  resetRealtimeRefreshMetrics,
} from "./realtimeMetrics";

describe("realtime refresh metrics", () => {
  it("tracks source signals separately from coalesced invalidations", () => {
    resetRealtimeRefreshMetrics();

    recordRealtimeSignal("requests");
    recordRealtimeSignal("requests");
    recordRealtimeInvalidation("requests");
    recordRealtimeSignal("intraday");
    recordRealtimeInvalidation("intraday");

    expect(getRealtimeRefreshMetrics()).toMatchObject({
      requests: { signals: 2, invalidations: 1 },
      intraday: { signals: 1, invalidations: 1 },
    });
  });
});
