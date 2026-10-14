<?php

namespace Tests\Feature;

use App\Features\Approvals\ApprovalItemProvisioner;
use App\Features\Approvals\ApprovalRouter;
use App\Integrations\SeaTalk\SeaTalkApprovalCenterGateway;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PDO;
use Tests\TestCase;

final class ApprovalRoutingTest extends TestCase
{
    private ApprovalRouter $router;

    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated routing tests.');
        }
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        config()->set('services.seatalk.approval.enabled', false);
        config()->set('services.seatalk.approval.token_secret', 'test-token-secret');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->createSchema();
        $this->router = new ApprovalRouter(new ApprovalItemProvisioner(Mockery::mock(SeaTalkApprovalCenterGateway::class)));
    }

    public function test_round_robin_assigns_each_active_present_user_in_order(): void
    {
        $this->insertProfile('11111111-1111-1111-1111-111111111111');
        $this->insertProfile('22222222-2222-2222-2222-222222222222');
        $requestId = $this->insertRequest();

        $first = $this->router->assignNext($requestId);
        DB::table('seatalk_approval_assignments')->where('id', $first->assignmentId)->update(['status' => 'EXPIRED']);
        $second = $this->router->assignNext($requestId);

        $this->assertTrue($first->assigned());
        $this->assertTrue($second->assigned());
        $this->assertSame('11111111-1111-1111-1111-111111111111', $first->profileId);
        $this->assertSame('22222222-2222-2222-2222-222222222222', $second->profileId);
    }

    public function test_no_candidate_keeps_request_pending_without_assignment(): void
    {
        $requestId = $this->insertRequest();

        $result = $this->router->assignNext($requestId);

        $this->assertSame('no_candidate', $result->status);
        $this->assertSame(0, DB::table('seatalk_approval_assignments')->count());
        $this->assertSame('PENDING', DB::table('requests')->where('id', $requestId)->value('status'));
    }

    public function test_expired_users_are_skipped_until_the_current_routing_cycle_is_exhausted(): void
    {
        $this->insertProfile('11111111-1111-1111-1111-111111111111');
        $this->insertProfile('22222222-2222-2222-2222-222222222222');
        $requestId = $this->insertRequest();

        $first = $this->router->assignNext($requestId);
        DB::table('seatalk_approval_assignments')->where('id', $first->assignmentId)->update(['status' => 'EXPIRED']);
        $second = $this->router->assignNext($requestId);
        DB::table('seatalk_approval_assignments')->where('id', $second->assignmentId)->update(['status' => 'EXPIRED']);
        $third = $this->router->assignNext($requestId);

        $this->assertSame('22222222-2222-2222-2222-222222222222', $second->profileId);
        $this->assertSame('11111111-1111-1111-1111-111111111111', $third->profileId);
        $this->assertSame(2, (int) DB::table('seatalk_approval_assignments')->where('id', $third->assignmentId)->value('routing_cycle'));
    }

    private function createSchema(): void
    {
        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('role');
            $table->boolean('is_active')->default(true);
            $table->string('seatalk_employee_code')->nullable();
            $table->timestamp('last_seen_at')->nullable();
        });
        Schema::create('requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('status')->default('PENDING');
        });
        Schema::create('seatalk_approval_items', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('request_id')->unique();
            $table->string('status')->default('PENDING');
            $table->uuid('correlation_id')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
        Schema::create('seatalk_approval_assignments', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('request_id');
            $table->uuid('seatalk_approval_item_id');
            $table->uuid('fte_user_id');
            $table->unsignedInteger('sequence');
            $table->unsignedInteger('routing_cycle')->default(1);
            $table->string('status');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->text('failure_reason')->nullable();
            $table->string('approval_token_hash')->nullable();
            $table->uuid('correlation_id')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
        Schema::create('approval_routing_cursors', function (Blueprint $table): void {
            $table->string('scope')->primary();
            $table->uuid('cursor_profile_id')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
    }

    private function insertProfile(string $id): void
    {
        DB::table('profiles')->insert([
            'id' => $id,
            'role' => 'fte_ops',
            'is_active' => true,
            'seatalk_employee_code' => 'employee-'.$id,
            'last_seen_at' => now(),
        ]);
    }

    private function insertRequest(): string
    {
        $id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        DB::table('requests')->insert(['id' => $id]);

        return $id;
    }
}
