import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';

type OutboxRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly enabled = process.env.OUTBOX_WORKER_ENABLED !== 'false';
  private readonly intervalMs = Math.max(1000, Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5000));
  private readonly batchSize = Math.min(100, Math.max(1, Number(process.env.OUTBOX_BATCH_SIZE ?? 10)));
  private readonly staleSeconds = Math.max(1, Number(process.env.OUTBOX_PROCESSING_TIMEOUT_SECONDS ?? 300));
  private readonly baseBackoffSeconds = Math.max(1, Number(process.env.OUTBOX_BASE_BACKOFF_SECONDS ?? 5));
  private readonly maxBackoffSeconds = Math.max(this.baseBackoffSeconds, Number(process.env.OUTBOX_MAX_BACKOFF_SECONDS ?? 300));

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  onModuleInit(): void {
    if (!this.enabled || !this.pool) {
      this.logger.log(this.pool ? 'Outbox worker disabled.' : 'Outbox worker disabled because DATABASE_URL is not configured.');
      return;
    }
    void this.drain();
    this.timer = setInterval(() => void this.drain(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async drain(): Promise<void> {
    if (this.running || !this.pool) return;
    this.running = true;
    try {
      const result = await this.pool.query<{ id: string }>(
        `select id from workflow_outbox
         where (status = 'PENDING' and available_at <= now())
            or (status = 'PROCESSING' and processing_started_at <= now() - make_interval(secs => $1))
         order by available_at asc, id asc limit $2`,
        [this.staleSeconds, this.batchSize],
      );
      for (const row of result.rows) await this.process(row.id);
    } catch (error) {
      this.logger.error(`Outbox poll failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }

  private async process(id: string): Promise<void> {
    const client = await this.pool!.connect();
    let lease: OutboxRow | undefined;
    try {
      await client.query('begin');
      const claimed = await client.query<OutboxRow>(
        `update workflow_outbox
         set status = 'PROCESSING', attempts = attempts + 1, processing_started_at = now(), updated_at = now()
         where id = $1 and attempts < max_attempts and
           ((status = 'PENDING' and available_at <= now()) or
            (status = 'PROCESSING' and processing_started_at <= now() - make_interval(secs => $2)))
         returning id, event_type, payload, attempts, max_attempts`,
        [id, this.staleSeconds],
      );
      if (claimed.rowCount === 0) {
        await client.query('rollback');
        return;
      }
      lease = claimed.rows[0];
      await client.query('commit');
      await this.handle(lease);
      await this.markCompleted(id, lease.attempts);
    } catch (error) {
      try { await client.query('rollback'); } catch { /* transaction may already be closed */ }
      if (lease) await this.markFailed(id, lease, error);
    } finally {
      client.release();
    }
  }

  private async handle(row: OutboxRow): Promise<void> {
    const payload = row.payload ?? {};
    switch (row.event_type) {
      case 'workflow.notification.created':
        await this.handleNotification(row.id, payload);
        return;
      case 'workflow.seatalk.provisioning.requested':
      case 'workflow.seatalk.synchronization.requested':
        await this.handleProviderWebhook('SEATALK_OUTBOX_WEBHOOK_URL', row.event_type, row.id, payload);
        return;
      case 'workflow.google_sheets.synchronization.requested':
        await this.handleProviderWebhook('GOOGLE_SHEETS_OUTBOX_WEBHOOK_URL', row.event_type, row.id, payload);
        return;
      default:
        throw new Error(`No Nest handler registered for ${row.event_type}.`);
    }
  }

  private async handleNotification(outboxId: string, payload: Record<string, unknown>): Promise<void> {
    for (const key of ['request_id', 'event_type', 'title', 'body']) {
      if (typeof payload[key] !== 'string' || payload[key].trim() === '') throw new Error(`Notification payload is missing ${key}.`);
    }
    await this.pool!.query(
      `insert into notifications (request_id, user_id, target_role, event_type, title, body, outbox_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (outbox_id) do nothing`,
      [payload.request_id, payload.user_id ?? null, payload.target_role ?? null, payload.event_type, payload.title, payload.body, outboxId],
    );
  }

  private async handleProviderWebhook(
    envName: 'SEATALK_OUTBOX_WEBHOOK_URL' | 'GOOGLE_SHEETS_OUTBOX_WEBHOOK_URL',
    eventType: string,
    outboxId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const target = process.env[envName];
    if (!target) throw new Error(`${envName} is not configured for ${eventType}.`);
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-outbox-id': outboxId, 'x-outbox-event-type': eventType },
      body: JSON.stringify({ id: outboxId, event_type: eventType, payload }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`${eventType} provider returned HTTP ${response.status}.`);
  }

  private async markCompleted(id: string, attempts: number): Promise<void> {
    await this.pool!.query(
      `update workflow_outbox set status = 'COMPLETED', completed_at = now(), processing_started_at = null, updated_at = now()
       where id = $1 and status = 'PROCESSING' and attempts = $2`,
      [id, attempts],
    );
  }

  private async markFailed(id: string, row: OutboxRow, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message.slice(0, 5000) : 'Unexpected outbox handler failure.';
    const terminal = ![
      'workflow.notification.created',
      'workflow.seatalk.provisioning.requested',
      'workflow.seatalk.synchronization.requested',
      'workflow.google_sheets.synchronization.requested',
    ].includes(row.event_type);
    const exhausted = row.attempts >= row.max_attempts;
    if (terminal || exhausted) {
      await this.pool!.query(
        `update workflow_outbox set status = 'DEAD_LETTER', dead_lettered_at = now(), processing_started_at = null,
         last_error = $2, updated_at = now() where id = $1 and status = 'PROCESSING' and attempts = $3`,
        [id, message, row.attempts],
      );
      this.logger.error(`Outbox ${id} dead-lettered: ${message}`);
      return;
    }
    const delay = Math.min(this.maxBackoffSeconds, this.baseBackoffSeconds * 2 ** Math.max(0, row.attempts - 1));
    await this.pool!.query(
      `update workflow_outbox set status = 'PENDING', available_at = now() + make_interval(secs => $2),
       processing_started_at = null, last_error = $3, updated_at = now()
       where id = $1 and status = 'PROCESSING' and attempts = $4`,
      [id, delay, message, row.attempts],
    );
  }
}
