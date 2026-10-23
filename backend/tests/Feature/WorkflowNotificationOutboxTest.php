<?php

namespace Tests\Feature;

use App\Features\Outbox\Handlers\NotificationOutboxHandler;
use App\Features\Outbox\WorkflowNotificationOutbox;
use App\Features\Outbox\WorkflowOutboxDispatcher;
use App\Features\Outbox\WorkflowOutboxHandlerRegistry;
use App\Features\Outbox\WorkflowOutboxRepository;
use App\Features\Outbox\WorkflowOutboxWriter;
use App\Jobs\ProcessWorkflowOutbox;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class WorkflowNotificationOutboxTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        Schema::create('notifications', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_id')->nullable();
            $table->uuid('user_id')->nullable();
            $table->string('target_role')->nullable();
            $table->string('event_type');
            $table->string('title');
            $table->text('body');
            $table->uuid('outbox_id')->nullable()->unique();
            $table->timestamp('created_at')->nullable();
        });
        (require database_path('migrations/2026_10_13_000003_create_workflow_outbox.php'))->up();
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('workflow_outbox');
        parent::tearDown();
    }

    public function test_notification_handler_delivers_one_notification_for_repeated_delivery(): void
    {
        $outboxId = (new WorkflowOutboxWriter(new WorkflowOutboxRepository))->record(
            'workflow.notification.created',
            'request-1:notification:1',
            'request',
            'request-1',
            [
                'request_id' => 'request-1',
                'target_role' => 'fte_ops',
                'event_type' => 'REQUEST_CREATED',
                'title' => 'New request',
                'body' => 'A truck request needs review.',
            ],
        );
        $outbox = (new WorkflowOutboxRepository)->find($outboxId);
        $handler = new NotificationOutboxHandler;

        $handler->handle($outbox);
        $handler->handle($outbox);

        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseHas('notifications', [
            'outbox_id' => $outboxId,
            'request_id' => 'request-1',
            'target_role' => 'fte_ops',
        ]);
    }

    public function test_distinct_workflow_events_with_identical_text_produce_distinct_notifications(): void
    {
        Queue::fake();
        $notifications = new WorkflowNotificationOutbox(new WorkflowOutboxWriter(new WorkflowOutboxRepository), new WorkflowOutboxDispatcher);
        foreach (['event-1', 'event-2', 'event-2'] as $eventId) {
            $notifications->notify('request-1', 'REQUEST_EDITED', 'Updated', 'Review request.', targetRole: 'fte_ops', correlation: $eventId);
        }
        foreach (DB::table('workflow_outbox')->pluck('id') as $id) {
            (new ProcessWorkflowOutbox($id))->handle(new WorkflowOutboxRepository, new WorkflowOutboxHandlerRegistry);
        }
        $this->assertDatabaseCount('workflow_outbox', 2);
        $this->assertDatabaseCount('notifications', 2);
    }

    public function test_notification_intent_is_written_in_transaction_and_dispatched_after_commit(): void
    {
        Queue::fake();
        $notifications = new WorkflowNotificationOutbox(
            new WorkflowOutboxWriter(new WorkflowOutboxRepository),
            new WorkflowOutboxDispatcher,
        );

        DB::beginTransaction();
        $notifications->notify('request-2', 'REQUEST_CREATED', 'New request', 'Review needed.', targetRole: 'fte_ops');

        $this->assertDatabaseCount('notifications', 0);
        $this->assertDatabaseCount('workflow_outbox', 1);
        Queue::assertNothingPushed();

        DB::commit();

        Queue::assertPushed(ProcessWorkflowOutbox::class);
    }
}
