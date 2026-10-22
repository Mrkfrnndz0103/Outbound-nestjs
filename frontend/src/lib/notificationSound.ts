// Browsers require a user gesture before Web Audio can play. Keep the unlocked
// context for the lifetime of the dashboard instead of creating one per event.
export function createNotificationSound() {
  let context: AudioContext | null = null;
  let disposed = false;
  return {
    unlock() {
      if (disposed) return;
      try {
        const AudioContextClass =
          window.AudioContext ??
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioContextClass) return;
        context ??= new AudioContextClass();
        if (context.state === "suspended")
          void context.resume().catch(() => undefined);
      } catch {
        /* Visual notifications remain available when audio is denied. */
      }
    },
    play() {
      if (disposed || !context || context.state !== "running") return;
      try {
        const gain = context.createGain();
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(740, context.currentTime);
        oscillator.frequency.setValueAtTime(980, context.currentTime + 0.08);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.08,
          context.currentTime + 0.01,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + 0.18,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.addEventListener(
          "ended",
          () => {
            oscillator.disconnect();
            gain.disconnect();
          },
          { once: true },
        );
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
      } catch {
        /* Audio must not interrupt realtime refresh. */
      }
    },
    dispose() {
      disposed = true;
      if (context) void context.close().catch(() => undefined);
      context = null;
    },
  };
}
