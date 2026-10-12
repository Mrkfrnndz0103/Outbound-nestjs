import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

async function darkSession(page: Page, role = "ops_pic") {
  await mockShellSession(page);
  await page.addInitScript(() => localStorage.setItem("soc5-medesk-theme", "dark"));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { id: "theme-user", name: "Theme user", role, is_admin: false } });
    if (path.endsWith("/requests/metrics")) return route.fulfill({ json: { total: 1, awaiting_action: 1, by_status: { PENDING: 1 } } });
    if (path.endsWith("/requests/analytics")) return route.fulfill({ json: { truck_sizes: { "6W": 1 }, hourly: [], shift_start: "06:00" } });
    if (path.endsWith("/dispatch/intraday")) return route.fulfill({ json: { data: [{ hour: 6, orderQty: 2 }, { hour: 7, orderQty: 4 }] } });
    if (path.includes("/users")) return route.fulfill({ json: { data: [{ id: "operator", name: "Test operator", email: "operator@example.com", role: "ops_pic", is_active: true }], total: 1 } });
    return route.fulfill({ json: { data: [{ id: "theme-request", status: role === "doc_officer" ? "DOCKING" : "PENDING", cluster: "North Hub", region: "North", dock_no: "D-01", backlogs: 4, truck_size: "6W", truck_type: "WETLEASE", driver_id: "DRV-12345", plate_number: "ABC-123", created_by: "theme-user", created_at: "2026-10-12T00:00:00Z" }], current_page: 1, last_page: 1, per_page: 20, total: 1 } });
  });
}

async function readableDark(locator: Locator, darkSurface = true) {
  await expect(locator).toBeVisible();
  const colors = await locator.evaluate((element) => {
    const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (values: number[]) => values.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    let surface: Element | null = element;
    while (surface && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)") surface = surface.parentElement;
    const background = luminance(rgb(getComputedStyle(surface!).backgroundColor));
    const foreground = luminance(rgb(getComputedStyle(element).color));
    return { background, ratio: (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05) };
  });
  if (darkSurface) expect(colors.background).toBeLessThan(.1);
  expect(colors.ratio).toBeGreaterThanOrEqual(4.5);
}

test("dashboard panels, metrics, and chart labels follow dark mode and switch back", async ({ page }, testInfo) => {
  await darkSession(page);
  await page.goto("/dashboard");
  await readableDark(page.getByRole("heading", { name: "Hourly Throughput" }));
  await readableDark(page.getByRole("button", { name: /Total Requests/ }).locator("small").first());
  const axis = page.locator(".intraday-shell svg text").first();
  await expect(axis).toBeVisible();
  expect(await axis.evaluate((e) => getComputedStyle(e).fill)).not.toBe("rgb(96, 112, 122)");
  await page.screenshot({ path: testInfo.outputPath("dashboard-dark.png") });
  await page.getByRole("button", { name: "Theme user" }).click();
  await page.getByRole("menuitem", { name: "Light Mode" }).click();
  await expect(page.locator(".intraday-shell")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("request rows, controls, status text, and portal drawer remain readable", async ({ page }, testInfo) => {
  await darkSession(page);
  await page.goto("/outbound/lh-request");
  await readableDark(page.locator(".lh-table-row").filter({ hasText: "North Hub" }).first());
  await readableDark(page.getByRole("button", { name: "Columns", exact: true }));
  await readableDark(page.locator(".lh-table-row").first().getByText("PENDING", { exact: true }));
  await page.getByRole("button", { name: "Card", exact: true }).click();
  await page.getByRole("button", { name: "View details", exact: true }).click();
  await readableDark(page.getByRole("dialog", { name: "Details for request theme-request" }));
  await page.screenshot({ path: testInfo.outputPath("request-dark.png") });
});

for (const [role, path, text] of [["doc_officer", "/docking", "North Hub"], ["fte_mm", "/midmile/truck-request", "North Hub"], ["fte_ops", "/users", "Test operator"]]) {
  test(`operational ${path} panel supports dark mode`, async ({ page }) => {
    await darkSession(page, role);
    await page.goto(path);
    await readableDark(path === "/docking" ? page.getByRole("cell", { name: "SOC 5 > North Hub", exact: true }) : page.getByText(text, { exact: true }).first());
  });
}

for (const width of [1280, 850, 390]) {
test(`dark-mode action labels remain usable and readable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await darkSession(page);
  await page.goto("/outbound/lh-request");
  await readableDark(page.getByRole("button", { name: "Export", exact: true }), false);
  await page.getByRole("button", { name: "Add new linehaul request" }).click();
  await readableDark(page.locator("form button[type=submit]"), false);
});
}

test("printed label stays white with black operational values in dark mode", async ({ page }) => {
  await darkSession(page, "doc_officer");
  await page.goto("/docking");
  await page.getByRole("button", { name: "Print", exact: true }).click();
  const label = page.locator("[data-truck-label]");
  await expect(label).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(label.locator('[data-label-field="plate"]')).toHaveCSS("color", "rgb(17, 17, 17)");
  await page.emulateMedia({ media: "print" });
  await expect(label).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".app-shell")).toBeHidden();
});
