import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Request } from 'express';

type Actor = JWTPayload & { role?: string; user_metadata?: { role?: string } };

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private jwksUrl?: string;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: Actor }>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    if (!token || !baseUrl) throw new UnauthorizedException('A valid Supabase session is required.');

    const jwksUrl = `${baseUrl}/auth/v1/.well-known/jwks.json`;
    if (!this.jwks || this.jwksUrl !== jwksUrl) {
      this.jwks = createRemoteJWKSet(new URL(jwksUrl));
      this.jwksUrl = jwksUrl;
    }
    try {
      const verified = await jwtVerify(token, this.jwks, { issuer: `${baseUrl}/auth/v1`, audience: 'authenticated' });
      request.user = verified.payload as Actor;
      return true;
    } catch {
      throw new UnauthorizedException('A valid Supabase session is required.');
    }
  }
}
