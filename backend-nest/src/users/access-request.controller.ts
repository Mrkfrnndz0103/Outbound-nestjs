import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';

class AccessRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(40)
  @Matches(/^ops[0-9]+$/i)
  ops_id!: string;
}

@Controller(['access-requests', 'v1/access-requests'])
export class AccessRequestController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: AccessRequestDto) {
    if (!this.pool) throw new Error('Database is not configured.');
    const name = body.name.trim();
    const opsId = body.ops_id.trim().toLowerCase();
    const text = `${name} requested Backroom access with Ops ID ${opsId}. Create the account from User Management after verification.`;
    await this.pool.query(
      `insert into notifications (target_role, event_type, title, body)
       values ('fte_ops', 'BACKROOM_ACCESS_REQUESTED', 'Backroom access requested', $1),
              ('fte_mm', 'BACKROOM_ACCESS_REQUESTED', 'Backroom access requested', $1)`,
      [text],
    );
    return { ok: true };
  }
}
