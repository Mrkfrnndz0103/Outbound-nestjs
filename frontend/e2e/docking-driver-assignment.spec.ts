import { expect, test } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

test("DOC Officer saves the Driver ID before the current request opens its printable label", async ({ page }) => {
  await mockShellSession(page);
  await page.addInitScript(() => {
    window.print = () => { document.documentElement.dataset.printCalled = "true"; };
  });

  const original = {
    id: "dock-request",
    status: "DOCKING",
    cluster: "North Hub",
    region: "North",
    dock_no: "D-01",
    backlogs: 4,
    truck_size: "6W",
    truck_type: "WETLEASE",
    driver_id: null,
    plate_number: "ABC-123",
    created_by: "doc-owner",
    created_at: "2026-10-12T00:00:00Z",
    request_timestamp: "2026-10-12T00:00:00Z",
  };
  let savedPayload: Record<string, unknown> | undefined;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) {
      return route.fulfill({ json: { id: "doc-user", name: "Document officer", role: "doc_officer", is_admin: false } });
    }
    if (url.pathname.endsWith("/requests/dock-request/mark-docked") && route.request().method() === "POST") {
      savedPayload = route.request().postDataJSON();
      return route.fulfill({ json: {
        ...original,
        driver_id: savedPayload.driver_id,
        driver_assigned_at: "2026-10-13T08:30:00Z",
        status: "DOCKING",
      } });
    }
    return route.fulfill({ json: { data: [original], current_page: 1, last_page: 1, per_page: 100, total: 1 } });
  });

  await page.goto("/docking");
  const row = page.getByRole("row").filter({ hasText: "North Hub" });
  await row.getByRole("checkbox", { name: "Confirm docking for dock-request" }).check();
  await row.getByRole("button", { name: "Assign Driver ID" }).click();

  const dialog = page.getByRole("dialog", { name: "Assign Driver ID for North Hub" });
  await expect(dialog.getByRole("button", { name: "Assigned" })).toBeDisabled();
  const driverInput = dialog.getByRole("textbox", { name: "Driver ID" });
  await driverInput.fill(" 001234 ");
  await expect(dialog.getByRole("button", { name: "Assigned" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Assigned" }).click();

  expect(savedPayload).toEqual({ driver_id: "001234" });
  const label = page.getByRole("dialog", { name: "Printable truck label" });
  await expect(label).toBeVisible();
  await expect(label.locator('[data-label-field="plate"]')).toContainText("ABC-123");
  await expect(label.locator('[data-label-field="driver"]')).toContainText("001234");
  await expect(label.locator('[data-label-field="dock"]')).toContainText("D-01");
  await expect(label.getByRole("img", { name: "Driver ID QR 001234" })).toBeVisible();
  await label.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");
});
