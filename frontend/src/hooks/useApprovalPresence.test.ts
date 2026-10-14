import { afterEach, describe, expect, it, vi } from "vitest";
import { startPresenceHeartbeat } from "./useApprovalPresence";

describe("approval presence heartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends immediately and at the configured interval for FTE OPS only", async () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn().mockResolvedValue(undefined);
    const stop = startPresenceHeartbeat("fte_ops", heartbeat, 30_000);

    expect(heartbeat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heartbeat).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heartbeat).toHaveBeenCalledTimes(3);
  });

  it("does not send for non-FTE roles", () => {
    const heartbeat = vi.fn();

    const stop = startPresenceHeartbeat("ops_pic", heartbeat);

    expect(heartbeat).not.toHaveBeenCalled();
    stop();
  });
});
