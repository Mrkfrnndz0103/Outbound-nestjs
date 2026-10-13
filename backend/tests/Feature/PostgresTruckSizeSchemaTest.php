<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use PDO;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class PostgresTruckSizeSchemaTest extends TestCase
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
            $this->markTestSkipped('Truck-size schema tests require a local or CI test database host.');
        }

        DB::purge('pgsql');
        DB::reconnect('pgsql');
        DB::unprepared(<<<'SQL'
            DROP TABLE IF EXISTS public.truck_size_schema_test;
            DROP TYPE IF EXISTS public.truck_size;
            CREATE TYPE public.truck_size AS ENUM ('4W', '6W', '10W', '6WF');
            CREATE TABLE public.truck_size_schema_test (truck_size public.truck_size NOT NULL);
            SQL);
    }

    protected function tearDown(): void
    {
        if (getenv('POSTGRES_TESTS') === '1' && in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            DB::unprepared('DROP TABLE IF EXISTS public.truck_size_schema_test; DROP TYPE IF EXISTS public.truck_size;');
        }

        parent::tearDown();
    }

    public function test_truck_size_migration_adds_all_supported_sizes(): void
    {
        DB::unprepared(file_get_contents(dirname(base_path()).'/supabase/migrations/20261013050000_add_truck_size_enum_values.sql'));

        $values = DB::select("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE pg_type.typname = 'truck_size' ORDER BY enumsortorder");

        $this->assertSame(['4W', '6W', '10W', '6WF', '4WAUV', '4WCV'], array_map(
            static fn (object $value): string => $value->enumlabel,
            $values,
        ));

        DB::table('truck_size_schema_test')->insert([
            ['truck_size' => '4W'],
            ['truck_size' => '4WAUV'],
            ['truck_size' => '4WCV'],
            ['truck_size' => '6W'],
            ['truck_size' => '10W'],
            ['truck_size' => '6WF'],
        ]);

        $this->assertSame(6, DB::table('truck_size_schema_test')->count());
    }
}
