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
        const databaseHost = new URL(url).hostname;
        const isLocalDatabase = databaseHost === 'localhost' || databaseHost === '127.0.0.1';
        const useSsl = process.env.DATABASE_SSL
          ? process.env.DATABASE_SSL === 'true'
          : !isLocalDatabase;
        const pool = new Pool({
          connectionString: url,
          ssl: useSsl ? { rejectUnauthorized: false } : false,
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
