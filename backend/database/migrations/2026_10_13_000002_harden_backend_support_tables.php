<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const TABLES = [
        'migrations',
        'idempotency_keys',
        'user_event_retries',
        'cache',
        'cache_locks',
        'jobs',
        'job_batches',
        'failed_jobs',
        'workflow_outbox',
    ];

    public function up(): void
    {
        $roles = DB::table('pg_roles')
            ->whereIn('rolname', ['anon', 'authenticated'])
            ->pluck('rolname')
            ->all();

        foreach (self::TABLES as $table) {
            if (! DB::table('information_schema.tables')
                ->where('table_schema', 'public')
                ->where('table_name', $table)
                ->exists()) {
                continue;
            }

            DB::statement("ALTER TABLE public.{$table} ENABLE ROW LEVEL SECURITY");
            DB::statement("REVOKE ALL PRIVILEGES ON TABLE public.{$table} FROM PUBLIC");

            foreach ($roles as $role) {
                DB::statement("REVOKE ALL PRIVILEGES ON TABLE public.{$table} FROM \"{$role}\"");
            }
        }
    }

    public function down(): void
    {
        // Keep this forward-only: restoring browser access would reintroduce the exposure.
    }
};
