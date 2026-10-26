import { Controller, Get, Headers, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';

@Controller(['auth/seatalk', 'v1/auth/seatalk', 'integrations/seatalk', 'v1/integrations/seatalk'])
export class SeaTalkController {
  @Get('config')
  @UseGuards(SupabaseAuthGuard)
  config() {
    return { configured: Boolean(process.env.SEATALK_BASE_URL && process.env.SEATALK_APP_ID) };
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
  approve(@Req() request: Request, @Headers('authorization') authorization?: string, @Headers('date') date?: string, @Headers('x-seatalk-token') token?: string, @Headers('content-type') contentType?: string) {
    this.verifyApproval(request, authorization, date, token, contentType);
    return { ok: true };
  }

  @Post('approval/reject')
  @HttpCode(200)
  reject(@Req() request: Request, @Headers('authorization') authorization?: string, @Headers('date') date?: string, @Headers('x-seatalk-token') token?: string, @Headers('content-type') contentType?: string) {
    this.verifyApproval(request, authorization, date, token, contentType);
    return { ok: true };
  }

  private verifyEvent(request: Request, signature?: string) {
    const secret = process.env.SEATALK_APP_SECRET ?? '';
    const rawBody = JSON.stringify(request.body ?? {});
    const expected = createHash('sha256').update(rawBody + secret).digest('hex');
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new UnauthorizedException('Invalid SeaTalk signature.');
  }

  private verifyApproval(request: Request, authorization?: string, date?: string, token?: string, contentType?: string) {
    if (!authorization || !date || !token || !contentType) throw new UnauthorizedException('Invalid SeaTalk signature.');
    const secret = process.env.SEATALK_APP_SECRET ?? '';
    const target = request.originalUrl.split('?');
    const query = new URLSearchParams(target[1] ?? '');
    const canonicalQuery = [...query.entries()].sort().map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    const rawBody = JSON.stringify(request.body ?? {});
    const canonical = [request.method, target[0], contentType, createHash('md5').update(rawBody).digest('hex'), date, token, canonicalQuery].join('\n');
    const expected = Buffer.from(createHmac('sha1', secret).update(canonical).digest('base64'));
    const received = Buffer.from(authorization.trim());
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new UnauthorizedException('Invalid SeaTalk signature.');
  }
}
