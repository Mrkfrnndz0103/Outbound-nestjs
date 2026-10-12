import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { mockShellSession } from "./helpers/shell-session";

async function openLabel(page: Page, driverId: string | null, cluster = "North Hub") {
  await mockShellSession(page);
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) {
      return route.fulfill({ json: {
        id: "doc-user", name: "Document officer", role: "doc_officer", is_admin: false,
      } });
    }
    return route.fulfill({ json: {
      data: [{
        id: "print-request", status: "DOCKING", cluster, region: "North",
        dock_no: "D-01", backlogs: 4, truck_size: "6W", truck_type: "WETLEASE",
        driver_id: driverId, plate_number: "ABC-123", created_by: "doc-user",
        docked_time: "2026-10-12T08:30:00Z",
        created_at: "2026-10-12T00:00:00Z", request_timestamp: "2026-10-12T00:00:00Z",
      }],
      current_page: 1, last_page: 1, per_page: 100, total: 1,
    } });
  });
  await page.goto("/docking");
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Printable truck label" })).toBeVisible();
  await page.getByRole("dialog").locator("img").evaluate(async (image: HTMLImageElement) => {
    await image.decode();
  });
}

for (const cluster of ["North Hub", "North Hub, South Hub", "North Hub, South Hub, East Hub"]) {
  test(`label text is large and stays inside its template boxes: ${cluster}`, async ({ page }, testInfo) => {
    await openLabel(page, "DRV-12345", cluster);
    const geometry = await page.getByRole("dialog").evaluate((dialog) => {
      const label = dialog.querySelector('[data-truck-label]') ?? dialog.querySelector('.print-preview > div')!;
      const values = [...label.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node.tagName === 'DIV');
      return values.map((field, index) => {
        const text = field.querySelector<HTMLElement>('[data-label-text]') ?? field;
        const bounds = field.getBoundingClientRect();
        const textBounds = text.getBoundingClientRect();
        return {
          name: field.dataset.labelField ?? ['plate', 'driver', 'dock', 'time'][index] ?? `load-${index}`,
          fontSize: Number.parseFloat(getComputedStyle(text).fontSize),
          fits: text.scrollHeight <= text.clientHeight + 1 && text.scrollWidth <= text.clientWidth + 1,
          inBox: textBounds.left >= bounds.left && textBounds.right <= bounds.right + 1
            && textBounds.top >= bounds.top && textBounds.bottom <= bounds.bottom + 1,
          left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
        };
      });
    });
    expect(geometry.length).toBe(4 + cluster.split(",").length);
    for (const field of geometry) {
      expect(field.fits, field.name).toBe(true);
      expect(field.inBox, field.name).toBe(true);
      if (field.name === "plate" || field.name === "dock" || field.name?.startsWith("load")) {
        expect(field.fontSize, field.name).toBeGreaterThanOrEqual(25);
      }
    }
    const loads = geometry.filter((field) => field.name?.startsWith("load")).sort((a, b) => a.left - b.left);
    for (let i = 1; i < loads.length; i += 1) expect(loads[i].left).toBeGreaterThanOrEqual(loads[i - 1].right);
    await page.getByRole("dialog").locator('[data-truck-label]').screenshot({ path: testInfo.outputPath("label-typography.png") });
  });
}

async function scanDriverQr(page: Page) {
  const qr = page.getByRole("img", { name: /^Driver ID QR / });
  const png = PNG.sync.read(await qr.screenshot());
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

test("long label text fits after resizing and switching to print", async ({ page }) => {
  const destinations = [
    "North Sorting Facility Extension Alpha",
    "Southern Distribution Centre Loading Dock",
    "Eastern Regional Consolidation and Transfer Hub",
  ];
  await openLabel(page, "DRV-12345", destinations.join(", "));
  for (const width of [1280, 390, 900]) {
    await page.setViewportSize({ width, height: 900 });
    for (const destination of destinations) {
      const text = page.getByRole("dialog").locator('[data-label-text]').filter({ hasText: destination });
      await expect(text).toHaveText(destination);
      await expect.poll(() => text.evaluate((element) =>
        element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1,
      )).toBe(true);
    }
  }
  await page.emulateMedia({ media: "print" });
  for (const destination of destinations) {
    const text = page.getByRole("dialog").locator('[data-label-text]').filter({ hasText: destination });
    await expect.poll(() => text.evaluate((element) =>
      element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1,
    )).toBe(true);
  }
});

for (const driverId of ["DRV-12345", "driver/α-009 & crew"]) {
  test(`label QR decodes to the exact driver ID: ${driverId}`, async ({ page }) => {
    await openLabel(page, driverId);
    expect(await scanDriverQr(page)).toBe(driverId);
  });
}

for (const driverId of [null, "", " \t "]) {
  test(`an unassigned driver has no placeholder QR code: ${JSON.stringify(driverId)}`, async ({ page }) => {
    await openLabel(page, driverId);
    await expect(page.getByRole("img", { name: /^Driver ID QR/ })).toHaveCount(0);
  });
}

for (const cluster of ["North Hub", "North Hub, South Hub", "North Hub, South Hub, East Hub"]) {
  test(`print media shows only the label and keeps its QR scannable: ${cluster}`, async ({ page }, testInfo) => {
    await openLabel(page, "DRV-12345", cluster);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("main", { name: "Primary content" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Print", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Close", exact: true })).toBeHidden();
    expect(await scanDriverQr(page)).toBe("DRV-12345");
    const bounds = await page.getByRole("img", { name: "Driver ID QR DRV-12345" }).boundingBox();
    expect(bounds?.width).toBeGreaterThan(50);
    const pdf = await page.pdf({
      path: testInfo.outputPath("truck-label.pdf"),
      format: "A4",
      printBackground: true,
    });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("main", { name: "Primary content" })).toBeVisible();
  });
}
