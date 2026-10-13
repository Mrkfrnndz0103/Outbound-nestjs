<?php

namespace Tests\Feature;

use App\Features\Outbox\WorkflowOutboxRepository;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use PDO;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class PostgresWorkflowOutboxTest extends TestCase
{
    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POSTGRES_TESTS') !== '1' || ! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('Requires the isolated PostgreSQL test database.');
        }

        config()->set('database.default', 'pgsql');
        $host = strtolower((string) config('database.connections.pgsql.host'));
        if (! in_array($host, ['127.0.0.1', 'localhost', '::1', 'postgres'], true)) {
            $this->markTestSkipped('Workflow outbox tests require a local or CI test database host.');
        }

        DB::purge('pgsql');
        DB::reconnect('pgsql');
        if (! DB::getSchemaBuilder()->hasTable('workflow_outbox')) {
            $this->markTestSkipped('Requires the workflow outbox migration.');
        }
    }

    protected function tearDown(): void
    {
        if ($this->ids !== [] && DB::connection()->getDriverName() === 'pgsql') {
            DB::table('workflow_outbox')->whereIn('id', $this->ids)->delete();
        }

        parent::tearDown();
    }

    public function test_postgres_enforces_jsonb_unique_keys_and_claims_rows_once(): void
    {
        $firstId = '00000000-0000-0000-0000-000000000101';
        $secondId = '00000000-0000-0000-0000-000000000102';
        $this->ids = [$firstId, $secondId];
        $now = CarbonImmutable::parse('2026-10-13 10:00:00');

        DB::table('workflow_outbox')->insert([
            'id' => $firstId,
            'idempotency_key' => 'postgres-outbox-test-1',
            'aggregate_type' => 'request',
            'aggregate_id' => 'request-1',
            'event_type' => 'workflow.notification.created',
            'payload' => json_encode(['request_id' => 'request-1'], JSON_THROW_ON_ERROR),
            'status' => 'PENDING',
            'attempts' => 0,
            'max_attempts' => 5,
            'available_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->assertSame('jsonb', DB::selectOne("SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_outbox' AND column_name = 'payload'")->udt_name);
        $this->assertSame(
            ['request_id' => 'request-1'],
            json_decode((string) DB::table('workflow_outbox')->where('id', $firstId)->value('payload'), true, 512, JSON_THROW_ON_ERROR),
        );

        try {
            DB::transaction(function () use ($secondId, $now): void {
                DB::table('workflow_outbox')->insert([
                    'id' => $secondId,
                    'idempotency_key' => 'postgres-outbox-test-1',
                    'event_type' => 'workflow.notification.created',
                    'payload' => '{}',
                    'status' => 'PENDING',
                    'attempts' => 0,
                    'max_attempts' => 5,
                    'available_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
            $this->fail('Expected duplicate idempotency key to be rejected.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }

        $claimed = (new WorkflowOutboxRepository)->claim($firstId, $now);
        $this->assertNotNull($claimed);
        $this->assertNull((new WorkflowOutboxRepository)->claim($firstId, $now));
    }
}
