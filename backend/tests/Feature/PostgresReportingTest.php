<?php

namespace Tests\Feature;

use App\Features\Kpi\KpiController;
use App\Features\Requests\RequestAuthorizer;
use App\Features\Requests\RequestRepository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PDO;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class PostgresReportingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POSTGRES_TESTS') !== '1' || ! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('PostgreSQL integration tests are enabled only in the PostgreSQL CI job.');
        }

        config()->set('app.business_timezone', 'Asia/Manila');
        config()->set('database.default', 'pgsql');
        $pgsqlHost = strtolower((string) config('database.connections.pgsql.host'));
        if (! in_array($pgsqlHost, ['127.0.0.1', 'localhost', '::1', 'postgres'], true)) {
            $this->markTestSkipped('PostgreSQL integration tests require a local or CI test database host.');
        }

        DB::purge('pgsql');
        DB::reconnect('pgsql');
        DB::statement('CREATE TEMPORARY TABLE profiles (id UUID PRIMARY KEY, name TEXT)');
        DB::statement('CREATE TEMPORARY TABLE requests (
            id UUID PRIMARY KEY,
            request_timestamp TIMESTAMPTZ NOT NULL,
            cluster TEXT NOT NULL,
            region TEXT NOT NULL,
            dock_no TEXT NOT NULL,
            backlogs INTEGER NOT NULL,
            backlogs_timestamp TIMESTAMPTZ NULL,
            ob_fte TEXT NULL,
            truck_size TEXT NOT NULL,
            truck_type TEXT NOT NULL,
            plate_number TEXT NULL,
            provide_time TIMESTAMPTZ NULL,
            linehaul_trip_no TEXT NULL,
            docked_time TIMESTAMPTZ NULL,
            status TEXT NOT NULL,
            rejection_remarks TEXT NULL,
            driver_id TEXT NULL,
            created_by UUID NOT NULL,
            approved_at TIMESTAMPTZ NULL,
            rejected_at TIMESTAMPTZ NULL,
            confirmed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NULL,
            updated_at TIMESTAMPTZ NULL
        )');
    }

    protected function tearDown(): void
    {
        if (getenv('POSTGRES_TESTS') === '1' && in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            DB::purge('pgsql');
        }

        parent::tearDown();
    }

    public function test_daily_reporting_uses_manila_calendar_boundaries(): void
    {
        DB::table('requests')->insert([
            [
                'id' => '00000000-0000-0000-0000-000000000001',
                'request_timestamp' => '2026-09-18 15:59:59+00',
                'cluster' => 'SOC 5',
                'region' => 'NCR',
                'dock_no' => 'D-01',
                'backlogs' => 0,
                'truck_size' => '4W',
                'truck_type' => 'Closed Van',
                'status' => 'DOCKED',
                'created_by' => '00000000-0000-0000-0000-000000000099',
            ],
            [
                'id' => '00000000-0000-0000-0000-000000000002',
                'request_timestamp' => '2026-09-18 16:00:00+00',
                'cluster' => 'SOC 5',
                'region' => 'NCR',
                'dock_no' => 'D-02',
                'backlogs' => 0,
                'truck_size' => '4W',
                'truck_type' => 'Closed Van',
                'status' => 'DOCKED',
                'created_by' => '00000000-0000-0000-0000-000000000099',
            ],
        ]);

        $request = Request::create('/api/kpi/daily', 'GET', ['date_from' => '2026-09-19', 'date_to' => '2026-09-19']);
        $request->attributes->set('actor', (object) ['role' => 'fte_ops']);
        $response = (new KpiController)->daily($request)->getData(true);

        $this->assertCount(1, $response['data']);
        $this->assertSame('2026-09-19', $response['data'][0]['date']);
        $this->assertSame(1, (int) $response['data'][0]['total']);
    }

    public function test_all_roles_can_view_kpi_reporting(): void
    {
        foreach (['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer'] as $role) {
            $request = Request::create('/api/kpi/daily', 'GET', [
                'date_from' => '2026-09-19',
                'date_to' => '2026-09-19',
            ]);
            $request->attributes->set('actor', (object) ['role' => $role]);

            $response = (new KpiController)->daily($request);

            $this->assertSame(200, $response->getStatusCode(), "KPI access denied for {$role}.");
        }
    }

    public function test_request_date_filter_keeps_timestamp_predicate_indexable(): void
    {
        $queries = [];
        DB::listen(static function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        $repository = new RequestRepository(new RequestAuthorizer);
        $repository->paginate((object) ['role' => 'fte_mm'], [
            'date_from' => '2026-09-19',
            'date_to' => '2026-09-19',
            'per_page' => 20,
        ]);

        $requestQuery = collect($queries)->first(fn (string $sql): bool => str_contains($sql, 'from "requests"'));
        $this->assertNotNull($requestQuery);
        $this->assertStringNotContainsString('AT TIME ZONE', $requestQuery);
        $this->assertStringContainsString('request_timestamp', $requestQuery);
    }
}
