import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealtimeRefreshScheduler } from "./realtimeRefresh";

afterEach(() => vi.useRealTimers());

describe("budgeted realtime refresh", () => {
  it("coalesces all channels and stays within a five-second refresh budget", async () => {
    vi.useFakeTimers();
    const flush = vi.fn(async () => {});
    const scheduler = createRealtimeRefreshScheduler(flush);
    for (let i = 0; i < 120; i++) {
      scheduler.schedule("requests"); scheduler.schedule("notifications");
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(flush.mock.calls.length).toBeLessThanOrEqual(3);
    expect(flush).toHaveBeenCalledWith(new Set(["requests", "notifications"]));
    await vi.advanceTimersByTimeAsync(5000);
    expect(flush.mock.calls.length).toBeLessThanOrEqual(4);
    scheduler.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("waits out rate-limit cooldown and retries a failed flush without a hot loop", async () => {
    vi.useFakeTimers();
    const until = Date.now() + 10_000;
    const flush = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const scheduler = createRealtimeRefreshScheduler(flush, () => Math.max(0, until - Date.now()));
    scheduler.schedule("requests");
    await vi.advanceTimersByTimeAsync(9999);
    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(flush).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(flush).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });
});
