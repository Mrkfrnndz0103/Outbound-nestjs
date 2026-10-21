export const REQUEST_REALTIME_REFRESH_EVENT = "request-realtime-refresh";

export type RequestRefreshReason =
  | "initial"
  | "manual"
  | "mutation"
  | "realtime";

export function requestQueryKey(scope: string) {
  return ["requests", scope] as const;
}
