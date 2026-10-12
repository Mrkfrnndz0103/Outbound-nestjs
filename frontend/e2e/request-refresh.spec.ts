import { expect, test, type Page } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

async function mockRequests(page: Page, role: string) {
  await mockShellSession(page);
  let fail = false;
  let empty = false;
  let hold: Promise<void> | undefined;
  let release = () => {};
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { id: "refresh-user", name: "Refresh user", role, is_admin: false } });
    if (!path.endsWith("/requests")) return route.fulfill({ json: { data: [], total: 0, awaiting_action: 0, by_status: {} } });
    if (hold) await hold;
    if (fail) return route.fulfill({ status: 503, json: { message: "Service temporarily unavailable" } });
    return route.fulfill({ json: { data: empty ? [] : [{ id: "refresh-request", status: "PENDING", cluster: "North Hub", region: "North", dock_no: "D-01", backlogs: 4, truck_size: "6W", truck_type: "WETLEASE", created_by: "refresh-user", created_at: "2026-10-12T00:00:00Z" }], current_page: 1, last_page: 1, per_page: 20, total: empty ? 0 : 1 } });
  });
  return {
    fail: (value: boolean) => { fail = value; },
    empty: () => { empty = true; },
    hold: () => { hold = new Promise<void>((resolve) => { release = resolve; }); },
    release: () => { hold = undefined; release(); },
  };
}

for (const [role, path] of [["ops_pic", "/outbound/lh-request"], ["fte_mm", "/midmile/truck-request"]]) {
  for (const view of ["table", "card"]) {
    test(`${path} keeps ${view} results during refresh and recovers after failure`, async ({ page }) => {
      const server = await mockRequests(page, role);
      await page.goto(path);
      if (view === "card") await page.getByRole("button", { name: path.includes("midmile") ? "Card view" : "Card", exact: true }).click();
      const records = (view === "table" ? page.locator(".lh-table-row") : page.getByRole("article")).filter({ hasText: "North Hub" });
      await expect(records).toBeVisible();
      server.hold();
      try {
        await page.getByRole("button", { name: "Refresh records", exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: "Refreshing requests" })).toBeVisible();
        await expect(records).toBeVisible();
        await expect(page.getByRole("button", { name: "Refreshing records", exact: true })).toBeDisabled();
        server.fail(true);
      } finally { server.release(); }
      const alert = page.getByRole("alert").filter({ hasText: "Couldn’t refresh requests" });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("Showing the last successful results");
      await expect(records).toBeVisible();
      server.fail(false);
      await alert.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(alert).toHaveCount(0);
      await expect(records).toBeVisible();
    });
  }

  test(`${path} labels previous-filter results while new results load`, async ({ page }) => {
    const server = await mockRequests(page, role);
    await page.goto(path);
    await expect(page.locator(".lh-table-row").filter({ hasText: "North Hub" })).toBeVisible();
    server.hold();
    try {
      await page.getByPlaceholder("Search by plate number").fill("ABC");
      await expect(page.getByRole("status").filter({ hasText: "Showing previous results" })).toBeVisible();
      await expect(page.locator(".lh-table-row").filter({ hasText: "North Hub" })).toBeVisible();
    } finally { server.release(); }
    await expect(page.getByRole("status").filter({ hasText: "Showing previous results" })).toHaveCount(0);
  });

  test(`${path} preserves cached empty results on failed refresh`, async ({ page }) => {
    const server = await mockRequests(page, role);
    server.empty();
    await page.goto(path);
    await expect(page.getByText("No live requests match the current filters.")).toBeVisible();
    server.fail(true);
    await page.getByRole("button", { name: "Refresh records", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Couldn’t refresh requests" })).toBeVisible();
    await expect(page.getByText("No requests in the last successful results.")).toBeVisible();
    await expect(page.getByText("No live requests match the current filters.")).toHaveCount(0);
  });

  test(`${path} distinguishes initial failure from a successful empty result`, async ({ page }) => {
    const server = await mockRequests(page, role);
    server.fail(true);
    await page.goto(path);
    const alert = page.getByRole("alert").filter({ hasText: "Couldn’t load requests" });
    await expect(alert).toBeVisible();
    await expect(page.getByText("No live requests match the current filters.")).toHaveCount(0);
    server.fail(false);
    server.empty();
    await alert.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByText("No live requests match the current filters.")).toBeVisible();
    await page.getByRole("button", { name: path.includes("midmile") ? "Card view" : "Card", exact: true }).click();
    await expect(page.getByText("No live requests match the current filters.")).toBeVisible();
  });
}
