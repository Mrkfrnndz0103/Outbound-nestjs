import { expect, test } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

test.beforeEach(async ({ page }) => { await mockShellSession(page); });

test("page search finds permitted destinations and navigates", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Search pages" })).toBeVisible();
  await expect(page.getByText("Last synced", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Search pages" }).click();
  const dialog = page.getByRole("dialog", { name: "Go to page" });
  const search = dialog.getByRole("searchbox", { name: "Search pages" });
  await expect(search).toBeFocused();
  await expect(dialog.getByRole("link", { name: "User Management" })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "Docking" })).toHaveCount(0);
  await search.fill(" lh ");
  await dialog.getByRole("link", { name: "LH Request" }).click();
  await expect(page).toHaveURL(/\/outbound\/lh-request$/);
  await expect(dialog).toHaveCount(0);
});

test("keyboard search handles no matches, Enter, Escape, and restores focus", async ({ page }) => {
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Search pages" });
  await expect(trigger).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Go to page" });
  const search = dialog.getByRole("searchbox", { name: "Search pages" });
  await expect(search).toBeFocused();
  await search.fill("missing page");
  await expect(dialog.getByRole("status")).toContainText("No matching pages");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/dashboard$/);
  await search.fill("kpi");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/kpi$/);
  await trigger.click();
  await expect(search).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("mobile search fits the viewport and restores its opener", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Search pages" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Go to page" });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("page-search-mobile.png") });
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "Close page search" }).click();
  await expect(trigger).toBeFocused();
});

test("page search shortcut does not interrupt the sign-in dialog", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto("/login");
  await expect(page.getByRole("dialog", { name: "Sign in to SOC 5 Outbound" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Go to page" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Sign in to SOC 5 Outbound" })).toBeVisible();
});
