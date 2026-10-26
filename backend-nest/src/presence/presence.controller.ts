import { Controller, ForbiddenException, HttpException, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { UseGuards } from '@nestjs/common';

type AuthenticatedRequest = Request & { user?: { sub?: string; role?: string; app_metadata?: { role?: string } } };

@Controller(['presence', 'v1/presence'])
@UseGuards(SupabaseAuthGuard)
export class PresenceController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  @Post('heartbeat')
  async heartbeat(@Req() request: AuthenticatedRequest) {
    const user = request.user;
    const role = user?.role ?? user?.app_metadata?.role;
    if (!user?.sub || role !== 'fte_ops') throw new ForbiddenException('Only FTE Ops users can send approval presence heartbeats.');
    if (!this.pool) throw new HttpException('Database is not configured.', 503);

    const result = await this.pool.query(
      'UPDATE profiles SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING last_seen_at',
      [user.sub],
    );
    if (result.rowCount !== 1) throw new HttpException('Profile not found.', 404);

    return {
      ok: true,
      last_seen_at: new Date(result.rows[0].last_seen_at).toISOString(),
      active_for_seconds: Number(process.env.SEATALK_PRESENCE_ACTIVE_SECONDS ?? 60),
    };
  }
}
