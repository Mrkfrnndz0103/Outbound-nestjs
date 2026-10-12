import { expect, test } from '@playwright/test';

const loginEntryTimeout = 15_000;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/requests**', async (route) => {
    await route.fulfill({
      json: {
        data: [],
        current_page: 1,
        last_page: 1,
        per_page: 20,
        from: null,
        to: null,
        total: 0,
      },
    });
  });
});

test('renders the unauthenticated login entry', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/SOC 5 Outbound/);
  await expect(
    page.getByRole('main', { name: 'Primary content', includeHidden: true }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole('link', { name: 'Dashboard', exact: true, includeHidden: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Primary navigation', includeHidden: true }),
  ).toBeVisible();
  await expect(page.getByText('Login as')).toBeVisible({
    timeout: loginEntryTimeout,
  });
  await expect(page.getByRole('tab', { name: 'FTE' })).toBeVisible();
});

test('renders both supported login modes', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('tablist', { name: 'Login as' })).toBeVisible({
    timeout: loginEntryTimeout,
  });
  await expect(page.getByRole('tab', { name: 'FTE' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Backroom' }).click();
  await expect(page.getByLabel('Ops ID')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('keeps the login modal compact on desktop viewports', async ({ page }) => {
  await page.setViewportSize({ width: 850, height: 600 });
  await page.goto('/');

  const dialog = page.getByRole('dialog', {
    name: 'Sign in to SOC 5 Outbound',
  });
  await expect(dialog).toBeVisible({ timeout: loginEntryTimeout });

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeLessThanOrEqual(500);
  await expect(dialog).toHaveCSS('overflow-y', 'auto');
  await expect(dialog.locator('..')).toHaveCSS('overflow-y', 'auto');
});

test('keeps natural app sizing on desktop and mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const appShell = page.locator('.app-shell');
  await expect(page.getByText('Login as')).toBeVisible({
    timeout: loginEntryTimeout,
  });
  await expect(appShell).toHaveCSS('zoom', '1');

  await page.setViewportSize({ width: 800, height: 800 });
  await expect(appShell).toHaveCSS('zoom', '1');
});

test('preserves deep links while showing the login entry', async ({ page }) => {
  await page.goto('/outbound/lh-request');

  await expect(page.getByText('Login as')).toBeVisible({
    timeout: loginEntryTimeout,
  });
  await expect(page).toHaveTitle(/SOC 5 Outbound/);
  expect(new URL(page.url()).pathname).toBe('/outbound/lh-request');
});

test('normalizes an unknown route to the dashboard entry flow', async ({ page }) => {
  await page.goto('/not-a-real-route');

  await expect(page.getByText('Login as')).toBeVisible({
    timeout: loginEntryTimeout,
  });
  await expect(page.getByRole('tab', { name: 'FTE' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/dashboard');
});
