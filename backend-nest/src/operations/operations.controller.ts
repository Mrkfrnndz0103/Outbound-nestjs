import { Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
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
  async notifications() {
    const result = await this.db().query('select * from notifications order by created_at desc limit 100');
    return { data: result.rows };
  }

  @Patch('notifications/read-all')
  async readAll() {
    await this.db().query('update notifications set read_at = coalesce(read_at, now()) where read_at is null');
    return { ok: true };
  }

  @Get('kpi/summary')
  async kpiSummary() {
    const result = await this.db().query('select status, count(*)::int as count from requests group by status');
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
