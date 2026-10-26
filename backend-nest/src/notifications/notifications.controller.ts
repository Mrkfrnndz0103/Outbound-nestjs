import { BadRequestException, Controller, Get, Inject, NotFoundException, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { DATABASE_POOL } from '../database/database.module.js';

interface AuthenticatedRequest extends Request {
  user?: { sub?: string; app_metadata?: { role?: string }; role?: string };
}

@Controller(['notifications', 'v1/notifications'])
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  private db(): Pool {
    if (!this.pool) throw new Error('Database is not configured.');
    return this.pool;
  }

  private actor(request: AuthenticatedRequest): { id: string; role: string } {
    const id = request.user?.sub;
    const role = request.user?.app_metadata?.role ?? request.user?.role;
    if (!id || !role) throw new BadRequestException('Authenticated profile is incomplete.');
    return { id, role };
  }

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    const actor = this.actor(request);
    const result = await this.db().query(
      `select n.id, n.user_id, n.target_role, n.request_id, n.event_type, n.title, n.body, n.created_at,
              case when n.user_id = $1 then n.read_at else nr.read_at end as read_at
       from notifications n
       left join notification_reads nr on nr.notification_id = n.id and nr.user_id = $1
       where n.user_id = $1 or n.target_role = $2
       order by n.created_at desc limit 50`,
      [actor.id, actor.role],
    );
    const unread = result.rows.filter((row) => row.read_at === null).length;
    return { data: result.rows, unread };
  }

  @Patch('read-all')
  async readAll(@Req() request: AuthenticatedRequest) {
    const actor = this.actor(request);
    const client = await this.db().connect();
    try {
      await client.query('begin');
      await client.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [actor.id]);
      await client.query(
        `insert into notification_reads (notification_id, user_id, read_at)
         select n.id, $1, now() from notifications n
         where n.target_role = $2 and (n.user_id is null or n.user_id <> $1)
         on conflict (notification_id, user_id) do nothing`,
        [actor.id, actor.role],
      );
      await client.query('commit');
      return { ok: true };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  @Patch('read-request')
  async readRequest(@Req() request: AuthenticatedRequest) {
    const actor = this.actor(request);
    const requestId = typeof request.body?.request_id === 'string' ? request.body.request_id : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new BadRequestException('request_id must be a UUID.');
    }
    await this.db().query('update notifications set read_at = now() where request_id = $1 and user_id = $2 and read_at is null', [requestId, actor.id]);
    await this.db().query(
      `insert into notification_reads (notification_id, user_id, read_at)
       select n.id, $1, now() from notifications n
       where n.request_id = $2 and n.target_role = $3 and (n.user_id is null or n.user_id <> $1)
       on conflict (notification_id, user_id) do nothing`,
      [actor.id, requestId, actor.role],
    );
    return { ok: true };
  }

  @Patch(':id/read')
  async read(@Req() request: AuthenticatedRequest) {
    const actor = this.actor(request);
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('Notification id must be a positive integer.');
    const visible = await this.db().query('select id, user_id from notifications where id = $1 and (user_id = $2 or target_role = $3)', [id, actor.id, actor.role]);
    if (visible.rowCount === 0) throw new NotFoundException('Notification not found.');
    if (visible.rows[0].user_id === actor.id) {
      await this.db().query('update notifications set read_at = now() where id = $1', [id]);
    } else {
      await this.db().query('insert into notification_reads (notification_id, user_id, read_at) values ($1, $2, now()) on conflict (notification_id, user_id) do nothing', [id, actor.id]);
    }
    return { ok: true };
  }
}
