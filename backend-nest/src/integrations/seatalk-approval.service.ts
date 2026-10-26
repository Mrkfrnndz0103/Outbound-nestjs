import { createHash } from 'node:crypto';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import { SeaTalkClient } from './seatalk.client.js';

type CallbackAction = 'approve' | 'reject';
type ApprovalCallback = {
  item_id?: string;
  reason?: string;
  employee?: { employee_code?: string; name?: string; email?: string };
};

@Injectable()
export class SeaTalkApprovalService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool | null,
    private readonly seatalk: SeaTalkClient,
  ) {}

  onModuleInit() {
    if (!this.enabled()) return;
    const interval = Math.max(Number(process.env.SEATALK_RUNTIME_INTERVAL_MS ?? 60_000), 15_000);
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  configured() {
    return this.seatalk.configuredForApprovals() && Boolean(
      process.env.SEATALK_APPROVE_CALLBACK_URL &&
      process.env.SEATALK_REJECT_CALLBACK_URL &&
      process.env.SEATALK_CALLBACK_SIGNING_SECRET,
    );
  }

  enabled() {
    return process.env.SEATALK_APPROVAL_ENABLED === 'true' && this.configured() && Boolean(this.pool);
  }

  async provision(requestId: string) {
    if (!this.enabled() || !this.pool) return { queued: false };
    const client = await this.pool.connect();
    let assignment: Record<string, unknown> | undefined;
    let request: Record<string, unknown> | undefined;
    try {
      await client.query('begin');
      const requestResult = await client.query(
        `select r.*, p.name as applicant_name
         from requests r join profiles p on p.id = r.created_by
         where r.id = $1 and r.approval_status = 'PENDING' for update of r`,
        [requestId],
      );
      request = requestResult.rows[0];
      if (!request) {
        await client.query('rollback');
        return { queued: false };
      }
      const existing = await client.query('select id from seatalk_approval_items where request_id = $1', [requestId]);
      if (existing.rowCount) {
        await client.query('rollback');
        return { queued: false };
      }
      assignment = await this.createAssignment(client, requestId, 1);
      if (!assignment) {
        await client.query('rollback');
        return { queued: false, reason: 'no-eligible-approver' };
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await this.deliver(request!, assignment!);
    return { queued: true };
  }

  async handleCallback(action: CallbackAction, payload: ApprovalCallback, rawBody: Buffer, token: string) {
    if (!this.pool) throw new ServiceUnavailableException('Database is not configured.');
    const itemId = payload.item_id?.trim();
    const employeeCode = payload.employee?.employee_code?.trim();
    if (!itemId || !employeeCode) return;
    const eventId = createHash('sha256').update(`${action}\n${token}\n`).update(rawBody).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const itemResult = await client.query(
        `select i.id, i.request_id, i.status as item_status, r.approval_status
         from seatalk_approval_items i join requests r on r.id = i.request_id
         where i.provider_item_id = $1 for update of i, r`,
        [itemId],
      );
      const item = itemResult.rows[0];
      const inserted = await client.query(
        `insert into seatalk_callback_events
          (event_id, provider_item_id, request_id, employee_code, action, status)
         values ($1, $2, $3, $4, $5, 'RECEIVED')
         on conflict (event_id) do nothing returning event_id`,
        [eventId, itemId, item?.request_id ?? null, employeeCode, action],
      );
      if (!inserted.rowCount || !item) {
        await client.query('commit');
        return;
      }
      const assignmentResult = await client.query(
        `select a.id, a.fte_user_id from seatalk_approval_assignments a
         join profiles p on p.id = a.fte_user_id
         where a.seatalk_approval_item_id = $1 and a.status = 'ACTIVE'
           and p.seatalk_employee_code = $2
         for update of a`,
        [item.id, employeeCode],
      );
      const assignment = assignmentResult.rows[0];
      if (!assignment || item.approval_status !== 'PENDING') {
        await client.query(
          `update seatalk_callback_events set status = 'IGNORED', processed_at = now() where event_id = $1`,
          [eventId],
        );
        await client.query('commit');
        return;
      }
      const requestStatus = action === 'approve' ? 'REQUESTED' : 'REJECTED';
      await client.query(
        `update requests set status = $1, approval_status = $2,
          approved_by = case when $2 = 'APPROVED' then $3 else approved_by end,
          approved_at = case when $2 = 'APPROVED' then now() else approved_at end,
          rejected_by = case when $2 = 'REJECTED' then $3 else rejected_by end,
          rejected_at = case when $2 = 'REJECTED' then now() else rejected_at end,
          approval_source = 'SEATALK', approval_version = approval_version + 1
         where id = $4 and approval_status = 'PENDING'`,
        [requestStatus, action === 'approve' ? 'APPROVED' : 'REJECTED', assignment.fte_user_id, item.request_id],
      );
      await client.query(
        `update seatalk_approval_assignments set status = $1, responded_at = now() where id = $2`,
        [action === 'approve' ? 'APPROVED' : 'REJECTED', assignment.id],
      );
      await client.query(
        `update seatalk_approval_items set status = $1 where id = $2`,
        [action === 'approve' ? 'APPROVED' : 'REJECTED', item.id],
      );
      await client.query(
        `insert into request_events (request_id, event_type, actor_id, metadata)
         values ($1, $2, $3, $4::jsonb)`,
        [item.request_id, action === 'approve' ? 'APPROVED_SEATALK' : 'REJECTED_SEATALK', assignment.fte_user_id, JSON.stringify({ reason: payload.reason ?? null, eventId })],
      );
      await client.query(
        `update seatalk_callback_events set status = 'PROCESSED', processed_at = now() where event_id = $1`,
        [eventId],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async tick() {
    if (this.running || !this.enabled() || !this.pool) return;
    this.running = true;
    try {
      const expired = await this.pool.query(
        `select distinct request_id from seatalk_approval_assignments
         where status = 'ACTIVE' and expires_at <= now() limit 50`,
      );
      for (const row of expired.rows) await this.reroute(row.request_id);
      const pending = await this.pool.query(
        `select r.id from requests r left join seatalk_approval_items i on i.request_id = r.id
         where r.approval_status = 'PENDING' and i.id is null order by r.created_at limit 50`,
      );
      for (const row of pending.rows) await this.provision(row.id);
    } finally {
      this.running = false;
    }
  }

  private async reroute(requestId: string) {
    if (!this.pool) return;
    const client = await this.pool.connect();
    let assignment: Record<string, unknown> | undefined;
    let request: Record<string, unknown> | undefined;
    try {
      await client.query('begin');
      const current = await client.query(
        `select a.*, i.id as item_id from seatalk_approval_assignments a
         join seatalk_approval_items i on i.id = a.seatalk_approval_item_id
         where a.request_id = $1 and a.status = 'ACTIVE' and a.expires_at <= now()
         for update of a`,
        [requestId],
      );
      if (!current.rows[0]) {
        await client.query('rollback');
        return;
      }
      await client.query(`update seatalk_approval_assignments set status = 'EXPIRED' where id = $1`, [current.rows[0].id]);
      const requestResult = await client.query(
        `select r.*, p.name as applicant_name from requests r join profiles p on p.id = r.created_by
         where r.id = $1 and r.approval_status = 'PENDING' for update of r`,
        [requestId],
      );
      request = requestResult.rows[0];
      if (request) assignment = await this.createAssignment(client, requestId, Number(current.rows[0].sequence) + 1, current.rows[0].item_id);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    if (request && assignment) await this.deliver(request, assignment);
  }

  private async createAssignment(client: PoolClient, requestId: string, sequence: number, existingItemId?: string) {
    const freshness = Math.max(Number(process.env.SEATALK_PRESENCE_ACTIVE_SECONDS ?? 60), 10);
    const approver = await client.query(
      `select p.id, p.name, p.seatalk_employee_code
       from profiles p
       where p.role = 'fte_ops' and p.is_active = true and p.seatalk_employee_code is not null
         and p.last_seen_at >= now() - ($1::text || ' seconds')::interval
       order by (select max(a.created_at) from seatalk_approval_assignments a where a.fte_user_id = p.id) nulls first, p.id
       limit 1`,
      [freshness],
    );
    if (!approver.rows[0]) return undefined;
    let itemId = existingItemId;
    if (!itemId) {
      const providerItemId = `req_${requestId.replaceAll('-', '').slice(0, 26)}`;
      const item = await client.query(
        `insert into seatalk_approval_items (request_id, provider_item_id, status)
         values ($1, $2, 'PENDING') returning id`,
        [requestId, providerItemId],
      );
      itemId = item.rows[0].id;
    }
    const timeout = Math.max(Number(process.env.SEATALK_APPROVAL_ASSIGNMENT_SECONDS ?? 180), 30);
    const assignment = await client.query(
      `insert into seatalk_approval_assignments
        (request_id, seatalk_approval_item_id, fte_user_id, sequence, status, expires_at)
       values ($1, $2, $3, $4, 'PENDING', now() + ($5::text || ' seconds')::interval)
       returning *, $6::text as approver_name, $7::text as employee_code`,
      [requestId, itemId, approver.rows[0].id, sequence, timeout, approver.rows[0].name, approver.rows[0].seatalk_employee_code],
    );
    return assignment.rows[0];
  }

  private async deliver(request: Record<string, unknown>, assignment: Record<string, unknown>) {
    if (!this.pool) return;
    const now = Math.floor(Date.now() / 1000);
    const item = await this.pool.query('select provider_item_id from seatalk_approval_items where id = $1', [assignment.seatalk_approval_item_id]);
    const itemId = item.rows[0]?.provider_item_id as string;
    try {
      await this.seatalk.createApprovalItem({
        item_id: itemId,
        applicant_name: String(request.applicant_name ?? 'Outbound request'),
        action_button: 1,
        created_at: now,
        updated_at: now,
        title: { en: `Outbound request ${String(request.cluster ?? '')}`.slice(0, 100) },
        description: { en: `${String(request.region ?? '')} · ${String(request.truck_type ?? '')}`.slice(0, 500) },
        approval_chain: { approvers: [{ employee_code: assignment.employee_code, action_time: 0, status: { state: 0, text: { en: 'Pending' } } }] },
        status: { state: 0, text: { en: 'Pending' } },
        approve_url: process.env.SEATALK_APPROVE_CALLBACK_URL,
        reject_url: process.env.SEATALK_REJECT_CALLBACK_URL,
        pending_list: [{ employee_code: assignment.employee_code, ts: now }],
        approved_list: [],
        rejected_list: [],
      });
      await this.pool.query(`update seatalk_approval_assignments set status = 'ACTIVE', sent_at = now() where id = $1`, [assignment.id]);
      await this.pool.query(`update seatalk_approval_items set status = 'ACTIVE' where id = $1`, [assignment.seatalk_approval_item_id]);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Provider delivery failed';
      await this.pool.query(`update seatalk_approval_assignments set status = 'FAILED', failure_reason = $2 where id = $1`, [assignment.id, message]);
      await this.pool.query(`update seatalk_approval_items set status = 'FAILED', failure_reason = $2 where id = $1`, [assignment.seatalk_approval_item_id, message]);
    }
  }
}
