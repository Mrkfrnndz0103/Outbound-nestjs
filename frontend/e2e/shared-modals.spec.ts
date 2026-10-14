import { expect, test, type Page } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

async function session(page: Page, role: string) {
  await mockShellSession(page);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { id: "modal-user", name: "Modal user", role, is_admin: false } });
    if (path.includes("/users")) return route.fulfill({ json: { data: [{ id: "operator", name: "Test operator", email: "operator@example.com", role: "ops_pic", is_active: true }], total: 1 } });
    return route.fulfill({ json: { data: [{ id: "modal-request", status: role === "doc_officer" ? "DOCKING" : role === "fte_mm" ? "REQUESTED" : "PENDING", cluster: "North Hub", region: "North", dock_no: "D-01", backlogs: 4, truck_size: "6W", truck_type: "WETLEASE", driver_id: "DRV-12345", plate_number: "ABC-123", created_by: "modal-user", created_at: "2026-10-12T00:00:00Z" }], current_page: 1, last_page: 1, per_page: 20, total: 1 } });
  });
}

async function focusedInside(page: Page, name: string) {
  return page.evaluate((label) => document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-label") === label
    || document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-labelledby") === label, name);
}

test("user form hides background navigation and contains keyboard and programmatic focus", async ({ page }) => {
  await session(page, "fte_ops");
  await page.goto("/users");
  const opener = page.getByRole("button", { name: "Add Ops PIC" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Add backroom user" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await page.locator('.app-shell a[href="/dashboard"]').evaluate((element: HTMLAnchorElement) => element.focus());
  await expect.poll(() => focusedInside(page, "Add backroom user")).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i < 6 ? "Tab" : "Shift+Tab");
    expect(await focusedInside(page, "Add backroom user")).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("print dialog contains focus and restores Print after Escape", async ({ page }) => {
  await session(page, "doc_officer");
  await page.goto("/docking");
  const opener = page.getByRole("button", { name: "Print", exact: true });
  await opener.click();
  await expect(page.getByRole("dialog", { name: "Printable truck label" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await page.keyboard.press("Shift+Tab");
  expect(await focusedInside(page, "Printable truck label")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

for (const [role, path, item, title] of [["fte_ops", "/outbound/lh-request", "Reject", "outbound-reject-title"], ["fte_mm", "/midmile/truck-request", "Assign", "action-title"]]) {
  test(`${path} modal returns focus to its row actions trigger`, async ({ page }) => {
    await session(page, role);
    await page.goto(path);
    const opener = page.getByRole("button", { name: "Actions for request modal-request" });
    await opener.click();
    await page.getByRole("menu").getByRole(role === "fte_mm" ? "button" : "menuitem", { name: item, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: item === "Assign" ? "Assign truck" : "Reject request" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
    await expect.poll(() => focusedInside(page, title)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

test("creating a user transfers focus to the credential dialog and back to Add", async ({ page }) => {
  await session(page, "fte_ops");
  await page.route("**/api/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/users") && route.request().method() === "POST") return route.fulfill({ json: { name: "New operator", initial_password: "TEST-ONLY-PASSWORD" } });
    return route.fallback();
  });
  await page.goto("/users");
  const opener = page.getByRole("button", { name: "Add Ops PIC" });
  await opener.click();
  const form = page.getByRole("dialog", { name: "Add backroom user" });
  await form.getByLabel("Name", { exact: true }).fill("New operator");
  await form.getByLabel("OPS ID", { exact: true }).fill("ops12345");
  await form.getByRole("button", { name: "Create user", exact: true }).click();
  const credential = page.getByRole("dialog", { name: "One-time password issued" });
  await expect(credential).toBeVisible();
  await expect.poll(() => focusedInside(page, "One-time password issued")).toBe(true);
  await credential.getByRole("button", { name: "Done", exact: true }).click();
  await expect(credential).toHaveCount(0);
  await expect(opener).toBeFocused();
});

for (const [role, path] of [["fte_ops", "/outbound/lh-request"], ["fte_mm", "/midmile/truck-request"]]) {
  test(`${path} print modal restores its stable row-menu trigger`, async ({ page }) => {
    await session(page, role);
    await page.goto(path);
    const opener = page.getByRole("button", { name: "Actions for request modal-request" });
    await opener.click();
    await page.getByRole("menu").getByRole(role === "fte_mm" ? "button" : "menuitem", { name: "Print", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Printable truck label" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

test("pending password reset preserves its Escape close guard", async ({ page }) => {
  await session(page, "fte_ops");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/**", async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith("/reset-password")) return route.fallback();
    await gate;
    return route.fulfill({ json: { initial_password: "TEST-ONLY-PASSWORD" } });
  });
  await page.goto("/users");
  const opener = page.getByRole("button", { name: "Reset password for Test operator" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Reset user password" });
  try {
    await dialog.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Resetting...", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  } finally { release(); }
  const credential = page.getByRole("dialog", { name: "One-time password issued" });
  await expect(credential).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});
