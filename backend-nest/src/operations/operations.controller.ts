import { Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { DATABASE_POOL } from '../database/database.module.js';

@Controller(['v1', ''])
@UseGuards(SupabaseAuthGuard)
export class OperationsController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  private db(): Pool {
    if (!this.pool) throw new Error('Database is not configured.');
    return this.pool;
  }

  @Get('users')
  async users() {
    const result = await this.db().query('select * from users order by created_at desc limit 100');
    return { data: result.rows };
  }

  @Get('notifications')
  async notifications(@Req() request: Request & { user?: { sub?: string } }) {
    const userId = request.user?.sub;
    if (!userId) return { data: [] };
    const result = await this.db().query(
      'select * from notifications where user_id = $1 order by created_at desc limit 100',
      [userId],
    );
    return { data: result.rows };
  }

  @Patch('notifications/read-all')
  async readAll(@Req() request: Request & { user?: { sub?: string } }) {
    const userId = request.user?.sub;
    if (!userId) return { ok: false };
    await this.db().query(
      'update notifications set read_at = coalesce(read_at, now()) where user_id = $1 and read_at is null',
      [userId],
    );
    return { ok: true };
  }

  @Get('kpi/summary')
  async kpiSummary() {
    const result = await this.db().query('select status, count(*)::int as count from requests group by status');
    return { data: result.rows };
  }

  @Get('kpi/daily')
  async kpiDaily() {
    const result = await this.db().query(
      `select date_trunc('day', created_at)::date as day,
              count(*)::int as total,
              count(*) filter (where status = 'PENDING')::int as pending,
              count(*) filter (where status = 'REQUESTED')::int as requested,
              count(*) filter (where status = 'DOCKED')::int as docked,
              count(*) filter (where status = 'CANCELLED')::int as cancelled,
              count(*) filter (where status = 'REJECTED')::int as rejected
       from requests
       where created_at >= current_date - interval '30 days'
       group by 1
       order by day asc`,
    );
    return { data: result.rows };
  }

  @Get('operations/outbox/status')
  async outboxStatus() {
    const result = await this.db().query(
      `select status, count(*)::int as count, min(created_at) as oldest_created_at
       from workflow_outbox
       group by status
       order by status`,
    );
    return { data: result.rows };
  }

  @Get('dispatch/intraday')
  async dispatch() {
    const result = await this.db().query("select * from requests where status not in ('CANCELLED', 'REJECTED') order by created_at desc limit 100");
    return { data: result.rows };
  }

  @Get('clusters')
  async clusters(@Query('search') search?: string) {
    if (!search || search.length < 3) return { data: [] };
    const term = `%${search.toLowerCase()}%`;
    const result = await this.db().query(
      `select id, cluster_name, hub_name, region, dock_number, backlogs, backlogs_ts
       from clusters where (lower(cluster_name) like $1 or lower(hub_name) like $1)
       and (active = true or active is null) order by cluster_name limit 12`,
      [term],
    );
    return { data: result.rows };
  }
}
