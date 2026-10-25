import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';

const operationalRoles = new Set(['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer']);

@Controller(['kpi', 'v1/kpi'])
@UseGuards(SupabaseAuthGuard)
export class KpiController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  private database(): Pool {
    if (!this.pool) throw new Error('Database is not configured.');
    return this.pool;
  }

  private range(query: { date_from?: string; date_to?: string }, days: number) {
    const to = query.date_to ?? new Date().toISOString().slice(0, 10);
    const from = query.date_from ?? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return { from, to };
  }

  @Get('summary')
  async summary(@Query() query: { date_from?: string; date_to?: string }) {
    const { from, to } = this.range(query, 30);
    const result = await this.database().query(
      `select count(*)::int as total,
              count(*) filter (where status = 'DOCKED')::int as confirmed,
              count(*) filter (where status = 'CANCELLED')::int as cancelled,
              coalesce(avg(extract(epoch from (approved_at - request_timestamp)) / 60) filter (where approved_at is not null), 0) as "averageApprovalMinutes"
       from requests where request_timestamp >= $1::date and request_timestamp < ($2::date + interval '1 day')`, [from, to]);
    return result.rows[0] ?? {};
  }

  @Get('daily')
  async daily(@Query() query: { date_from?: string; date_to?: string }) {
    const { from, to } = this.range(query, 29);
    const result = await this.database().query(
      `select (request_timestamp at time zone 'Asia/Manila')::date as date,
              count(*)::int as total,
              count(*) filter (where status = 'DOCKED')::int as confirmed
       from requests where request_timestamp >= $1::date and request_timestamp < ($2::date + interval '1 day')
       group by 1 order by 1`, [from, to]);
    return { data: result.rows };
  }

  protected hasOperationalRole(role?: string) { return operationalRoles.has(role ?? ''); }
}
