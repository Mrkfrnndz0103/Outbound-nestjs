import { expect, test, type Page } from '@playwright/test';

const user = {
  id: 'playwright-ops-user',
  name: 'Playwright Ops',
  role: 'fte_ops',
  is_admin: false,
  email: 'ops@example.com',
};

const session = {
  access_token:
    'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJwbGF5d3JpZ2h0LW9wcy11c2VyIiwiZXhwIjo0MTAyNDQ0ODAwLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: 'playwright-refresh-token',
  user: {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  },
};

const requestRow = {
  id: 'request-1',
  request_timestamp: '2026-09-20T09:30:00.000Z',
  cluster: 'North Hub',
  region: 'North',
  dock_no: 'D-01',
  backlogs: 4,
  backlogs_timestamp: '2026-09-20T09:00:00.000Z',
  ob_fte: 'Ops PIC',
  truck_size: '6W',
  truck_type: 'WETLEASE',
  plate_number: 'ABC-123',
  provide_time: null,
  linehaul_trip_no: 'LH-01',
  docked_time: null,
  status: 'PENDING',
  rejection_remarks: null,
  driver_id: null,
  created_by: user.id,
  created_at: '2026-09-20T09:30:00.000Z',
  updated_at: '2026-09-20T09:30:00.000Z',
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((storedSession) => {
    localStorage.setItem('sb-example-auth-token', JSON.stringify(storedSession));
    window.open = (url?: string | URL) => {
      localStorage.setItem('playwright-opened-url', String(url ?? ''));
      return null;
    };
    HTMLMediaElement.prototype.play = async () => {
      const plays = Number(localStorage.getItem('playwright-audio-plays') ?? 0);
      localStorage.setItem('playwright-audio-plays', String(plays + 1));
    };
  }, session);

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') {
      await route.fulfill({ json: user });
      return;
    }

    if (url.pathname === '/api/requests') {
      const pageNumber = Number(url.searchParams.get('page') ?? 1);
      const hasNoMatches = url.searchParams.get('search') === 'No matches';
      await route.fulfill({
        json: {
          data: hasNoMatches ? [] : [requestRow],
          current_page: pageNumber,
          last_page: hasNoMatches ? 1 : 2,
          per_page: Number(url.searchParams.get('per_page') ?? 20),
          from: hasNoMatches ? null : 1,
          to: hasNoMatches ? null : 1,
          total: hasNoMatches ? 0 : 21,
        },
      });
      return;
    }

    await route.fulfill({
      json: { data: [], current_page: 1, last_page: 1, per_page: 20, total: 0 },
    });
  });
});

async function openOutboundRequests(page: Page) {
  await page.goto('/outbound/lh-request');
  await expect(
    page.getByRole('region', { name: 'Linehaul requests' }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('North Hub', { exact: true }).first()).toBeVisible();
}

async function overrideRequestFixture(page: Page, request: Record<string, unknown>) {
  await page.unroute('**/api/**');
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') {
      await route.fulfill({ json: user });
      return;
    }
    if (url.pathname === '/api/requests') {
      await route.fulfill({
        json: {
          data: [request],
          current_page: 1,
          last_page: 1,
          per_page: 20,
          from: 1,
          to: 1,
          total: 1,
        },
      });
      return;
    }
    await route.fulfill({ json: { data: [], current_page: 1, last_page: 1, per_page: 20, total: 0 } });
  });
}

test('filters and sorts outbound requests', async ({ page }) => {
  await openOutboundRequests(page);

  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/requests' &&
      url.searchParams.get('search') === 'North'
    );
  });
  await page.getByPlaceholder('Search by plate number').fill('North');
  expect(new URL((await searchRequest).url()).searchParams.get('page')).toBe('1');

  await page.getByRole('button', { name: 'Status' }).click();
  const statusRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/requests' &&
      url.searchParams.get('status') === 'PENDING'
    );
  });
  await page.getByRole('menuitem', { name: 'PENDING' }).click();
  expect(new URL((await statusRequest).url()).searchParams.get('search')).toBe(
    'North',
  );

  const sortRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/requests' &&
      url.searchParams.get('sort') === 'cluster'
    );
  });
  await page.getByRole('button', { name: 'Cluster', exact: true }).click();
  expect(new URL((await sortRequest).url()).searchParams.get('direction')).toBe(
    'asc',
  );

  const reverseSortRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/requests' &&
      url.searchParams.get('sort') === 'cluster' &&
      url.searchParams.get('direction') === 'desc'
    );
  });
  await page.getByRole('button', { name: 'Cluster', exact: true }).click();
  await reverseSortRequest;
});

test('exports the request sheet', async ({ page }) => {
  await openOutboundRequests(page);
  await page.getByRole('button', { name: 'Export' }).click();

  const openedUrl = await page.evaluate(() =>
    localStorage.getItem('playwright-opened-url'),
  );
  expect(openedUrl).toContain('docs.google.com/spreadsheets/d/');
});

test('shows an empty state when filters return no requests', async ({ page }) => {
  await openOutboundRequests(page);
  await page.getByPlaceholder('Search by plate number').fill('No matches');

  await expect(
    page.getByText('No live requests match the current filters.'),
  ).toBeVisible();
});

test('switches views and supports row view and edit actions', async ({ page }) => {
  await openOutboundRequests(page);

  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await expect(page.locator('.lh-record-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'View details' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Details for request request-1' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close request details' }).click();

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  const rowActions = page.getByRole('button', {
    name: 'Actions for request request-1',
  });
  await expect(rowActions).toHaveAttribute('aria-haspopup', 'menu');
  await expect(rowActions).toHaveAttribute('aria-expanded', 'false');
  await rowActions.click();
  await expect(rowActions).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Details for request request-1' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close request details' }).click();

  await expect(rowActions).toBeFocused();
  await rowActions.click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Truck Type')).toHaveValue('WETLEASE');
});

test('selects requests, approves them, and expands a row inline', async ({ page }) => {
  let approvedId = '';
  await page.route('**/api/requests/*/approve', async (route) => {
    approvedId = new URL(route.request().url()).pathname.split('/')[3] ?? '';
    await route.fulfill({ json: { ...requestRow, status: 'APPROVED' } });
  });
  await openOutboundRequests(page);

  const row = page.locator('.lh-table-row').filter({ hasText: 'North Hub' });
  await row
    .getByRole('button', { name: 'Expand details for request request-1' })
    .click();
  await expect(
    page.getByLabel('Expanded details for request request-1'),
  ).toBeVisible();
  await expect(
    page
      .getByLabel('Expanded details for request request-1')
      .getByText('WETLEASE', { exact: true }),
  ).toBeVisible();

  await page.getByLabel('Select request request-1').check();
  await expect(page.getByRole('button', { name: 'Approved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approved', exact: true }).click();
  await expect.poll(() => approvedId).toBe('request-1');
});

test('keeps rerouted requests visible and disables stale approval actions', async ({ page }) => {
  await overrideRequestFixture(page, { ...requestRow, status: 'REROUTED', approval_status: 'PENDING' });

  await openOutboundRequests(page);
  await expect(page.getByText('Rerouting', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Select request request-1')).toBeDisabled();
});

test('derives checked and disabled approval state from backend metadata', async ({ page }) => {
  await overrideRequestFixture(page, { ...requestRow, approval_status: 'APPROVED' });

  await openOutboundRequests(page);
  const checkbox = page.getByLabel('Select request request-1');
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeDisabled();
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
});

test('bulk approves more than two selected requests', async ({ page }) => {
  const requestRows = [1, 2, 3].map((number) => ({
    ...requestRow,
    id: `request-${number}`,
    cluster: `Hub ${number}`,
  }));
  let bulkIds: string[] = [];
  await page.route('**/api/requests?*', async (route) => {
    await route.fulfill({
      json: {
        data: requestRows,
        current_page: 1,
        last_page: 1,
        per_page: 20,
        from: 1,
        to: 3,
        total: 3,
      },
    });
  });
  await page.route('**/api/requests/bulk-approve', async (route) => {
    bulkIds = (route.request().postDataJSON() as { ids: string[] }).ids;
    await route.fulfill({ json: { data: [] } });
  });
  await page.goto('/outbound/lh-request');

  await page.getByLabel('Select request request-1').check();
  await page.getByLabel('Select request request-2').check();
  await expect(page.getByRole('button', { name: 'Approved', exact: true })).toBeVisible();
  await page.getByLabel('Select request request-3').check();
  await expect(
    page.getByRole('button', { name: 'Approved', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Bulk Approved' }).click();
  await expect.poll(() => bulkIds).toEqual([
    'request-1',
    'request-2',
    'request-3',
  ]);
});

test('alerts FTE Ops to pending requests and acknowledges opened rows', async ({
  page,
}) => {
  await page.goto('/outbound/lh-request');

  const row = page.locator('.lh-table-row').filter({ hasText: 'North Hub' });
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/animate-pulse/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(localStorage.getItem('playwright-audio-plays') ?? 0),
      ),
    )
    .toBeGreaterThan(0);

  await row
    .getByRole('button', { name: 'Expand details for request request-1' })
    .click();
  await expect(row).not.toHaveClass(/animate-pulse/);
});

test('does not allow FTE Midmile to access LH requests', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { ...user, role: 'fte_mm' } });
  });
  await page.goto('/outbound/lh-request');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole('region', { name: 'Linehaul requests' }),
  ).toHaveCount(0);
});
