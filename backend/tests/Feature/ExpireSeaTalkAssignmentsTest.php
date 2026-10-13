<?php

namespace Tests\Feature;

use App\Features\Approvals\ApprovalItemProvisioner;
use App\Features\Approvals\ApprovalRouter;
use App\Integrations\SeaTalk\ApprovalItemPayload;
use App\Integrations\SeaTalk\ProviderItemResult;
use App\Integrations\SeaTalk\SeaTalkApprovalCenterGateway;
use App\Integrations\SeaTalk\SeaTalkResponse;
use App\Jobs\ExpireSeaTalkAssignments;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PDO;
use Tests\TestCase;

final class ExpireSeaTalkAssignmentsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated expiry tests.');
        }
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        config()->set('services.seatalk.approval.enabled', false);
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->createSchema();
    }

    public function test_expiry_is_idempotent_and_routes_next_candidate(): void
    {
        $profileId = '11111111-1111-1111-1111-111111111111';
        $requestId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        $itemId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        DB::table('profiles')->insert(['id' => $profileId, 'role' => 'fte_ops', 'is_active' => true, 'seatalk_employee_code' => 'employee-1', 'last_seen_at' => now()]);
        DB::table('requests')->insert(['id' => $requestId, 'status' => 'PENDING']);
        DB::table('seatalk_approval_items')->insert(['id' => $itemId, 'request_id' => $requestId, 'status' => 'PENDING']);
        DB::table('seatalk_approval_assignments')->insert([
            'id' => 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            'request_id' => $requestId,
            'seatalk_approval_item_id' => $itemId,
            'fte_user_id' => $profileId,
            'sequence' => 1,
            'status' => 'ACTIVE',
            'expires_at' => now()->subSecond(),
        ]);

        $router = new ApprovalRouter(new ApprovalItemProvisioner(Mockery::mock(SeaTalkApprovalCenterGateway::class)));
        (new ExpireSeaTalkAssignments)->handle($router);
        (new ExpireSeaTalkAssignments)->handle($router);

        $this->assertSame('EXPIRED', DB::table('seatalk_approval_assignments')->where('id', 'cccccccc-cccc-cccc-cccc-cccccccccccc')->value('status'));
        $this->assertSame(2, DB::table('seatalk_approval_assignments')->count());
    }

    public function test_pending_request_is_routed_after_an_fte_ops_candidate_becomes_present(): void
    {
        config()->set('services.seatalk.approval.enabled', true);
        config()->set('services.seatalk.approval.approve_callback_url', 'https://app.test/approve');
        config()->set('services.seatalk.approval.reject_callback_url', 'https://app.test/reject');
        config()->set('services.seatalk.approval.app_path', 'seatalk://application/sop/soc5/?itemId={itemId}');
        $requestId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        $profileId = '11111111-1111-1111-1111-111111111111';
        DB::table('requests')->insert([
            'id' => $requestId,
            'status' => 'PENDING',
            'approval_status' => 'PENDING',
            'created_by' => '99999999-9999-9999-9999-999999999999',
            'cluster' => 'SOC 5',
            'dock_no' => 'D-1',
            'created_at' => now(),
        ]);

        $gateway = Mockery::mock(SeaTalkApprovalCenterGateway::class);
        $gateway->expects('createItem')
            ->with(Mockery::on(fn (ApprovalItemPayload $payload): bool => count($payload->pendingList) === 1
                && $payload->pendingList[0]['employee_code'] === 'employee-1'))
            ->andReturn(new ProviderItemResult(new SeaTalkResponse(200, ['code' => 0])));
        $router = new ApprovalRouter(new ApprovalItemProvisioner($gateway));
        $job = new ExpireSeaTalkAssignments;

        $job->handle($router);
        $this->assertSame(0, DB::table('seatalk_approval_assignments')->count());

        DB::table('profiles')->insert([
            'id' => $profileId,
            'name' => 'FTE Operator',
            'role' => 'fte_ops',
            'is_active' => true,
            'seatalk_employee_code' => 'employee-1',
            'last_seen_at' => now(),
        ]);
        $job->handle($router);

        $this->assertDatabaseHas('seatalk_approval_assignments', [
            'request_id' => $requestId,
            'fte_user_id' => $profileId,
            'sequence' => 1,
            'status' => 'ACTIVE',
        ]);
    }

    private function createSchema(): void
    {
        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('role');
            $table->string('name')->nullable();
            $table->boolean('is_active')->default(true);
            $table->string('seatalk_employee_code')->nullable();
            $table->timestamp('last_seen_at')->nullable();
        });
        Schema::create('requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('status')->default('PENDING');
            $table->string('approval_status')->default('PENDING');
            $table->uuid('created_by')->nullable();
            $table->string('cluster')->nullable();
            $table->string('dock_no')->nullable();
            $table->timestamp('created_at')->nullable();
        });
        Schema::create('seatalk_approval_items', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('request_id')->unique();
            $table->string('provider_item_id')->nullable();
            $table->string('provider_response_id')->nullable();
            $table->string('status')->default('PENDING');
            $table->text('failure_reason')->nullable();
            $table->uuid('correlation_id')->nullable();
            $table->timestamps();
        });
        Schema::create('seatalk_approval_assignments', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('request_id');
            $table->uuid('seatalk_approval_item_id');
            $table->uuid('fte_user_id');
            $table->unsignedInteger('sequence');
            $table->string('status');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->text('failure_reason')->nullable();
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
}
