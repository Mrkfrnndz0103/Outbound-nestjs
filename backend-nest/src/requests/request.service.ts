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

  async events(id: string) {
    const result = await this.database().query(
      'select * from request_events where request_id = $1 order by created_at asc',
      [id],
    );
    return { data: result.rows };
  }

  async update(id: string, input: CreateRequestDto, actorId: string) {
    const result = await this.database().query(
      `update requests
       set cluster = $1, region = $2, truck_type = $3, truck_size = $4, dock_no = $5, updated_by = $6
       where id = $7 and status not in ('CANCELLED', 'REJECTED')
       returning *`,
      [input.cluster, input.region, input.truckType, input.truckSize ?? null, input.dockNo ?? null, actorId, id],
    );
    return result.rows[0] ?? null;
  }

  async action(id: string, action: string, input: RequestActionDto, actorId: string) {
    const transitions: Record<string, { status: string; event: string; extra: string }> = {
      approve: { status: 'REQUESTED', event: 'APPROVED', extra: '' },
      'reject-ops': { status: 'REJECTED', event: 'REJECTED_OPS', extra: 'rejection_remarks = $2,' },
      cancel: { status: 'CANCELLED', event: 'CANCELLED', extra: 'cancellation_remarks = $2,' },
      'reject-mm': { status: 'REJECTED', event: 'REJECTED_MM', extra: 'rejection_remarks = $2,' },
      'assign-truck': { status: 'REQUESTED', event: 'TRUCK_ASSIGNED', extra: 'plate_number = $2,' },
      'mark-docked': { status: 'DOCKED', event: 'MARKED_DOCKED', extra: '' },
      'reassign-driver': { status: 'REQUESTED', event: 'DRIVER_REASSIGNED', extra: 'driver_id = $2,' },
    };
    const transition = transitions[action];
    if (!transition) throw new ServiceUnavailableException('Request workflow action is not supported.');

    const client = await this.database().connect();
    try {
      await client.query('begin');
      const value = action === 'assign-truck' ? input.plateNumber : action === 'reassign-driver' ? input.driverId : input.rejectionRemarks;
      const result = transition.extra
        ? await client.query(
            `update requests set status = $1, ${transition.extra} updated_by = $3 where id = $4 and status not in ('CANCELLED', 'REJECTED') returning *`,
            [transition.status, value ?? null, actorId, id],
          )
        : await client.query(
            `update requests set status = $1, updated_by = $2 where id = $3 and status not in ('CANCELLED', 'REJECTED') returning *`,
            [transition.status, actorId, id],
          );
      if (result.rows[0]) {
        await client.query(
          `insert into request_events (request_id, event_type, actor_id, metadata) values ($1, $2, $3, $4::jsonb)`,
          [id, transition.event, actorId, JSON.stringify({ value: value ?? null })],
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
}
