import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { SupabaseAuthGuard } from './supabase-auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthGuard],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
