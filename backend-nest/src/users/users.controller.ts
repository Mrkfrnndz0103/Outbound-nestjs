import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { DATABASE_POOL } from '../database/database.module.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import type { Pool } from 'pg';

type ActorRequest = Request & { user?: { id?: string; app_metadata?: { role?: string }; role?: string } };

@Controller(['users', 'v1/users'])
@UseGuards(SupabaseAuthGuard)
export class UsersController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  @Get()
  async list(@Req() request: ActorRequest) {
    this.authorize(request);
    if (!this.pool) return { data: [] };
    const result = await this.pool.query(
      'select id, name, role, email, ops_id, is_active, created_at from profiles order by name',
    );
    return { data: result.rows };
  }

  @Post()
  async create(@Req() request: ActorRequest, @Body() body: Record<string, unknown>) {
    this.authorize(request);
    const name = this.string(body.name, 2, 120, 'name');
    const opsId = this.string(body.ops_id, 4, 40, 'ops_id').toLowerCase();
    const role = body.role === undefined ? 'ops_pic' : this.enumValue(body.role, ['ops_pic', 'doc_officer'], 'role');
    if (!/^ops[0-9]+$/i.test(opsId)) throw new BadRequestException('ops_id must match ops followed by digits.');
    if (!this.pool) return { id: null, name, ops_id: opsId, role, must_change_password: true };

    const existing = await this.pool.query('select 1 from profiles where lower(ops_id) = $1 limit 1', [opsId]);
    if (existing.rowCount) throw new BadRequestException('That Ops ID is already registered.');
    const initialPassword = this.initialPassword();
    const id = await this.createAuthUser(`${opsId}@backroom.soc5.internal`, initialPassword, opsId);
    try {
      const result = await this.pool.query(
        `insert into profiles (id, name, role, ops_id, is_active, must_change_password, created_at, updated_at)
         values ($1, $2, $3, $4, true, true, now(), now())
         returning id, name, role, ops_id, is_active, must_change_password`,
        [id, name, role, opsId],
      );
      return { ...result.rows[0], initial_password: initialPassword };
    } catch (error) {
      await this.deleteAuthUser(id);
      throw error;
    }
  }

  @Put(':id')
  async update(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    this.authorize(request);
    if (request.user?.id === id) throw new BadRequestException('You cannot change your own role.');
    const name = this.string(body.name, 2, 120, 'name');
    const role = this.enumValue(body.role, ['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer'], 'role');
    if (!this.pool) throw new NotFoundException('User not found.');
    const result = await this.pool.query(
      'update profiles set name = $1, role = $2, updated_at = now() where id = $3 returning *',
      [name, role, id],
    );
    if (!result.rowCount) throw new NotFoundException('User not found.');
    return result.rows[0];
  }

  @Patch(':id/disable')
  async disable(@Req() request: ActorRequest, @Param('id') id: string) {
    this.authorize(request);
    if (request.user?.id === id) throw new BadRequestException('You cannot disable your own account.');
    if (!this.pool) throw new NotFoundException('User not found.');
    const result = await this.pool.query(
      'update profiles set is_active = false, updated_at = now() where id = $1 returning id',
      [id],
    );
    if (!result.rowCount) throw new NotFoundException('User not found.');
    return { ok: true };
  }

  @Post(':id/reset-password')
  async resetPassword(@Req() request: ActorRequest, @Param('id') id: string) {
    this.authorize(request);
    if (!this.pool) throw new NotFoundException('Active Backroom user not found.');
    const password = this.initialPassword();
    const result = await this.pool.query(
      `update profiles set must_change_password = true, password_changed_at = null,
       password_reset_at = now(), updated_at = now()
       where id = $1 and role in ('ops_pic', 'doc_officer') and is_active = true returning id`,
      [id],
    );
    if (!result.rowCount) throw new NotFoundException('Active Backroom user not found.');
    try {
      await this.updateAuthPassword(id, password);
    } catch (error) {
      await this.pool.query(
        'update profiles set must_change_password = false, password_reset_at = null, updated_at = now() where id = $1',
        [id],
      );
      throw error;
    }
    return { ok: true, initial_password: password };
  }

  private async createAuthUser(email: string, password: string, opsId: string) {
    const response = await this.supabaseAdmin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { ops_id: opsId, account_type: 'backroom' } }),
    });
    const user = (await response.json()) as { id?: string };
    if (!user.id) throw new BadRequestException('Unable to create authentication account.');
    return user.id;
  }

  private async updateAuthPassword(id: string, password: string) {
    await this.supabaseAdmin(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  }

  private async deleteAuthUser(id: string) {
    try {
      await this.supabaseAdmin(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // The profile insert error is the primary failure; compensation is best effort.
    }
  }

  private async supabaseAdmin(path: string, init: RequestInit) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new BadRequestException('Authentication administration is not configured.');
    const response = await fetch(new URL(path, url), {
      ...init,
      headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new BadRequestException('Supabase authentication request failed.');
    return response;
  }

  private authorize(request: ActorRequest) {
    const role = request.user?.app_metadata?.role ?? request.user?.role;
    if (role !== 'fte_ops' && role !== 'fte_mm') {
      throw new ForbiddenException('Only FTE users can manage users.');
    }
  }

  private string(value: unknown, min: number, max: number, field: string) {
    if (typeof value !== 'string') throw new BadRequestException(`${field} is required.`);
    const normalized = value.trim();
    if (normalized.length < min || normalized.length > max) throw new BadRequestException(`${field} is invalid.`);
    return normalized;
  }

  private enumValue(value: unknown, allowed: string[], field: string) {
    if (typeof value !== 'string' || !allowed.includes(value)) throw new BadRequestException(`${field} is invalid.`);
    return value;
  }

  private initialPassword() {
    return randomBytes(15).toString('base64url');
  }
}
