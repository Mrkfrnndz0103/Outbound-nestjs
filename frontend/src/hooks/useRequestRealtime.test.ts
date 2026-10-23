import { describe, expect, it, vi } from "vitest";
import { RealtimeClient } from "@supabase/realtime-js";
import { createRealtimeTopics, createRealtimeRecoveryTracker, isNotificationForUser } from "./useRequestRealtime";

describe("notification audience", () => {
  const user = { id: "me", role: "fte_ops" } as const;
  it("only sounds for the active role or explicitly addressed user", () => {
    expect(isNotificationForUser({ target_role: "fte_ops" }, user)).toBe(true);
    expect(isNotificationForUser({ target_role: "fte_mm" }, user)).toBe(false);
    expect(isNotificationForUser({ user_id: "other", target_role: "fte_ops" }, user)).toBe(false);
    expect(isNotificationForUser({ user_id: "me" }, user)).toBe(true);
    expect(isNotificationForUser({}, user)).toBe(false);
  });
});

async function settleRecovery() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

describe("realtime reconnect recovery", () => {
  it("retries failed recovery without an unhandled rejection or hot loop", async () => {
    vi.useFakeTimers();
    const recover = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const track = createRealtimeRecoveryTracker(recover);
    try {
      track("requests", "SUBSCRIBED"); track("requests", "CLOSED"); track("requests", "SUBSCRIBED");
      await settleRecovery();
      expect(recover).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4999);
      expect(recover).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(recover).toHaveBeenCalledTimes(2);
    } finally { track.dispose(); vi.useRealTimers(); }
  });
  it("recovers staggered channels only when each is actually reconnected", async () => {
    const recover = vi.fn();
    const track = createRealtimeRecoveryTracker(recover);
    track("requests", "SUBSCRIBED"); track("intraday", "SUBSCRIBED");
    track("requests", "CLOSED"); track("intraday", "CLOSED");
    track("requests", "SUBSCRIBED");
    await settleRecovery();
    expect(recover).toHaveBeenNthCalledWith(1, new Set(["requests"]));
    track("intraday", "SUBSCRIBED");
    await settleRecovery();
    expect(recover).toHaveBeenNthCalledWith(2, new Set(["intraday"]));
  });
  it("does not recover on initial subscriptions and recovers only once when both channels rejoin", async () => {
    const recover = vi.fn();
    const track = createRealtimeRecoveryTracker(recover);

    track("requests", "SUBSCRIBED");
    track("intraday", "SUBSCRIBED");
    expect(recover).not.toHaveBeenCalled();

    track("requests", "CLOSED");
    track("intraday", "CHANNEL_ERROR");
    track("requests", "SUBSCRIBED");
    track("intraday", "SUBSCRIBED");
    await settleRecovery();

    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith(new Set(["requests", "intraday"]));
  });

  it("does not treat an initial channel error as a reconnect", () => {
    const recover = vi.fn();
    const track = createRealtimeRecoveryTracker(recover);

    track("requests", "TIMED_OUT");
    track("requests", "SUBSCRIBED");

    expect(recover).not.toHaveBeenCalled();
  });

  it("recovers once for each separate reconnect", async () => {
    const recover = vi.fn();
    const track = createRealtimeRecoveryTracker(recover);

    track("requests", "SUBSCRIBED");
    track("requests", "CLOSED");
    track("requests", "SUBSCRIBED");
    await settleRecovery();

    track("requests", "TIMED_OUT");
    track("requests", "SUBSCRIBED");
    await settleRecovery();

    expect(recover).toHaveBeenCalledTimes(2);
  });

  it("recovers intraday data after an intraday-only reconnect", async () => {
    const recover = vi.fn();
    const track = createRealtimeRecoveryTracker(recover);

    track("intraday", "SUBSCRIBED");
    track("intraday", "TIMED_OUT");
    track("intraday", "SUBSCRIBED");
    await settleRecovery();

    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith(new Set(["intraday"]));
  });

  it("recovers notifications once after reconnect without refreshing initially", async () => {
    const recover = vi.fn();
    const track = createRealtimeRecoveryTracker(recover);

    track("notifications", "SUBSCRIBED");
    track("notifications", "SUBSCRIBED");
    expect(recover).not.toHaveBeenCalled();

    track("notifications", "CLOSED");
    track("notifications", "SUBSCRIBED");
    await settleRecovery();

    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith(new Set(["notifications"]));
  });
});

it("role/effect replacement never reuses channels awaiting asynchronous removal", async () => {
  const client = new RealtimeClient("ws://127.0.0.1:1/socket", { params: { apikey: "synthetic" } });
  const oldTopics = createRealtimeTopics();
  const nextTopics = createRealtimeTopics();
  for (const kind of ["requests", "intraday", "notifications"] as const) {
    const retiring = client.channel(oldTopics[kind]);
    let acknowledge!: () => void;
    retiring.unsubscribe = () => new Promise(resolve => { acknowledge = () => resolve("ok"); });
    const removal = client.removeChannel(retiring);
    const replacement = client.channel(nextTopics[kind]);
    expect(replacement).not.toBe(retiring);
    acknowledge();
    await removal;
    expect(client.getChannels()).toContain(replacement);
  }
});
