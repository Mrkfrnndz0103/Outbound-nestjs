<?php

namespace Tests\Feature;

use App\Features\Outbox\WorkflowOutboxRepository;
use App\Features\Outbox\WorkflowOutboxWriter;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class WorkflowOutboxWriterTest extends TestCase
{
    private WorkflowOutboxWriter $writer;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        (require database_path('migrations/2026_10_13_000003_create_workflow_outbox.php'))->up();
        $this->writer = new WorkflowOutboxWriter(new WorkflowOutboxRepository);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('workflow_outbox');
        parent::tearDown();
    }

    public function test_record_is_idempotent_and_serializes_payload(): void
    {
        $first = $this->writer->record(
            'workflow.notification.created',
            'request-1:notification:1',
            'request',
            'request-1',
            ['request_id' => 'request-1', 'title' => 'New request'],
        );
        $second = $this->writer->record(
            'workflow.notification.created',
            'request-1:notification:1',
            'request',
            'request-1',
            ['request_id' => 'request-1', 'title' => 'New request'],
        );

        $this->assertSame($first, $second);
        $this->assertSame(1, DB::table('workflow_outbox')->count());
        $this->assertSame(
            ['request_id' => 'request-1', 'title' => 'New request'],
            json_decode((string) DB::table('workflow_outbox')->first()->payload, true, 512, JSON_THROW_ON_ERROR),
        );
    }

    public function test_record_rolls_back_with_the_enclosing_transaction(): void
    {
        try {
            DB::transaction(function (): void {
                $this->writer->record(
                    'workflow.notification.created',
                    'request-2:notification:1',
                    'request',
                    'request-2',
                    ['request_id' => 'request-2'],
                );

                throw new \RuntimeException('rollback');
            });
        } catch (\RuntimeException $exception) {
            $this->assertSame('rollback', $exception->getMessage());
        }

        $this->assertDatabaseCount('workflow_outbox', 0);
    }

    public function test_claims_pending_rows_once_and_recovers_stale_processing_rows(): void
    {
        $now = CarbonImmutable::parse('2026-10-13 10:00:00');
        $id = $this->writer->record(
            'workflow.notification.created',
            'request-3:notification:1',
            'request',
            'request-3',
            ['request_id' => 'request-3'],
        );
        DB::table('workflow_outbox')->where('id', $id)->update(['available_at' => $now]);

        $claimed = (new WorkflowOutboxRepository)->claim($id, $now);
        $this->assertNotNull($claimed);
        $this->assertSame('PROCESSING', $claimed->status);
        $this->assertSame(1, $claimed->attempts);
        $this->assertNull((new WorkflowOutboxRepository)->claim($id, $now));

        DB::table('workflow_outbox')->where('id', $id)->update([
            'processing_started_at' => $now->subMinutes(10),
        ]);

        $reclaimed = (new WorkflowOutboxRepository)->claim($id, $now);
        $this->assertNotNull($reclaimed);
        $this->assertSame(2, $reclaimed->attempts);
    }
}
