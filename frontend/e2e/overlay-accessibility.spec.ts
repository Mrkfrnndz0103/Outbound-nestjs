import { expect, test, type Page } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

async function openLogin(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/login");
  await expect(page.getByRole("dialog", { name: "Sign in to SOC 5 Outbound" })).toBeVisible();
}

async function focusIsInDialog(page: Page, label: string) {
  return page.evaluate((name) => {
    const dialog = document.activeElement?.closest('[role="dialog"]');
    return dialog?.getAttribute("aria-label") === name;
  }, label);
}

test("login moves focus inside, contains Tab navigation, and keeps the preview inactive", async ({ page }) => {
  await openLogin(page);
  const label = "Sign in to SOC 5 Outbound";
  await expect.poll(() => focusIsInDialog(page, label)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press(index < 8 ? "Tab" : "Shift+Tab");
    expect(await focusIsInDialog(page, label)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: label })).toBeVisible();
  await page.mouse.click(10, 100);
  await expect(page.getByRole("dialog", { name: label })).toBeVisible();
});

test("password help contains focus and restores its opener within login", async ({ page }) => {
  await openLogin(page);
  await page.getByRole("tab", { name: "Backroom" }).click();
  const opener = page.getByRole("button", { name: "Forgot password?" });
  await opener.click();
  await expect(page.getByRole("dialog", { name: "Forgot password" })).toBeVisible();
  await expect.poll(() => focusIsInDialog(page, "Forgot password")).toBe(true);
  await page.keyboard.press("Tab");
  expect(await focusIsInDialog(page, "Forgot password")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Forgot password" })).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Sign in to SOC 5 Outbound" })).toBeVisible();
  await opener.click();
  await page.getByRole("dialog", { name: "Forgot password" }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(opener).toBeFocused();
});

test("request details behave as a dialog and restore focus after Escape", async ({ page }) => {
  await mockShellSession(page);
  await page.route("**/api/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/auth/me")) {
      return route.fulfill({ json: { id: "ops-user", name: "Operations", role: "ops_pic", is_admin: false } });
    }
    return route.fulfill({ json: {
      data: [{ id: "drawer-request", status: "PENDING", cluster: "North Hub", region: "North",
        dock_no: "D-01", backlogs: 4, truck_size: "6W", truck_type: "WETLEASE",
        created_by: "ops-user", created_at: "2026-10-12T00:00:00Z" }],
      current_page: 1, last_page: 1, per_page: 20, total: 1,
    } });
  });
  await page.goto("/outbound/lh-request");
  await page.getByRole("button", { name: "Card", exact: true }).click();
  const opener = page.getByRole("button", { name: "View details", exact: true });
  await opener.click();
  const label = "Details for request drawer-request";
  await expect(page.getByRole("dialog", { name: label })).toBeVisible();
  await expect.poll(() => focusIsInDialog(page, label)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await page.keyboard.press("Tab");
  expect(await focusIsInDialog(page, label)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: label })).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(page.getByRole("dialog", { name: label })).toBeVisible();
  await page.mouse.click(10, 100);
  await expect(page.getByRole("dialog", { name: label })).toHaveCount(0);
  await expect(opener).toBeFocused();
});
