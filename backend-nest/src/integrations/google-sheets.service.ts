import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { google } from 'googleapis';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import { Inject } from '@nestjs/common';

type ImportRow = {
  sourceId: string;
  name: string;
  role: 'ops_pic' | 'fte_ops' | 'fte_mm' | 'doc_officer';
  email: string | null;
  opsId: string | null;
  seatalkEmployeeCode: string | null;
};

@Injectable()
export class GoogleSheetsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(GoogleSheetsService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  onModuleInit(): void {
    if (process.env.GOOGLE_USER_IMPORTS_SYNC_ENABLED !== 'true') return;
    const intervalMs = Math.max(60_000, Number(process.env.GOOGLE_USER_IMPORTS_SYNC_INTERVAL_MS ?? 900_000));
    void this.runScheduledSync();
    this.timer = setInterval(() => void this.runScheduledSync(), intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runScheduledSync(): Promise<void> {
    if (this.running || !this.isConfigured()) return;
    this.running = true;
    try { await this.syncUserImports(); }
    catch (error) { this.logger.error(`Google Sheet sync failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
    finally { this.running = false; }
  }

  isConfigured(): boolean {
    return process.env.GOOGLE_USER_IMPORTS_SYNC_ENABLED === 'true' && Boolean(
      process.env.GOOGLE_USER_IMPORTS_SPREADSHEET_ID &&
      (process.env.GOOGLE_SHEETS_CREDENTIALS_JSON || process.env.GOOGLE_SHEETS_CREDENTIALS_PATH),
    );
  }

  async syncUserImports(): Promise<{ rows: number; inactive: number }> {
    if (!this.pool) throw new Error('DATABASE_URL is not configured.');
    if (!this.isConfigured()) throw new Error('Google user-import sync is not configured.');

    const auth = new google.auth.GoogleAuth({
      credentials: await this.credentials(),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_USER_IMPORTS_SPREADSHEET_ID!;
    const range = `${this.quoteSheetName(process.env.GOOGLE_USER_IMPORTS_SHEET_NAME || 'user')}!A:Z`;
    const values = (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? [];
    const maxRows = Math.max(1, Number(process.env.GOOGLE_USER_IMPORTS_MAX_ROWS ?? 5000));
    if (values.length > maxRows + 1) throw new Error(`Google Sheet exceeds GOOGLE_USER_IMPORTS_MAX_ROWS (${maxRows}).`);
    if (values.length === 0) throw new Error('Google Sheet is empty; refusing to deactivate imports.');

    const headers = values[0].map((value) => this.normalize(String(value)));
    const rows = values.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));
    const imported = rows.map((row, index) => this.parseRow(headers, row, index + 2));
    if (imported.length === 0) throw new Error('Google Sheet contains no user rows; refusing to deactivate imports.');
    const sourceIds = new Set<string>();
    const employeeCodes = new Set<string>();
    for (const row of imported) {
      if (sourceIds.has(row.sourceId)) throw new Error(`Duplicate role identity at source row ${row.sourceId}.`);
      sourceIds.add(row.sourceId);
      if (row.seatalkEmployeeCode && employeeCodes.has(row.seatalkEmployeeCode)) throw new Error(`Duplicate SeaTalk employee code at source row ${row.sourceId}.`);
      if (row.seatalkEmployeeCode) employeeCodes.add(row.seatalkEmployeeCode);
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      for (const row of imported) {
        await client.query(
          `insert into user_imports (source_id, name, role, email, ops_id, seatalk_employee_code, is_active, imported_at)
           values ($1, $2, $3::user_role, $4, $5, $6, true, now())
           on conflict (source_id) do update set name = excluded.name, role = excluded.role, email = excluded.email,
             ops_id = excluded.ops_id, seatalk_employee_code = excluded.seatalk_employee_code, is_active = true, imported_at = now()`,
          [row.sourceId, row.name, row.role, row.email, row.opsId, row.seatalkEmployeeCode],
        );
      }
      const roles = [...new Set(imported.map((row) => row.role))];
      const result = await client.query(
        `update user_imports set is_active = false, imported_at = now()
         where is_active and role = any($1::user_role[]) and not (source_id = any($2::text[]))`,
        [roles, [...sourceIds]],
      );
      await client.query('commit');
      this.logger.log(`Synchronized ${imported.length} Google Sheet user imports; deactivated ${result.rowCount ?? 0}.`);
      return { rows: imported.length, inactive: result.rowCount ?? 0 };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async credentials(): Promise<Record<string, unknown>> {
    const json = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
    const source = json ?? (process.env.GOOGLE_SHEETS_CREDENTIALS_PATH
      ? await readFile(process.env.GOOGLE_SHEETS_CREDENTIALS_PATH, 'utf8')
      : undefined);
    if (!source) throw new Error('Google Sheets credentials are not configured.');
    try { return JSON.parse(source) as Record<string, unknown>; }
    catch { throw new Error('Google Sheets credentials are not valid JSON.'); }
  }

  private parseRow(headers: string[], values: unknown[], rowNumber: number): ImportRow {
    const value = (names: string[]) => {
      const index = names.map((name) => headers.indexOf(name)).find((index) => index >= 0);
      return index === undefined ? '' : String(values[index] ?? '').trim();
    };
    const role = value(['role', 'user_role']) as ImportRow['role'];
    if (!['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer'].includes(role)) throw new Error(`Unsupported role at sheet row ${rowNumber}.`);
    const name = value(['name', 'full_name', 'employee_name']);
    const email = value(['email', 'work_email']).toLowerCase() || null;
    const opsId = value(['ops_id', 'opsid', 'ops_id_number']) || null;
    const seatalkEmployeeCode = value(['seatalk_employee_code', 'employee_code', 'seatalk_code']) || null;
    if (!name) throw new Error(`Missing name at sheet row ${rowNumber}.`);
    if (role === 'ops_pic' ? !opsId : !email) throw new Error(`Missing ${role === 'ops_pic' ? 'ops_id' : 'email'} at sheet row ${rowNumber}.`);
    const identity = role === 'ops_pic' ? opsId! : email!;
    return { sourceId: `${role}:${identity}`, name, role, email: role === 'ops_pic' ? null : email, opsId: role === 'ops_pic' ? opsId : null, seatalkEmployeeCode };
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  private quoteSheetName(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
