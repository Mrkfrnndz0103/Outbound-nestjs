import { describe, expect, it } from "vitest";
import { createAppNavigationGroups } from "./navigation";

describe("createAppNavigationGroups", () => {
  it("maps existing routes and preserves role-aware visibility", () => {
    const groups = createAppNavigationGroups({
      role: "fte_ops",
      pendingCount: 4,
    });
    const items = groups.flatMap((group) => group.items);

    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/outbound/lh-request",
      "/kpi",
      "/users",
    ]);
    expect(
      items.find((item) => item.href === "/outbound/lh-request")?.badge,
    ).toBe("4");
  });

  it("does not expose routes unavailable to the current role", () => {
    const groups = createAppNavigationGroups({
      role: "ops_pic",
      pendingCount: 0,
    });
    const hrefs = groups
      .flatMap((group) => group.items)
      .map((item) => item.href);

    expect(hrefs).toEqual(["/dashboard", "/outbound/lh-request", "/kpi"]);
    expect(hrefs).not.toContain("/users");
    expect(hrefs).not.toContain("/docking");
  });
});
