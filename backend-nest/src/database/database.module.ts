import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        return url
          ? new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 10_000 })
          : null;
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
