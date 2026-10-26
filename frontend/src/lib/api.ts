import { useUiStore } from "../stores/ui";
import { supabase } from "./supabase";

const base = process.env.NEXT_PUBLIC_API_URL ?? import.meta.env?.VITE_API_URL ?? "/api/v1";

async function getApiSession() {
  const current = await supabase.auth.getSession();
  // getSession waits for Supabase client initialization. If it has no active
  // browser session, let the same-origin backend cookie authenticate the
  // request (SeaTalk) or reject it; an unsolicited refresh can stall previews
  // and cookie-authenticated requests on an unrelated Supabase network call.
  return current.data.session;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Record<string, string[]> = {},
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiFieldErrors(error: unknown): Record<string, string[]> {
  return error instanceof ApiError ? error.errors : {};
}

export function apiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error instanceof ApiError && error.status === 409) {
    return `This request changed before your update was saved. Refresh the list and try again. ${error.message}`;
  }

  return error.message;
}

export const API_REQUEST_TIMEOUT_MS = 30_000;
let cooldownUntil = 0;
export function getApiCooldownMs(): number {
  return Math.max(0, cooldownUntil - Date.now());
}

export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export async function api<T = unknown>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const cooldown = getApiCooldownMs();
  if (cooldown > 0) throw new ApiError("Too many requests. Please wait before retrying.", 429, {}, cooldown);
  const { timeoutMs = API_REQUEST_TIMEOUT_MS, signal: callerSignal, ...requestInit } = init;
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(callerSignal?.reason ?? new DOMException("Request cancelled", "AbortError"));
  if (callerSignal?.aborted) cancel();
  else callerSignal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, timeoutMs));
  let abortListener: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abortListener = () => reject(controller.signal.reason);
    if (controller.signal.aborted) abortListener();
    else controller.signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    const work = (async (): Promise<T> => {
      const session = await getApiSession();
      controller.signal.throwIfAborted();
      const viewRole = useUiStore.getState().viewRole;
      const headers = new Headers(requestInit.headers);
      const method = (requestInit.method ?? "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD" && typeof requestInit.body === "string" && requestInit.body.length > 0 && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      headers.set("Accept", "application/json");
      if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
      if (viewRole) headers.set("X-View-Role", viewRole);
      const xsrf = typeof document === "undefined" ? undefined : document.cookie.split("; ").find(cookie => cookie.startsWith("XSRF-TOKEN="))?.split("=")[1];
      if (xsrf) headers.set("X-XSRF-TOKEN", decodeURIComponent(xsrf));
      const response = await fetch(`${base}${path}`, { ...requestInit, headers, signal: controller.signal, credentials: requestInit.credentials ?? "same-origin" });
      let body: unknown = null;
      const text = await response.text();
      try { body = text ? JSON.parse(text) : null; } catch { /* Empty/non-JSON success responses remain supported. */ }
      const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : `Request failed (${response.status})`;
      const errors = body && typeof body === "object" && "errors" in body && body.errors && typeof body.errors === "object"
        ? Object.fromEntries(Object.entries(body.errors).flatMap(([key,value]) => Array.isArray(value) && value.every(item => typeof item === "string") ? [[key,value]] : [])) : {};
      let retryAfterMs: number | undefined;
      if (response.status === 429) {
        const value = response.headers.get("Retry-After");
        const seconds = value === null ? Number.NaN : Number(value);
        retryAfterMs = Number.isFinite(seconds) ? Math.max(1000, seconds * 1000)
          : value && Number.isFinite(Date.parse(value)) ? Math.max(1000, Date.parse(value) - Date.now()) : 5000;
        cooldownUntil = Math.max(cooldownUntil, Date.now() + retryAfterMs);
      }
      if (!response.ok) throw new ApiError(message, response.status, errors, retryAfterMs);
      return body as T;
    })();
    return await Promise.race([work, aborted]);
  } catch (error) {
    if (callerSignal?.aborted) throw callerSignal.reason ?? new DOMException("Request cancelled", "AbortError");
    if (timedOut) throw new ApiError("Request timed out. Check the latest state before retrying this operation.", 408);
    if (error instanceof ApiError) throw error;
    throw new ApiError("Network error. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", abortListener);
  }
}
