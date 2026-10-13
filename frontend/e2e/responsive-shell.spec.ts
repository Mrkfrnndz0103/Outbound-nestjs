import { mockShellSession } from "./helpers/shell-session";
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await mockShellSession(page);
});

const zoomLevels = [80, 90, 100, 110, 125, 150, 200];
const referenceWidth = 1366;

test('reflows the application shell at common browser zoom levels', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await page.waitForSelector('main[aria-label="Primary content"]');

  for (const zoomLevel of zoomLevels) {
    const viewportWidth = Math.round(referenceWidth / (zoomLevel / 100));
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    const layout = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-slot="sidebar-container"]');
      const content = document.querySelector('main[aria-label="Primary content"]');
      const header = document.querySelector('header');

      if (
        !(content instanceof HTMLElement) ||
        !(header instanceof HTMLElement)
      ) {
        throw new Error('Responsive shell fixture is missing a shell element');
      }

      const contentBounds = content.getBoundingClientRect();
      const headerBounds = header.getBoundingClientRect();
      const sidebarBounds = sidebar instanceof HTMLElement ? sidebar.getBoundingClientRect() : null;

      return {
        sidebarRight: sidebarBounds?.right ?? 0,
        hasDesktopSidebar: sidebar instanceof HTMLElement,
        contentLeft: contentBounds.left,
        contentRight: contentBounds.right,
        contentWidth: contentBounds.width,
        headerLeft: headerBounds.left,
        headerRight: headerBounds.right,
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(layout.hasDesktopSidebar).toBe(viewportWidth >= 768);
    const shellOffsets = [0, layout.sidebarRight];
    expect(Math.min(...shellOffsets.map((offset) => Math.abs(layout.contentLeft - offset)))).toBeLessThan(1);
    expect(Math.min(...shellOffsets.map((offset) => Math.abs(layout.headerLeft - offset)))).toBeLessThan(1);
    expect(layout.headerRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.contentRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.contentWidth).toBeGreaterThan(0);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  }
});

test('opens and closes mobile navigation without trapping focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/dashboard');

  const menuToggle = page.locator('button[data-slot="sidebar-trigger"]');
  const navigation = page.locator('#primary-navigation');
  const scrim = page.locator('[data-slot="sheet-overlay"]');

  await expect(menuToggle).toBeVisible();
  await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

  await menuToggle.click();
  await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(scrim).toBeVisible();

  await scrim.click();
  await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(menuToggle).toBeFocused();

  await menuToggle.click();
  await navigation
    .getByRole('link', { name: 'Dashboard' })
    .click();
  await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(menuToggle).toBeFocused();
});

test('keeps the closed mobile navigation out of the tab order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/dashboard');

  const menuToggle = page.locator('button[data-slot="sidebar-trigger"]');
  const navigation = page.locator('#primary-navigation');

  await menuToggle.focus();
  await page.keyboard.press('Tab');

  await expect(navigation.locator(':focus')).toHaveCount(0);
});

test('rotates the request group chevron when expanded', async ({ page }) => {
  await page.goto('/dashboard');

  const toggle = page.getByRole('button', {
    name: 'Toggle outbound requests',
  });
  const chevron = toggle.locator('svg.lucide-chevron-right');

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(chevron).not.toHaveClass(/rotate-90/);

  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(chevron).toHaveClass(/rotate-90/);
});
