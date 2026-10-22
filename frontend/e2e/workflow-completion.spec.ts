import { expect, test, type Page } from '@playwright/test';
import { mockShellSession } from './helpers/shell-session';

const original = {
  id: 'completion-request', cluster: 'North Hub', region: 'NCR', dock_no: 'D-01',
  backlogs: 4, truck_size: '6W', truck_type: 'WETLEASE', status: 'REQUESTED',
  created_by: 'completion-user', created_at: '2026-10-22T00:00:00Z',
};

async function mockRole(page: Page, role: string, getRows: () => Record<string, unknown>[]) {
  await mockShellSession(page);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'completion-user', name: 'Completion user', role, is_admin: false } });
    if (path.endsWith('/requests') || path.endsWith('/requests/queue')) {
      const rows = getRows();
      return route.fulfill({ json: { data: rows, current_page: 1, last_page: 1, per_page: 20, total: rows.length } });
    }
    return route.fallback();
  });
}

test('OPS PIC submits the active cluster form and sees the saved pending request', async ({ page }) => {
  let rows: Record<string, unknown>[] = [];
  let payload: Record<string, unknown> | undefined;
  await mockRole(page, 'ops_pic', () => rows);
  await page.route('**/clusters?*', async (route) => route.fulfill({ json: { data: [{ id: 'cluster-1', cluster_name: 'North Hub', region: 'NCR', dock_number: 'D-01', backlogs: 4, backlogs_ts: '2026-10-22T00:00:00Z' }] } }));
  await page.route('**/requests', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    payload = route.request().postDataJSON();
    rows = [{ ...original, ...payload, status: 'PENDING' }];
    return route.fulfill({ status: 201, json: rows[0] });
  });
  await page.goto('/outbound/lh-request');
  await page.getByRole('button', { name: 'Add new linehaul request' }).click();
  await page.getByRole('combobox', { name: 'Cluster' }).fill('North');
  await page.getByRole('option', { name: /North Hub/ }).click();
  await expect(page.getByRole('textbox', { name: 'Region', exact: true })).toHaveValue('NCR');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('LH request created.', { exact: true })).toBeVisible();
  expect(payload).toMatchObject({ cluster: 'North Hub', dock_no: 'D-01', region: 'NCR', backlogs: 4, truck_type: 'WETLEASE' });
  await expect(page.locator('.lh-table-row').filter({ hasText: 'North Hub' })).toContainText('PENDING');
});

test('FTE MM cancellation requires remarks, preserves errors for retry, and shows the saved reason', async ({ page }) => {
  let saved = { ...original } as Record<string, unknown>;
  let attempts = 0;
  let payload: Record<string, unknown> | undefined;
  await mockRole(page, 'fte_mm', () => [saved]);
  await page.route('**/requests/completion-request/cancel', async (route) => {
    attempts++;
    payload = route.request().postDataJSON();
    if (attempts === 1) return route.fulfill({ status: 409, json: { message: 'Request changed. Try again.' } });
    saved = { ...saved, ...payload, status: 'CANCELLED', display_status: 'CANCELLED' };
    return route.fulfill({ json: saved });
  });
  await page.goto('/midmile/truck-request');
  await page.getByRole('button', { name: 'Actions for request completion-request' }).click();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: 'Cancel request', exact: true });
  const remarks = dialog.getByRole('textbox', { name: 'Cancellation remarks' });
  await remarks.fill('   ');
  await submit.click();
  expect(attempts).toBe(0);
  await remarks.fill('  Duplicate request  ');
  await submit.click();
  await expect(dialog.getByText(/Request changed. Try again./)).toBeVisible();
  await expect(remarks).toHaveValue('  Duplicate request  ');
  await submit.click();
  await expect(dialog).toHaveCount(0);
  expect(payload).toEqual({ cancellation_remarks: 'Duplicate request' });
  await expect(page.getByText('Request cancelled.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand details for request completion-request' }).click();
  await expect(page.getByRole('region', { name: 'Cancellation remarks' })).toContainText('Duplicate request');
  await page.getByRole('button', { name: 'Actions for request completion-request' }).click();
  await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).toHaveCount(0);
});

test('OPS PIC sees the saved rejection reason in expanded details and the drawer', async ({ page }) => {
  await mockRole(page, 'ops_pic', () => [{ ...original, status: 'REJECTED', next_action_role: 'ops_pic', rejection_remarks: 'Correct the requested dock' }]);
  await page.goto('/outbound/lh-request');
  await page.getByRole('button', { name: 'Expand details for request completion-request' }).click();
  await expect(page.getByRole('region', { name: 'Rejection remarks' })).toContainText('Correct the requested dock');
  await page.getByRole('button', { name: 'Actions for request completion-request' }).click();
  await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: 'Rejection remarks' })).toContainText('Correct the requested dock');
});
