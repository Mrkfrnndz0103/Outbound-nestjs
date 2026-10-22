import { expect, test, type WebSocketRoute } from '@playwright/test';
import { mockShellSession } from './helpers/shell-session';

for (const [role, path, status] of [
  ['fte_ops', '/outbound/lh-request', 'PENDING'],
  ['fte_mm', '/midmile/truck-request', 'REQUESTED'],
  ['doc_officer', '/docking', 'DOCKING'],
] as const) {
  test(`${role} receives realtime work, sounds once per burst, and acknowledges the alert`, async ({ page }) => {
    await mockShellSession(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
      window.AudioContext = class {
        state = 'suspended'; currentTime = 0; destination = {};
        async resume() { this.state = 'running'; }
        async close() {}
        createGain() { return { gain: parameter, connect() {}, disconnect() {} }; }
        createOscillator() { return { frequency: parameter, connect() {}, disconnect() {}, stop() {}, addEventListener() {}, start() {
          document.documentElement.dataset.audioPlays = String(Number(document.documentElement.dataset.audioPlays ?? 0) + 1);
        } }; }
      } as unknown as typeof AudioContext;
    });
    const subscriptions = new Map<string, { socket: WebSocketRoute; joinRef: string; topic: string; id: number }>();
    await page.routeWebSocket('**/realtime/v1/websocket*', (socket) => {
      socket.onMessage((message) => {
        const [joinRef, ref, topic, event, payload] = JSON.parse(String(message));
        if (event === 'phx_join') {
          const filters = payload.config.postgres_changes.map((filter: { table: string }, index: number) => {
            subscriptions.set(filter.table, { socket, joinRef, topic, id: index + 1 });
            return { ...filter, id: index + 1 };
          });
          socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters } }]));
        } else if (event === 'heartbeat') {
          socket.send(JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
        }
      });
    });
    let rows: Record<string, unknown>[] = [];
    let queueReads = 0;
    const receipts = new Set<number>();
    const notifications = [
      { id: 1, request_id: 'live-request' },
      { id: 2, request_id: 'live-request' },
      { id: 3, request_id: 'another-request' },
    ];
    let failReceipt = false;
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/notifications')) return route.fulfill({ json: { data: notifications.map((notification) => ({ ...notification, read_at: receipts.has(notification.id) ? '2026-10-22T02:00:00Z' : null })) } });
      if (url.pathname.endsWith('/notifications/read-request')) {
        if (failReceipt) return route.fulfill({ status: 503, json: { message: 'Receipt service unavailable.' } });
        expect(route.request().method()).toBe('PATCH');
        const requestId = route.request().postDataJSON().request_id;
        for (const notification of notifications) {
          if (notification.request_id === requestId) receipts.add(notification.id);
        }
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { id: 'realtime-user', name: 'Realtime user', role, is_admin: false } });
      if (url.pathname.endsWith('/requests/queue')) queueReads++;
      if (url.pathname.endsWith('/requests') || url.pathname.endsWith('/requests/queue')) {
        return route.fulfill({ json: { data: rows, current_page: 1, last_page: 1, per_page: 20, total: rows.length, limit: 100 } });
      }
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto(path);
    await expect.poll(() => subscriptions.has('requests') && subscriptions.has('notifications')).toBe(true);
    await page.keyboard.press('Tab');
    const emit = (table: string, record: Record<string, unknown>, type = 'INSERT') => {
      const channel = subscriptions.get(table)!;
      channel.socket.send(JSON.stringify([channel.joinRef, null, channel.topic, 'postgres_changes', {
        ids: [channel.id], data: { schema: 'public', table, type, record, old_record: {}, columns: [], commit_timestamp: '2026-10-22T02:00:00Z', errors: null },
      }]));
    };
    rows = [{ id: 'live-request', status, cluster: 'Live Hub', region: 'NCR', dock_no: 'D-01', backlogs: 4, truck_size: '6W', truck_type: 'WETLEASE', driver_id: null, created_by: 'pic', created_at: '2026-10-22T00:00:00Z', updated_at: '2026-10-22T00:00:00Z', next_action_role: role }];
    emit('requests', rows[0]);
    emit('notifications', { id: 1, target_role: role });
    emit('notifications', { id: 2, target_role: role });
    const row = page.locator('.request-alert-blink').filter({ hasText: 'Live Hub' });
    await expect(row).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-audio-plays', '1');
    await expect(row).toHaveCSS('animation-name', 'request-alert-pulse');
    if (role === 'doc_officer') await row.getByRole('checkbox', { name: 'Confirm docking for live-request' }).check();
    else await row.getByRole('button', { name: 'Expand details for request live-request' }).click();
    await expect(page.locator('.request-alert-blink').filter({ hasText: 'Live Hub' })).toHaveCount(0);
    await expect.poll(() => [...receipts].sort()).toEqual([1, 2]);

    const readsBeforeUpdate = queueReads;
    rows = [{ ...rows[0], updated_at: '2026-10-22T00:05:00Z' }];
    emit('requests', rows[0], 'UPDATE');
    await expect.poll(() => queueReads).toBeGreaterThan(readsBeforeUpdate);
    await expect(page.locator('.request-alert-blink').filter({ hasText: 'Live Hub' })).toBeVisible();
    emit('notifications', { id: 3, target_role: role === 'fte_mm' ? 'fte_ops' : 'fte_mm' });
    await expect(page.locator('html')).toHaveAttribute('data-audio-plays', '1');
    notifications.push({ id: 4, request_id: 'live-request' });
    failReceipt = true;
    const acknowledgeAgain = async () => {
      if (role === 'doc_officer') {
        const checkbox = page.getByRole('checkbox', { name: 'Confirm docking for live-request' });
        await checkbox.uncheck();
        await checkbox.check();
      } else await page.getByRole('button', { name: /(?:Expand|Collapse) details for request live-request/ }).click();
    };
    await acknowledgeAgain();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not mark notifications as read' })).toBeVisible();
    await expect(page.locator('.request-alert-blink').filter({ hasText: 'Live Hub' })).toBeVisible();
    failReceipt = false;
    await acknowledgeAgain();
    await expect.poll(() => [...receipts].sort()).toEqual([1, 2, 4]);
    await expect(page.locator('.request-alert-blink').filter({ hasText: 'Live Hub' })).toHaveCount(0);
  });
}
