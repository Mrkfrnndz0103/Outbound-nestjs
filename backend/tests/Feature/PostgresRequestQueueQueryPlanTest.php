<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use PDO;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class PostgresRequestQueueQueryPlanTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POSTGRES_TESTS') !== '1' || ! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('PostgreSQL integration tests are enabled only in the PostgreSQL CI job.');
        }

        config()->set('database.default', 'pgsql');
        $host = strtolower((string) config('database.connections.pgsql.host'));
        if (! in_array($host, ['127.0.0.1', 'localhost', '::1', 'postgres'], true)) {
            $this->markTestSkipped('PostgreSQL integration tests require a local or CI test database host.');
        }

        DB::purge('pgsql');
        DB::reconnect('pgsql');
        DB::statement('CREATE TEMPORARY TABLE requests (id UUID PRIMARY KEY, status TEXT NOT NULL, rejection_return_role TEXT NULL, created_at TIMESTAMPTZ NOT NULL)');
        DB::statement('CREATE INDEX requests_created_idx ON requests (created_at DESC, id DESC)');
    }

    protected function tearDown(): void
    {
        if (getenv('POSTGRES_TESTS') === '1' && in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            DB::purge('pgsql');
        }

        parent::tearDown();
    }

    public function test_bounded_queue_shape_uses_the_created_cursor_index(): void
    {
        $plan = DB::transaction(function (): string {
            DB::statement('SET LOCAL enable_seqscan = off');

            return implode("\n", array_map(
                static fn (object $row): string => (string) $row->{'QUERY PLAN'},
                DB::select("EXPLAIN (FORMAT TEXT) SELECT id FROM requests WHERE (status IN ('PENDING', 'REROUTED') OR (status = 'REJECTED' AND rejection_return_role = 'fte_ops')) ORDER BY created_at DESC, id DESC LIMIT 101"),
            ));
        });

        $this->assertStringContainsString('Limit', $plan);
        $this->assertStringContainsString('Index Scan using requests_created_idx', $plan);
        $this->assertStringNotContainsString('Seq Scan', $plan);
    }
}
