import { Body, Controller, Get, Inject, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import { SupabaseAuthGuard } from './supabase-auth.guard.js';

class BackroomLoginDto {
  @IsString()
  @MaxLength(40)
  @Matches(/^ops[0-9]+$/i)
  ops_id!: string;

  @IsString()
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsIn(['first-login', 'normal'])
  mode?: 'first-login' | 'normal';
}

class ChangePasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password!: string;
}

interface AuthenticatedRequest extends Request {
  user?: { sub?: string; [key: string]: unknown };
}

@Controller(['auth', 'v1/auth'])
export class AuthController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  @Get('status')
  getStatus() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new ServiceUnavailableException('Authentication service is not configured.');
    }
    return { configured: true };
  }

  @Post('backroom/login')
  async login(@Body() body: BackroomLoginDto) {
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!baseUrl || !anonKey || !this.pool) throw new ServiceUnavailableException('Backroom login is not configured.');
    const opsId = body.ops_id.trim().toLowerCase();
    const profile = await this.pool.query(
      `select id, must_change_password from profiles
       where lower(ops_id) = $1 and role in ('ops_pic', 'doc_officer') and is_active = true limit 1`,
      [opsId],
    );
    if (profile.rowCount === 0 || (body.mode === 'first-login' && !profile.rows[0].must_change_password)) {
      throw new UnauthorizedException('Invalid Ops ID or password.');
    }
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${opsId}@backroom.soc5.internal`, password: body.password }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new UnauthorizedException('Invalid Ops ID or password.');
    return response.json();
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    if (!request.user?.sub) throw new UnauthorizedException('A valid Supabase session is required.');
    return request.user;
  }

  @Post('password-changed')
  @UseGuards(SupabaseAuthGuard)
  async changePassword(@Req() request: AuthenticatedRequest, @Body() body: ChangePasswordDto) {
    const userId = request.user?.sub;
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const authorization = request.header('authorization');
    if (!userId || !baseUrl || !anonKey || !authorization || !this.pool) {
      throw new ServiceUnavailableException('Password change is not configured.');
    }
    const profile = await this.pool.query(
      `select id from profiles where id = $1 and role in ('ops_pic', 'doc_officer')
       and is_active = true and must_change_password = true and password_reset_at is not null limit 1`,
      [userId],
    );
    if (profile.rowCount === 0) throw new UnauthorizedException('Password change is not required.');
    const response = await fetch(`${baseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: anonKey, authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ password: body.password }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ServiceUnavailableException('Unable to change the Backroom password.');
    await this.pool.query(
      `update profiles set must_change_password = false, password_changed_at = now(), updated_at = now()
       where id = $1 and must_change_password = true`,
      [userId],
    );
    return { ok: true };
  }
}
