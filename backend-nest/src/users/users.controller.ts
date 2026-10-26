import { Controller, ForbiddenException, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DATABASE_POOL } from '../database/database.module.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import type { Pool } from 'pg';

@Controller(['users', 'v1/users'])
@UseGuards(SupabaseAuthGuard)
export class UsersController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  @Get()
  async list(@Req() request: Request & { user?: { app_metadata?: { role?: string }; role?: string } }) {
    const role = request.user?.app_metadata?.role ?? request.user?.role;
    if (role !== 'fte_ops' && role !== 'fte_mm') {
      throw new ForbiddenException('Only FTE users can manage users.');
    }
    if (!this.pool) return { data: [] };
    const result = await this.pool.query(
      'select id, name, role, email, ops_id, is_active, created_at from profiles order by name',
    );
    return { data: result.rows };
  }
}
