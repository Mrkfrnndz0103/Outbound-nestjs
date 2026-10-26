import { Global, Logger, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) return null;

        const logger = new Logger('DatabasePool');
        const pool = new Pool({
          connectionString: url,
          max: 10,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 10_000,
        });
        pool.on('error', (error) => {
          logger.error(`Unexpected PostgreSQL pool error: ${error.message}`);
        });
        return pool;
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
