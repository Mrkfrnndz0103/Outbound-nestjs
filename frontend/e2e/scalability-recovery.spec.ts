import { expect, test, type WebSocketRoute } from '@playwright/test';
import { mockShellSession } from './helpers/shell-session';

const row = { id: 'scale-request', cluster: 'Scale Hub', region: 'NCR', dock_no: 'D-01', backlogs: 4, truck_size: '6W', truck_type: 'WETLEASE', status: 'PENDING', created_by: 'scale-user', created_at: '2026-10-22T00:00:00Z' };

test('DOC can navigate all 121 actionable requests with one bounded shared queue request per page', async ({ page }) => {
  await mockShellSession(page);
  const rows = Array.from({ length: 121 }, (_, index) => ({ ...row, id: `scale-${index + 1}`, cluster: `Queue Hub ${index + 1}`, status: 'DOCKING', driver_id: null }));
  const calls: string[] = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { id: 'scale-user', name: 'Scale user', role: 'doc_officer', is_admin: false } });
    if (url.pathname.endsWith('/requests/queue')) {
      calls.push(url.search);
      const second = url.searchParams.get('cursor') === 'page-two';
      return route.fulfill({ json: { data: second ? rows.slice(100) : rows.slice(0, 100), has_more: !second, next_cursor: second ? null : 'page-two', limit: 100 } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/docking');
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(101);
  expect(calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Next queue page' }).click();
  await expect(table.getByRole('row')).toHaveCount(22);
  await expect(table).toContainText('Queue Hub 121');
  expect(calls.filter(call => call.includes('cursor=page-two'))).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Next queue page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous queue page' }).click();
  await expect(table.getByRole('row')).toHaveCount(101);
});

test('identical new submissions use distinct keys while retrying a failed submission keeps its key', async ({ page }) => {
  await mockShellSession(page);
  const keys: string[] = [];
  const payloads: unknown[] = [];
  let saved = false;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { id: 'scale-user', name: 'Scale user', role: 'ops_pic', is_admin: false } });
    if (url.pathname.endsWith('/clusters')) return route.fulfill({ json: { data: [{ id: 'cluster-1', cluster_name: row.cluster, region: row.region, dock_number: row.dock_no, backlogs: row.backlogs, backlogs_ts: '2026-10-22T00:00:00Z' }] } });
    if (url.pathname.endsWith('/requests') && route.request().method() === 'POST') {
      keys.push(route.request().headers()['idempotency-key']); payloads.push(route.request().postDataJSON());
      if (keys.length === 1) return route.fulfill({ status: 503, json: { message: 'Temporary outage' } });
      saved = true;
      return route.fulfill({ status: 201, json: row });
    }
    return route.fulfill({ json: { data: saved ? [row] : [], current_page: 1, last_page: 1, per_page: 20, total: saved ? 1 : 0 } });
  });
  await page.goto('/outbound/lh-request');
  const fill = async () => {
    await page.getByRole('button', { name: 'Add new linehaul request' }).click();
    await page.getByRole('combobox', { name: 'Cluster' }).fill('Scale');
    await page.getByRole('option', { name: /Scale Hub/ }).click();
  };
  await fill();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Temporary outage', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Cluster' })).toHaveCount(0);
  await fill();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => keys.length).toBe(3);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).not.toBe(keys[1]);
  expect(payloads[2]).toEqual(payloads[1]);
});

test('sustained realtime events stay inside the API request budget', async ({ page }) => {
  await mockShellSession(page);
  let reads = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'scale-user', name: 'Scale user', role: 'fte_ops', is_admin: false } });
    if (path.endsWith('/requests') || path.endsWith('/requests/queue')) reads++;
    return route.fulfill({ json: { data: [], current_page: 1, last_page: 1, per_page: 20, total: 0 } });
  });
  const channels = new Map<string, { socket: WebSocketRoute; join: string; topic: string }>();
  await page.routeWebSocket('**/realtime/v1/websocket*', socket => socket.onMessage(message => {
    const [join, ref, topic, event, payload] = JSON.parse(String(message));
    if (event === 'phx_join') {
      const filters = payload.config.postgres_changes.map((filter: { table: string }) => { channels.set(filter.table, { socket, join, topic }); return { ...filter, id: 1 }; });
      socket.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters } }]));
    } else if (event === 'heartbeat') socket.send(JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
  }));
  await page.goto('/outbound/lh-request');
  await expect.poll(() => channels.has('notifications')).toBe(true);
  reads = 0;
  for (let i = 0; i < 120; i++) {
    for (const table of ['requests', 'notifications']) {
      const channel = channels.get(table)!;
      channel.socket.send(JSON.stringify([channel.join, null, channel.topic, 'postgres_changes', { ids: [1], data: { schema: 'public', table, type: table === 'requests' ? 'UPDATE' : 'INSERT', record: { id: i, target_role: 'fte_ops' }, old_record: {}, columns: [], commit_timestamp: new Date().toISOString(), errors: null } }]));
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  expect(reads).toBeGreaterThanOrEqual(4);
  expect(reads).toBeLessThanOrEqual(10);
});
