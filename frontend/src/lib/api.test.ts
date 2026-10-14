import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, refreshSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: { auth: { getSession, refreshSession } },
}));

import { ApiError, api, apiErrorMessage } from "./api";

describe("api request helper", () => {
  it("turns conflicts into a recovery-oriented message", () => {
    expect(apiErrorMessage(new ApiError("Cannot approve a DOCKED request.", 409))).toBe(
      "This request changed before your update was saved. Refresh the list and try again. Cannot approve a DOCKED request.",
    );
  });

  beforeEach(() => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "token-123" } },
      error: null,
    });
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds authorization and JSON headers only for a JSON string body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    await api("/users", {
      method: "POST",
      body: JSON.stringify({ name: "Ops PIC" }),
    });

    const postHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(postHeaders.get("Authorization")).toBe("Bearer token-123");
    expect(postHeaders.get("Accept")).toBe("application/json");
    expect(postHeaders.get("Content-Type")).toBe("application/json");

    await api("/health", { method: "GET" });

    const getHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(getHeaders.has("Content-Type")).toBe(false);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/health");
  });

  it("restores a persisted session when the initial session read is empty", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: "refreshed-token" } },
      error: null,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await api("/requests");

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(headers.get("Authorization")).toBe("Bearer refreshed-token");
  });

  it("preserves an explicitly supplied content type", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await api("/upload", {
      method: "POST",
      body: "plain text",
      headers: { "Content-Type": "text/plain" },
    });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Content-Type")).toBe("text/plain");
  });

  it("returns null for successful empty and non-JSON responses", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("accepted", { status: 200 }));

    await expect(api("/empty")).resolves.toBeNull();
    await expect(api("/text")).resolves.toBeNull();
  });

  it("uses a backend error message when one is available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Request is invalid." }), {
        status: 422,
      }),
    );

    await expect(api("/requests")).rejects.toMatchObject({
      name: "ApiError",
      message: "Request is invalid.",
      status: 422,
    });
  });

  it("preserves Laravel field validation errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        message: "The given data was invalid.",
        errors: {
          truck_size: ["The selected truck size is invalid."],
          cluster: ["The cluster field is required."],
        },
      }), { status: 422 }),
    );

    await expect(api("/requests")).rejects.toMatchObject({
      status: 422,
      message: "The given data was invalid.",
      errors: {
        truck_size: ["The selected truck size is invalid."],
        cluster: ["The cluster field is required."],
      },
    });
  });

  it("falls back to the HTTP status for malformed error responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 503 }),
    );

    await expect(api("/health")).rejects.toEqual(
      new ApiError("Request failed (503)", 503),
    );
  });

  it("normalizes transport failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    await expect(api("/health")).rejects.toEqual(
      new ApiError("Network error. Check your connection and try again.", 0),
    );
  });
});
