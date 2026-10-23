import { describe, expect, it, vi } from "vitest";
vi.mock("./api", () => ({ api: vi.fn() }));
import { api } from "./api";
import { fetchRequestQueuePage } from "./requestQueue";

describe("bounded action queue pages", () => {
  it("passes an encoded cursor and cancellation signal without loading other pages", async () => {
    const page = { data: [], has_more: true, next_cursor: "next-page", limit: 100 };
    vi.mocked(api).mockResolvedValue(page);
    const controller = new AbortController();
    expect(await fetchRequestQueuePage("stamp+id/==", controller.signal)).toEqual(page);
    expect(api).toHaveBeenCalledExactlyOnceWith("/requests/queue?limit=100&cursor=stamp%2Bid%2F%3D%3D", { signal: controller.signal });
  });
});
