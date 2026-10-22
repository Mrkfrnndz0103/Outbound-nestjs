import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotificationSound } from "./notificationSound";

afterEach(() => vi.unstubAllGlobals());

describe("notification audio", () => {
  it("unlocks on a user gesture, reuses the context, and releases it", async () => {
    const parameter = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    const start = vi.fn();
    const close = vi.fn(async () => {});
    const context = { state: "suspended", currentTime: 0, destination: {}, close,
      resume: vi.fn(async () => { context.state = "running"; }),
      createGain: () => ({ gain: parameter, connect: vi.fn(), disconnect: vi.fn() }),
      createOscillator: () => ({ frequency: parameter, connect: vi.fn(), disconnect: vi.fn(), start, stop: vi.fn(), addEventListener: vi.fn() }),
    };
    const AudioContext = vi.fn(function () { return context; });
    vi.stubGlobal("window", { AudioContext });
    const sound = createNotificationSound();
    sound.play();
    expect(AudioContext).not.toHaveBeenCalled();
    sound.unlock();
    await Promise.resolve();
    sound.play();
    sound.play();
    expect(AudioContext).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(2);
    sound.dispose();
    expect(close).toHaveBeenCalledOnce();
    sound.play();
    expect(start).toHaveBeenCalledTimes(2);
  });
  it("tolerates unavailable or denied audio", async () => {
    vi.stubGlobal("window", {});
    const unavailable = createNotificationSound();
    expect(() => { unavailable.unlock(); unavailable.play(); unavailable.dispose(); }).not.toThrow();
    vi.stubGlobal("window", { AudioContext: class { state = "suspended"; resume() { return Promise.reject(new Error("blocked")); } close() { return Promise.resolve(); } } });
    const blocked = createNotificationSound();
    blocked.unlock();
    await Promise.resolve();
    expect(() => blocked.play()).not.toThrow();
    blocked.dispose();
  });
});
