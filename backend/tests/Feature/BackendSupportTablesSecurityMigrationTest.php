<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use PDO;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class BackendSupportTablesSecurityMigrationTest extends TestCase
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

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POSTGRES_TESTS') !== '1' || ! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('Requires the isolated PostgreSQL test database.');
        }

        config()->set('database.default', 'pgsql');
        $host = strtolower((string) config('database.connections.pgsql.host'));
        if (! in_array($host, ['127.0.0.1', 'localhost', '::1', 'postgres'], true)) {
            $this->markTestSkipped('Security migrations may only be tested on a local or CI database.');
        }

        DB::purge('pgsql');
        DB::reconnect('pgsql');
    }

    public function test_migration_enables_rls_and_removes_browser_role_privileges(): void
    {
        $missing = array_filter(self::TABLES, fn (string $table): bool => ! DB::getSchemaBuilder()->hasTable($table));
        if ($missing !== []) {
            $this->markTestSkipped('Requires migrated backend support tables: '.implode(', ', $missing));
        }

        (require database_path('migrations/2026_10_13_000002_harden_backend_support_tables.php'))->up();

        foreach (self::TABLES as $table) {
            $this->assertTrue(
                (bool) DB::selectOne('SELECT relrowsecurity FROM pg_class WHERE oid = ?::regclass', ['public.'.$table])->relrowsecurity,
                "Expected RLS on public.{$table}.",
            );

            if (DB::table('pg_roles')->whereIn('rolname', ['anon', 'authenticated'])->count() === 2) {
                foreach (['anon', 'authenticated'] as $role) {
                    foreach (['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as $privilege) {
                        $this->assertFalse(
                            DB::selectOne('SELECT has_table_privilege(?, ?, ?) AS allowed', [$role, 'public.'.$table, $privilege])->allowed,
                            "Expected {$role} to lack {$privilege} on public.{$table}.",
                        );
                    }
                }
            }
        }
    }
}
