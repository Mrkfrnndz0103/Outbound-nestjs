import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

@Controller(['auth', 'v1/auth'])
export class AuthController {
  @Get('status')
  getStatus() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new ServiceUnavailableException('Authentication service is not configured.');
    }

    return { configured: true };
  }
}
