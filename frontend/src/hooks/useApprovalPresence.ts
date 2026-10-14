import { useEffect } from "react";
import { api } from "../lib/api";
import type { Role } from "../types";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function startPresenceHeartbeat(
  role: Role,
  heartbeat: () => Promise<unknown> | unknown,
  intervalMs = HEARTBEAT_INTERVAL_MS,
): () => void {
  if (role !== "fte_ops") return () => undefined;

  let stopped = false;
  let inFlight = false;
  const send = () => {
    if (stopped || inFlight) return;
    inFlight = true;
    Promise.resolve(heartbeat())
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  };

  send();
  const interval = globalThis.setInterval(send, intervalMs);

  return () => {
    stopped = true;
    globalThis.clearInterval(interval);
  };
}

export function useApprovalPresence(role: Role): void {
  useEffect(
    () =>
      startPresenceHeartbeat(role, () =>
        api("/presence/heartbeat", { method: "POST" }),
      ),
    [role],
  );
}
