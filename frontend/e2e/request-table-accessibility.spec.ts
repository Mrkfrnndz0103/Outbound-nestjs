import { expect, test } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

for (const role of ["ops_pic", "fte_ops", "fte_mm", "doc_officer"] as const) {
  test(`${role}: request table preserves controls and accessible data`, async ({ page }) => {
    await mockShellSession(page);
    const midmile = role === "fte_mm";
    const docking = role === "doc_officer";
    await page.addInitScript(({ scope }) => {
      localStorage.setItem(`soc5:linehaul-table:${scope}`, JSON.stringify({
        columns: ["cluster", "assignedTime", "mmFte", "docOfficer"], density: "comfortable",
      }));
    }, { scope: midmile ? "midmile" : "outbound" });
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith("/auth/me")) {
        return route.fulfill({ json: { id: "table-user", name: "Table user", role, is_admin: false } });
      }
      if (pathname.endsWith("/requests") || pathname.endsWith("/requests/queue")) {
        return route.fulfill({ json: {
          data: [{ id: "table-request", status: docking ? "DOCKING" : midmile ? "REQUESTED" : "PENDING",
            approval_status: "PENDING", cluster: "North Hub", region: "North", dock_no: "D-01",
            backlogs: 4, truck_size: "6W", truck_type: "WETLEASE", created_by: "table-user",
                created_by_name: "Request Creator",
                mm_fte_id: "mm-user", mm_fte_name: "Recorded MM",
                doc_officer_id: "doc-user", doc_officer_name: "Recorded DOC",
            request_timestamp: "2026-10-12T00:00:00Z", created_at: "2026-10-12T00:00:00Z",
            driver_assigned_at: "2026-10-12T01:42:00Z", plate_number: "LONG-PLATE-123456789" }],
          current_page: 1, last_page: 1, per_page: 20, from: 1, to: 1, total: 1,
        } });
      }
      return route.fulfill({ json: { data: [], total: 0, awaiting_action: 0, by_status: {} } });
    });
    await page.goto(docking ? "/docking" : midmile ? "/midmile/truck-request" : "/outbound/lh-request");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    const row = table.getByRole("row").filter({ hasText: "North Hub" }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Recorded MM");
    await expect(row).toContainText("Recorded DOC");
    await expect(row).not.toContainText("Request Creator");
    if (!docking) {
      const select = row.getByRole("checkbox", { name: "Select request table-request" });
      if (role === "fte_ops" || midmile) {
        await select.check();
        await expect(select).toBeChecked();
        if (role === "fte_ops") await expect(page.getByRole("button", { name: "Approve selected (1)" })).toBeVisible();
        else await expect(page.getByRole("button", { name: "Assign", exact: true })).toBeVisible();
      } else await expect(select).toHaveCount(0);
      await expect(table.getByRole("cell").filter({ hasText: "42" })).toHaveCount(1);
      const cluster = table.getByRole("columnheader", { name: "Cluster" });
      await cluster.getByRole("button").click();
      await expect(cluster).toHaveAttribute("aria-sort", "ascending");
      await cluster.getByRole("button").click();
      await expect(cluster).toHaveAttribute("aria-sort", "descending");
    } else {
      await expect(row.getByRole("checkbox", { name: "Confirm docking for table-request" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Approve selected/ })).toHaveCount(0);
    }
    const expand = row.getByRole("button", { name: /(?:Expand|Collapse).*table-request/ });
    await expand.focus();
    await page.keyboard.press("Enter");
    await expect(expand).toHaveAttribute("aria-expanded", "true");
    const detailId = await expand.getAttribute("aria-controls");
    expect(detailId).toBeTruthy();
    await expect(page.locator(`[id="${detailId}"]`)).toBeVisible();
    await page.screenshot({ path: `/tmp/request-table-${role}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(expand).toBeVisible();
    await page.screenshot({ path: `/tmp/request-table-${role}-mobile.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
