import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./api", () => ({ api: vi.fn() }));
import { api } from "./api";
import { acknowledgeRequestNotifications } from "./notificationAcknowledgment";

beforeEach(() => vi.mocked(api).mockReset());

describe("server notification acknowledgment", () => {
  it("acknowledges the opened request without depending on notification-list pagination", async () => {
    vi.mocked(api).mockResolvedValue({ ok: true });
    await acknowledgeRequestNotifications("request-1");
    expect(api).toHaveBeenCalledExactlyOnceWith("/notifications/read-request", {
      method: "PATCH",
      body: JSON.stringify({ request_id: "request-1" }),
    });
  });
  it("reports read failures so the alert can be restored for retry", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("offline"));
    await expect(acknowledgeRequestNotifications("request-1")).rejects.toThrow(
      "offline",
    );
  });
});
