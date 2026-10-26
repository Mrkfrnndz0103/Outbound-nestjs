import { Controller, Get, Headers, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { Inject } from '@nestjs/common';
import { DATABASE_POOL } from '../database/database.module.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { SeaTalkApprovalService } from './seatalk-approval.service.js';

type RequestWithRawBody = Request & { rawBody?: Buffer };

@Controller(['auth/seatalk', 'v1/auth/seatalk', 'integrations/seatalk', 'v1/integrations/seatalk'])
export class SeaTalkController {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool | null,
    private readonly approvals: SeaTalkApprovalService,
  ) {}

  @Get('login')
  login(@Res() response: Response) {
    const appId = process.env.SEATALK_APP_ID;
    const redirectUri = process.env.SEATALK_REDIRECT_URI;
    if (!appId || !redirectUri) throw new ServiceUnavailableException('SeaTalk login is not configured.');
    const state = randomBytes(32).toString('base64url');
    const cookie = `seatalk_oauth_state=${state}; Max-Age=600; Path=/auth/seatalk; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
    response.setHeader('set-cookie', cookie);
    const url = new URL(process.env.SEATALK_AUTHORIZE_URL ?? 'https://openapi.seatalk.io/open_login/qrlogin');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('app_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return response.redirect(url.toString());
  }

  @Get('callback')
  async callback(@Req() request: Request, @Res() response: Response) {
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    const state = typeof request.query.state === 'string' ? request.query.state : '';
    const expectedState = request.headers.cookie?.match(/(?:^|;\\s*)seatalk_oauth_state=([^;]+)/)?.[1] ?? '';
    if (!code || !state || !expectedState || state.length !== expectedState.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
      throw new BadRequestException('Invalid SeaTalk OAuth callback.');
    }
    const tokenUrl = process.env.SEATALK_TOKEN_URL;
    const userUrl = process.env.SEATALK_USER_URL;
    const appId = process.env.SEATALK_APP_ID;
    const appSecret = process.env.SEATALK_APP_SECRET;
    const redirectUri = process.env.SEATALK_REDIRECT_URI;
    if (!tokenUrl || !userUrl || !appId || !appSecret || !redirectUri || !this.pool) {
      throw new ServiceUnavailableException('SeaTalk login is not configured.');
    }
    const tokenResponse = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret }), signal: AbortSignal.timeout(10000) });
    if (!tokenResponse.ok) throw new UnauthorizedException('SeaTalk login failed.');
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new UnauthorizedException('SeaTalk login failed.');
    const userResponse = await fetch(userUrl, { method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ code, redirect_uri: redirectUri }), signal: AbortSignal.timeout(10000) });
    if (!userResponse.ok) throw new UnauthorizedException('SeaTalk identity lookup failed.');
    const identity = (await userResponse.json()) as { email?: string; data?: { email?: string } };
    const email = (identity.email ?? identity.data?.email ?? '').trim().toLowerCase();
    if (!email) throw new UnauthorizedException('SeaTalk did not return an email address.');
    const profile = await this.pool.query('select id from profiles where lower(email) = $1 and is_active = true limit 1', [email]);
    if (!profile.rowCount) throw new UnauthorizedException('This SeaTalk account is not authorized.');
    response.setHeader('set-cookie', 'seatalk_oauth_state=; Max-Age=0; Path=/auth/seatalk; HttpOnly; SameSite=Lax');
    const target = new URL(process.env.SEATALK_SUCCESS_REDIRECT ?? '/', process.env.APP_URL ?? redirectUri);
    target.searchParams.set('seatalk', 'success');
    return response.redirect(target.toString());
  }

  @Get('config')
  @UseGuards(SupabaseAuthGuard)
  config() {
    return {
      appId: process.env.SEATALK_APP_ID ?? null,
      callbackUrl: process.env.SEATALK_CALLBACK_URL ?? null,
      configured: Boolean(process.env.SEATALK_APP_ID && process.env.SEATALK_APP_SECRET),
      approvalConfigured: this.approvals.configured(),
      approvalEnabled: this.approvals.enabled(),
    };
  }

  @Post('logout')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(204)
  logout() {}

  @Post('events')
  @HttpCode(200)
  events(@Req() request: Request, @Headers('x-seatalk-signature') signature?: string) {
    this.verifyEvent(request, signature);
    return { ok: true };
  }

  @Post('approval/approve')
  @HttpCode(200)
  async approve(@Req() request: RequestWithRawBody, @Headers('authorization') authorization?: string, @Headers('date') date?: string, @Headers('content-type') contentType?: string) {
    const token = this.approvalToken(request);
    const rawBody = this.verifyApproval(request, authorization, date, token, contentType);
    await this.approvals.handleCallback('approve', request.body as Record<string, unknown>, rawBody, token!);
    return { code: 0 };
  }

  @Post('approval/reject')
  @HttpCode(200)
  async reject(@Req() request: RequestWithRawBody, @Headers('authorization') authorization?: string, @Headers('date') date?: string, @Headers('content-type') contentType?: string) {
    const token = this.approvalToken(request);
    const rawBody = this.verifyApproval(request, authorization, date, token, contentType);
    await this.approvals.handleCallback('reject', request.body as Record<string, unknown>, rawBody, token!);
    return { code: 0 };
  }

  private verifyEvent(request: RequestWithRawBody, signature?: string) {
    const secret = process.env.SEATALK_APP_SECRET ?? '';
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const expected = createHash('sha256').update(rawBody).update(secret).digest('hex');
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new UnauthorizedException('Invalid SeaTalk signature.');
  }

  private approvalToken(request: Request) {
    const value = request.headers['x-token'] ?? request.headers['x-seatalk-token'];
    return Array.isArray(value) ? value[0] : value;
  }

  private verifyApproval(request: RequestWithRawBody, authorization?: string, date?: string, token?: string, contentType?: string) {
    if (!authorization || !date || !token || !contentType) throw new UnauthorizedException('Invalid SeaTalk signature.');
    const secret = process.env.SEATALK_CALLBACK_SIGNING_SECRET ?? '';
    if (!secret) throw new UnauthorizedException('SeaTalk callback verification is not configured.');
    const target = request.originalUrl.split('?');
    const query = new URLSearchParams(target[1] ?? '');
    const canonicalQuery = [...query.entries()].sort().map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const canonical = [request.method, target[0], contentType, createHash('md5').update(rawBody).digest('hex'), date, token, canonicalQuery].join('\n');
    const expected = Buffer.from(createHmac('sha1', secret).update(canonical).digest('base64'));
    const received = Buffer.from(authorization.trim());
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new UnauthorizedException('Invalid SeaTalk signature.');
    return rawBody;
  }
}
