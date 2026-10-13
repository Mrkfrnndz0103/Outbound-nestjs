<?php

namespace Tests\Feature;

use App\Features\Outbox\Handlers\GoogleSheetsSynchronizationOutboxHandler;
use App\Features\Outbox\WorkflowGoogleSheetsOutbox;
use App\Features\Outbox\WorkflowOutboxDispatcher;
use App\Features\Outbox\WorkflowOutboxRepository;
use App\Features\Outbox\WorkflowOutboxWriter;
use App\Jobs\ProcessWorkflowOutbox;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class GoogleSheetsOutboxDeliveryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        (require database_path('migrations/2026_10_13_000003_create_workflow_outbox.php'))->up();
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('workflow_outbox');
        parent::tearDown();
    }

    public function test_enabled_handler_runs_one_full_sync(): void
    {
        config()->set('services.google_sheets.sync_enabled', true);
        $calls = 0;
        $handler = new GoogleSheetsSynchronizationOutboxHandler(function () use (&$calls): void {
            $calls++;
        });

        $handler->handle((object) ['payload' => ['workflow_version' => 4]]);

        $this->assertSame(1, $calls);
    }

    public function test_disabled_handler_skips_delivery(): void
    {
        config()->set('services.google_sheets.sync_enabled', false);
        $calls = 0;
        $handler = new GoogleSheetsSynchronizationOutboxHandler(function () use (&$calls): void {
            $calls++;
        });

        $handler->handle((object) ['payload' => []]);

        $this->assertSame(0, $calls);
    }

    public function test_pending_sheet_sync_intents_are_coalesced(): void
    {
        config()->set('services.google_sheets.sync_enabled', true);
        Queue::fake();
        $outbox = new WorkflowGoogleSheetsOutbox(
            new WorkflowOutboxWriter(new WorkflowOutboxRepository),
            new WorkflowOutboxRepository,
            new WorkflowOutboxDispatcher,
        );

        $first = $outbox->requestSync(4);
        $second = $outbox->requestSync(5);

        $this->assertSame($first, $second);
        $this->assertDatabaseCount('workflow_outbox', 1);
        Queue::assertPushed(ProcessWorkflowOutbox::class, 1);
    }
}
