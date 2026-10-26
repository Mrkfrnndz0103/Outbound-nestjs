import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';

@Controller(['health', 'up'])
export class HealthController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  @Get()
  getHealth() {
    return { status: 'ok', service: 'backend-nest', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async getReadiness() {
    if (!this.pool) throw new ServiceUnavailableException('Database is not configured.');
    try {
      await this.pool.query('select 1');
    } catch {
      throw new ServiceUnavailableException('Database is unavailable.');
    }
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length) throw new ServiceUnavailableException(`Missing runtime configuration: ${missing.join(', ')}.`);
    return { status: 'ready', service: 'backend-nest', timestamp: new Date().toISOString() };
  }
}
