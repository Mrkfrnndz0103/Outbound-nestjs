import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';

@Controller(['dispatch', 'v1/dispatch'])
@UseGuards(SupabaseAuthGuard)
export class DispatchController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  @Get('intraday')
  async intraday(@Query('date') date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return { data: [] };
    if (!this.pool) throw new Error('Database is not configured.');
    const result = await this.pool.query(
      `select dispatch_date, hour, order_qty, synced_at from intraday_dispatch where dispatch_date = $1 order by hour`, [date]);
    const rows = new Map(result.rows.map((row) => [Number(row.hour), row]));
    const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
    return { data: hours.map((hour) => ({ date, hour, orderQty: Number(rows.get(hour)?.order_qty ?? 0), syncedAt: rows.get(hour)?.synced_at ?? null })) };
  }
}
