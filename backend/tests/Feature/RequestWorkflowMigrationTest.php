<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class RequestWorkflowMigrationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POSTGRES_TESTS') !== '1' || ! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('Requires the isolated PostgreSQL test database.');
        }
        config()->set('database.default', 'pgsql');
        $host = strtolower((string) config('database.connections.pgsql.host'));
        if (! in_array($host, ['127.0.0.1', 'localhost', '::1', 'postgres'], true)) {
            $this->markTestSkipped('Workflow migrations may only be tested on a local or CI database.');
        }
        DB::purge('pgsql');
        DB::reconnect('pgsql');
        DB::unprepared(<<<'SQL'
            DROP TABLE IF EXISTS public.request_events;
            DROP TABLE IF EXISTS public.requests CASCADE;
            DROP TYPE IF EXISTS public.request_status;
            CREATE TYPE public.request_status AS ENUM ('PENDING', 'REQUESTED', 'CANCELLED', 'DOCKING', 'DOCKED', 'ASSIGNED', 'REROUTED');
            CREATE TABLE public.requests (id text PRIMARY KEY, status public.request_status NOT NULL);
            ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
            CREATE TABLE public.request_events (id int PRIMARY KEY, from_status public.request_status, to_status public.request_status, metadata jsonb);
            INSERT INTO public.requests VALUES ('cancelled', 'CANCELLED'), ('rerouted', 'REROUTED');
            INSERT INTO public.request_events VALUES (1, 'REQUESTED', 'CANCELLED', '{"reason":"historic decision"}');
            SQL);
    }

    protected function tearDown(): void
    {
        if (isset($this->app) && DB::connection()->getDriverName() === 'pgsql' && getenv('POSTGRES_TESTS') === '1') {
            $host = strtolower((string) config('database.connections.pgsql.host'));
            if (in_array($host, ['127.0.0.1', 'localhost', '::1', 'postgres'], true)) {
                DB::unprepared('DROP TABLE IF EXISTS public.request_events; DROP TABLE IF EXISTS public.requests CASCADE; DROP TYPE IF EXISTS public.request_status;');
            }
        }
        parent::tearDown();
    }

    public static function migrationSources(): array
    {
        return [['laravel'], ['supabase']];
    }

    #[DataProvider('migrationSources')]
    public function test_migration_is_repeatable_and_preserves_historical_states_and_rls(string $source): void
    {
        $this->migrate($source);
        $this->migrate($source);
        $this->assertDatabaseHas('requests', ['id' => 'cancelled', 'status' => 'CANCELLED', 'cancellation_remarks' => null]);
        $this->assertDatabaseHas('requests', ['id' => 'rerouted', 'status' => 'REROUTED', 'rejection_return_role' => null]);
        $this->assertSame('historic decision', json_decode(DB::table('request_events')->value('metadata'), true)['reason']);
        $this->assertTrue((bool) DB::selectOne("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.requests'::regclass")->relrowsecurity);

        DB::table('requests')->insert(['id' => 'new-rejection', 'status' => 'REJECTED', 'rejection_return_role' => 'fte_ops']);
        DB::table('request_events')->insert(['id' => 2, 'from_status' => 'REQUESTED', 'to_status' => 'REJECTED', 'metadata' => '{}']);
        $this->assertDatabaseHas('requests', ['id' => 'new-rejection', 'status' => 'REJECTED', 'rejection_return_role' => 'fte_ops']);
        $this->assertDatabaseHas('request_events', ['id' => 2, 'to_status' => 'REJECTED']);
    }

    #[DataProvider('migrationSources')]
    public function test_database_refuses_rejection_routing_to_doc_officer(string $source): void
    {
        $this->migrate($source);
        $this->expectException(QueryException::class);
        DB::table('requests')->insert(['id' => 'invalid', 'status' => 'REJECTED', 'rejection_return_role' => 'doc_officer']);
    }

    private function migrate(string $source): void
    {
        if ($source === 'laravel') {
            (require database_path('migrations/2026_10_13_000001_add_rejection_routing_to_requests.php'))->up();
        } else {
            DB::unprepared(file_get_contents(dirname(base_path()).'/supabase/migrations/20261013032010_linehaul_rejection_routing.sql'));
        }
    }
}
