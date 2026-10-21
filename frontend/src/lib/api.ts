import { useUiStore } from "../stores/ui";
import { supabase } from "./supabase";

const base = import.meta.env.VITE_API_URL ?? "/api/v1";

async function getApiSession() {
  const current = await supabase.auth.getSession();
  if (current.data.session || current.error) return current.data.session;

  // Supabase can briefly expose no session while restoring a persisted one.
  // Recover it before sending a protected request without Authorization.
  const refreshed = await supabase.auth.refreshSession();
  return refreshed.data.session;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Record<string, string[]> = {},
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

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await getApiSession();
  let response: Response;
  try {
    const viewRole = useUiStore.getState().viewRole;
    const headers = new Headers(init.headers);
    const method = (init.method ?? "GET").toUpperCase();
    const hasExplicitContentType = headers.has("Content-Type");
    const hasJsonBody =
      method !== "GET" &&
      method !== "HEAD" &&
      typeof init.body === "string" &&
      init.body.length > 0 &&
      !hasExplicitContentType;

    if (hasJsonBody) headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    if (session?.access_token)
      headers.set("Authorization", `Bearer ${session.access_token}`);
    if (viewRole) headers.set("X-View-Role", viewRole);
    const xsrf =
      typeof document === "undefined"
        ? undefined
        : document.cookie
            .split("; ")
            .find((cookie) => cookie.startsWith("XSRF-TOKEN="))
            ?.split("=")[1];
    if (xsrf) headers.set("X-XSRF-TOKEN", decodeURIComponent(xsrf));
    response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      credentials: init.credentials ?? "same-origin",
    });
  } catch {
    throw new ApiError(
      "Network error. Check your connection and try again.",
      0,
    );
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const message =
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : `Request failed (${response.status})`;
  const errors =
    body &&
    typeof body === "object" &&
    "errors" in body &&
    body.errors &&
    typeof body.errors === "object"
      ? Object.fromEntries(
          Object.entries(body.errors).flatMap(([key, value]) =>
            Array.isArray(value) &&
            value.every((item) => typeof item === "string")
              ? [[key, value]]
              : [],
          ),
        )
      : {};
  if (!response.ok) throw new ApiError(message, response.status, errors);
  return body as T;
}
