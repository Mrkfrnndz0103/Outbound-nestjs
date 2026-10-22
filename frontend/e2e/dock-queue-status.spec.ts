import { expect, test } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

test.beforeEach(async ({ page }) => {
  await mockShellSession(page);
});

for (const width of [1440, 1000, 600, 375]) {
  test(`dock queue panel does not overflow the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");

    const panel = page.locator(".dock-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByRole("heading", { name: "Dock & Queue Status" })).toBeVisible();

    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  });
}

test("shows the not-connected state instead of sample docks when no live source exists", async ({ page }) => {
  await page.goto("/dashboard");

  const panel = page.locator(".dock-panel");
  await expect(panel.getByText("Dock occupancy is not connected to a live source yet.")).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator("[data-dock-status]")).toHaveCount(0);
});
