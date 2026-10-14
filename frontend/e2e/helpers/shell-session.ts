import type { Page } from "@playwright/test";

export async function mockShellSession(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    sessionStorage.setItem("soc5-seatalk-session", "1");
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/requests/metrics")) {
      await route.fulfill({ json: { total: 0, awaiting_action: 0, by_status: {} } });
      return;
    }
    if (pathname.endsWith("/requests/analytics")) {
      await route.fulfill({ json: { truck_sizes: {}, hourly: [], shift_start: "06:00" } });
      return;
    }
    if (pathname.endsWith("/requests/summary")) {
      await route.fulfill({ json: { metrics: { total: 0, awaiting_action: 0, by_status: {} }, analytics: { truck_sizes: {}, hourly: [], shift_start: "06:00" } } });
      return;
    }
    if (new URL(route.request().url()).pathname.endsWith("/auth/me")) {
      await route.fulfill({ json: {
        id: "shell-test-user", name: "Shell test user", role: "ops_pic",
        is_admin: false, email: "shell@example.com",
      } });
      return;
    }
    await route.fulfill({ json: {
      data: [], current_page: 1, last_page: 1, per_page: 20, total: 0,
    } });
  });
}
