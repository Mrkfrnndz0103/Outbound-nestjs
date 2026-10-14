<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PDO;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('postgres')]
final class ApprovalSchemaTest extends TestCase
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
        Schema::dropIfExists('seatalk_approval_assignments');
        Schema::dropIfExists('seatalk_approval_items');
        Schema::dropIfExists('requests');
        Schema::dropIfExists('profiles');

        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
        });
        Schema::create('requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('status')->default('PENDING');
            $table->timestampTz('created_at')->nullable();
            $table->timestampTz('updated_at')->nullable();
        });

        DB::table('requests')->insert([
            ['id' => '00000000-0000-0000-0000-000000000001', 'status' => 'APPROVED'],
            ['id' => '00000000-0000-0000-0000-000000000002', 'status' => 'REJECTED_BY_MM'],
            ['id' => '00000000-0000-0000-0000-000000000003', 'status' => 'CONFIRMED'],
            ['id' => '00000000-0000-0000-0000-000000000004', 'status' => 'PENDING'],
        ]);

        $this->runApprovalMigrations();
    }

    protected function tearDown(): void
    {
        if (getenv('POSTGRES_TESTS') === '1' && in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            Schema::dropIfExists('seatalk_approval_assignments');
            Schema::dropIfExists('seatalk_approval_items');
            Schema::dropIfExists('requests');
            Schema::dropIfExists('profiles');
        }

        parent::tearDown();
    }

    public function test_request_metadata_preserves_legacy_status_history(): void
    {
        $request = DB::table('requests')->where('id', '00000000-0000-0000-0000-000000000001')->first();

        $this->assertSame('APPROVED', $request->status);
        $this->assertSame('APPROVED', $request->approval_status);
        $this->assertSame(0, (int) $request->approval_version);
        $this->assertSame('REJECTED', DB::table('requests')->where('id', '00000000-0000-0000-0000-000000000002')->value('approval_status'));
        $this->assertSame('APPROVED', DB::table('requests')->where('id', '00000000-0000-0000-0000-000000000003')->value('approval_status'));
        $this->assertSame('PENDING', DB::table('requests')->where('id', '00000000-0000-0000-0000-000000000004')->value('approval_status'));
        $this->assertTrue(Schema::hasColumns('requests', [
            'approval_status',
            'approved_by',
            'approved_at',
            'approval_source',
            'rejected_by',
            'rejected_at',
            'approval_version',
            'approval_correlation_id',
        ]));
        $this->assertTrue(Schema::hasColumns('seatalk_approval_assignments', [
            'routing_cycle',
            'approval_token_hash',
            'approval_token_used_at',
        ]));
    }

    public function test_active_assignment_is_unique_per_request_but_expired_history_is_allowed(): void
    {
        $requestId = '00000000-0000-0000-0000-000000000001';
        $employeeId = '00000000-0000-0000-0000-000000000002';
        DB::table('profiles')->insert(['id' => $employeeId]);
        DB::table('seatalk_approval_items')->insert([
            'id' => '10000000-0000-0000-0000-000000000001',
            'request_id' => $requestId,
            'status' => 'PENDING',
        ]);

        DB::table('seatalk_approval_assignments')->insert([
            'id' => '20000000-0000-0000-0000-000000000001',
            'request_id' => $requestId,
            'seatalk_approval_item_id' => '10000000-0000-0000-0000-000000000001',
            'fte_user_id' => $employeeId,
            'sequence' => 1,
            'status' => 'ACTIVE',
        ]);

        $this->expectException(QueryException::class);
        DB::table('seatalk_approval_assignments')->insert([
            'id' => '20000000-0000-0000-0000-000000000002',
            'request_id' => $requestId,
            'seatalk_approval_item_id' => '10000000-0000-0000-0000-000000000001',
            'fte_user_id' => $employeeId,
            'sequence' => 2,
            'status' => 'ACTIVE',
        ]);
    }

    public function test_assignment_schema_supports_expiry_action_provider_and_correlation_audit_fields(): void
    {
        $requestId = '00000000-0000-0000-0000-000000000001';
        $employeeId = '00000000-0000-0000-0000-000000000002';
        DB::table('profiles')->insert(['id' => $employeeId]);
        DB::table('seatalk_approval_items')->insert([
            'id' => '10000000-0000-0000-0000-000000000001',
            'request_id' => $requestId,
            'provider_item_id' => 'seatalk-item-1',
            'provider_response_id' => 'seatalk-response-1',
            'status' => 'PENDING',
        ]);

        DB::table('seatalk_approval_assignments')->insert([
            'id' => '20000000-0000-0000-0000-000000000001',
            'request_id' => $requestId,
            'seatalk_approval_item_id' => '10000000-0000-0000-0000-000000000001',
            'fte_user_id' => $employeeId,
            'sequence' => 1,
            'status' => 'EXPIRED',
            'sent_at' => '2026-10-03 00:00:00+00',
            'expires_at' => '2026-10-03 00:03:00+00',
            'responded_at' => '2026-10-03 00:04:00+00',
            'seatalk_message_id' => 'seatalk-message-1',
            'provider_response_id' => 'seatalk-action-1',
            'failure_reason' => 'timeout',
            'correlation_id' => '30000000-0000-0000-0000-000000000001',
        ]);

        $assignment = DB::table('seatalk_approval_assignments')->first();
        $this->assertSame('EXPIRED', $assignment->status);
        $this->assertSame('seatalk-message-1', $assignment->seatalk_message_id);
        $this->assertSame('seatalk-action-1', $assignment->provider_response_id);
        $this->assertSame('timeout', $assignment->failure_reason);
    }

    public function test_rolling_back_approval_schema_keeps_existing_requests(): void
    {
        $this->rollbackApprovalMigrations();

        $this->assertDatabaseHas('requests', [
            'id' => '00000000-0000-0000-0000-000000000001',
            'status' => 'APPROVED',
        ]);
        $this->assertFalse(Schema::hasTable('seatalk_approval_assignments'));
        $this->assertFalse(Schema::hasTable('seatalk_approval_items'));
        $this->assertFalse(Schema::hasColumns('requests', [
            'approval_status',
            'approved_by',
            'approved_at',
            'approval_source',
            'rejected_by',
            'rejected_at',
            'approval_version',
            'approval_correlation_id',
        ]));
    }

    private function runApprovalMigrations(): void
    {
        $requestMigration = require glob(base_path('database/migrations/*_add_approval_metadata_to_requests.php'))[0];
        $assignmentsMigration = require glob(base_path('database/migrations/*_create_seatalk_approval_assignments.php'))[0];
        $hardeningMigration = require glob(base_path('database/migrations/*_harden_seatalk_approval_assignments.php'))[0];
        $requestMigration->up();
        $assignmentsMigration->up();
        $hardeningMigration->up();
    }

    private function rollbackApprovalMigrations(): void
    {
        $requestMigration = require glob(base_path('database/migrations/*_add_approval_metadata_to_requests.php'))[0];
        $assignmentsMigration = require glob(base_path('database/migrations/*_create_seatalk_approval_assignments.php'))[0];
        $hardeningMigration = require glob(base_path('database/migrations/*_harden_seatalk_approval_assignments.php'))[0];
        $hardeningMigration->down();
        $assignmentsMigration->down();
        $requestMigration->down();
    }
}
