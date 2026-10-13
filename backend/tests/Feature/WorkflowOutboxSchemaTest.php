<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class WorkflowOutboxSchemaTest extends TestCase
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
            $table->timestamp('created_at')->nullable();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('workflow_outbox');
        parent::tearDown();
    }

    public function test_workflow_outbox_and_notification_delivery_key_schema_exists(): void
    {
        (require database_path('migrations/2026_10_13_000003_create_workflow_outbox.php'))->up();
        (require database_path('migrations/2026_10_13_000004_add_outbox_id_to_notifications.php'))->up();

        $this->assertTrue(Schema::hasTable('workflow_outbox'));
        $this->assertTrue(Schema::hasColumns('workflow_outbox', [
            'id', 'idempotency_key', 'aggregate_type', 'aggregate_id', 'event_type',
            'payload', 'status', 'attempts', 'max_attempts', 'available_at',
            'processing_started_at', 'last_error', 'completed_at', 'dead_lettered_at',
            'created_at', 'updated_at',
        ]));
        $this->assertTrue(Schema::hasColumn('notifications', 'outbox_id'));

        DB::table('workflow_outbox')->insert([
            'id' => '00000000-0000-0000-0000-000000000001',
            'idempotency_key' => 'request-1:notification:1',
            'aggregate_type' => 'request',
            'aggregate_id' => 'request-1',
            'event_type' => 'workflow.notification.created',
            'payload' => json_encode(['request_id' => 'request-1'], JSON_THROW_ON_ERROR),
            'status' => 'PENDING',
            'attempts' => 0,
            'max_attempts' => 5,
            'available_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectExceptionMessageMatches('/unique|duplicate/i');
        DB::table('workflow_outbox')->insert([
            'id' => '00000000-0000-0000-0000-000000000002',
            'idempotency_key' => 'request-1:notification:1',
            'aggregate_type' => 'request',
            'aggregate_id' => 'request-1',
            'event_type' => 'workflow.notification.created',
            'payload' => '{}',
            'status' => 'PENDING',
            'attempts' => 0,
            'max_attempts' => 5,
            'available_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
