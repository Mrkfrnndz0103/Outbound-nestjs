import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import type { CreateRequestDto, ListRequestsQuery, RequestActionDto } from './request.dto.js';

@Injectable()
export class RequestService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  private database(): Pool {
    if (!this.pool) throw new ServiceUnavailableException('Database is not configured.');
    return this.pool;
  }

  async list(query: ListRequestsQuery) {
    const values: string[] = [];
    const predicates: string[] = [];
    if (query.status) {
      values.push(query.status);
      predicates.push(`status = $${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search.toLowerCase()}%`);
      predicates.push(`(lower(cluster) like $${values.length} or lower(region) like $${values.length})`);
    }
    const where = predicates.length ? `where ${predicates.join(' and ')}` : '';
    const result = await this.database().query(
      `select * from requests ${where} order by created_at desc limit 100`,
      values,
    );
    return { data: result.rows };
  }

  async get(id: string) {
    const result = await this.database().query('select * from requests where id = $1', [id]);
    if (!result.rows[0]) return null;
    return result.rows[0];
  }

  async create(input: CreateRequestDto, actorId: string) {
    const result = await this.database().query(
      `insert into requests (cluster, region, truck_type, truck_size, dock_no, created_by, status)
       values ($1, $2, $3, $4, $5, $6, 'PENDING') returning *`,
      [input.cluster, input.region, input.truckType, input.truckSize ?? null, input.dockNo ?? null, actorId],
    );
    return result.rows[0];
  }

  async action(id: string, action: string, input: RequestActionDto, actorId: string) {
    if (action === 'cancel') {
      const client = await this.database().connect();
      try {
        await client.query('begin');
        const result = await client.query(
          `update requests
           set status = 'CANCELLED', cancellation_remarks = $2, updated_by = $3
           where id = $1 and status not in ('CANCELLED', 'REJECTED')
           returning *`,
          [id, input.rejectionRemarks ?? null, actorId],
        );
        if (result.rows[0]) {
          await client.query(
            `insert into request_events (request_id, event_type, actor_id, metadata)
             values ($1, 'CANCELLED', $2, $3::jsonb)`,
            [id, actorId, JSON.stringify({ remarks: input.rejectionRemarks ?? null })],
          );
        }
        await client.query('commit');
        return result.rows[0] ?? null;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
    throw new ServiceUnavailableException('Request workflow action is not migrated yet.');
  }
}
