<?php

namespace Tests\Feature;

use App\Features\Approvals\ApprovalItemProvisioner;
use App\Features\Requests\RequestAuthorizer;
use App\Features\Requests\RequestRepository;
use App\Features\Requests\RequestService;
use App\Integrations\SeaTalk\ApprovalItemPayload;
use App\Integrations\SeaTalk\ProviderItemResult;
use App\Integrations\SeaTalk\SeaTalkApprovalCenterGateway;
use App\Integrations\SeaTalk\SeaTalkResponse;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PDO;
use Tests\TestCase;

final class SeaTalkApprovalCycleDeliveryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated approval-cycle tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        config()->set('services.seatalk.approval.enabled', true);
        config()->set('services.seatalk.approval.approve_callback_url', 'https://app.test/approve');
        config()->set('services.seatalk.approval.reject_callback_url', 'https://app.test/reject');
        config()->set('services.seatalk.approval.app_path', 'seatalk://application/sop/soc5/?itemId={itemId}');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->createSchema();
    }

    public function test_request_creation_and_correction_deliver_a_fresh_active_approval_assignment(): void
    {
        $picId = '11111111-1111-1111-1111-111111111111';
        $fteId = '22222222-2222-2222-2222-222222222222';
        $requestId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        DB::table('profiles')->insert([
            'id' => $fteId,
            'name' => 'FTE Operator',
            'role' => 'fte_ops',
            'is_active' => true,
            'seatalk_employee_code' => 'employee-ops-1',
            'last_seen_at' => now(),
        ]);

        $gateway = Mockery::mock(SeaTalkApprovalCenterGateway::class);
        $gateway->expects('createItem')
            ->with(Mockery::on(fn (ApprovalItemPayload $payload): bool => count($payload->pendingList) === 1
                && $payload->pendingList[0]['employee_code'] === 'employee-ops-1'))
            ->andReturn(new ProviderItemResult(new SeaTalkResponse(200, ['code' => 0, 'response_id' => 'response-1'])));
        $gateway->expects('updateItem')
            ->with('req_aaaaaaaaaaaaaaaaaaaaaaaaaa', Mockery::on(fn (ApprovalItemPayload $payload): bool => count($payload->pendingList) === 1
                && $payload->pendingList[0]['employee_code'] === 'employee-ops-1'));

        $authorizer = new RequestAuthorizer;
        $provisioner = new ApprovalItemProvisioner($gateway);
        $service = new RequestService(new RequestRepository($authorizer), $authorizer, provisioner: $provisioner);
        $pic = (object) ['id' => $picId, 'role' => 'ops_pic'];
        $request = $service->create($pic, [
            'id' => $requestId,
            'request_timestamp' => now(),
            'cluster' => 'SOC 5',
            'region' => 'North',
            'dock_no' => 'D-1',
            'backlogs' => 12,
            'truck_size' => '6W',
            'truck_type' => 'WETLEASE',
        ]);

        $this->assertSame('PENDING', $request->status);
        $this->assertDatabaseHas('seatalk_approval_assignments', [
            'request_id' => $requestId,
            'fte_user_id' => $fteId,
            'sequence' => 1,
            'status' => 'ACTIVE',
        ]);

        DB::table('requests')->where('id', $requestId)->update([
            'status' => 'REJECTED',
            'approval_status' => 'REJECTED',
            'rejection_return_role' => 'ops_pic',
            'rejection_remarks' => 'Correct the dock number.',
        ]);
        DB::table('seatalk_approval_assignments')->where('request_id', $requestId)->update([
            'status' => 'REJECTED',
            'responded_at' => now(),
        ]);

        $corrected = $service->updateDetails($requestId, $pic, ['dock_no' => 'D-2']);

        $this->assertSame('PENDING', $corrected->status);
        $this->assertSame(2, DB::table('seatalk_approval_assignments')->where('request_id', $requestId)->count());
        $this->assertDatabaseHas('seatalk_approval_assignments', [
            'request_id' => $requestId,
            'fte_user_id' => $fteId,
            'sequence' => 2,
            'status' => 'ACTIVE',
        ]);
        $this->assertSame('ACTIVE', DB::table('seatalk_approval_items')->where('request_id', $requestId)->value('status'));
    }

    private function createSchema(): void
    {
        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name')->nullable();
            $table->string('role');
            $table->boolean('is_active')->default(true);
            $table->string('seatalk_employee_code')->nullable();
            $table->timestamp('last_seen_at')->nullable();
        });
        Schema::create('requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('created_by')->nullable();
            $table->dateTime('request_timestamp')->nullable();
            $table->string('cluster')->nullable();
            $table->string('region')->nullable();
            $table->string('dock_no')->nullable();
            $table->integer('backlogs')->nullable();
            $table->string('truck_size')->nullable();
            $table->string('truck_type')->nullable();
            $table->string('status')->default('PENDING');
            $table->string('approval_status')->default('PENDING');
            $table->string('approval_source')->nullable();
            $table->unsignedBigInteger('approval_version')->default(0);
            $table->uuid('approval_correlation_id')->nullable();
            $table->string('rejection_return_role')->nullable();
            $table->text('rejection_remarks')->nullable();
            $table->uuid('rejected_by')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
        Schema::create('request_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_id');
            $table->uuid('actor_id')->nullable();
            $table->string('event_type');
            $table->string('from_status')->nullable();
            $table->string('to_status')->nullable();
            $table->text('metadata');
            $table->timestamps();
        });
        Schema::create('notifications', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_id')->nullable();
            $table->uuid('user_id')->nullable();
            $table->string('target_role')->nullable();
            $table->string('event_type');
            $table->string('title');
            $table->text('body');
            $table->timestamps();
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
            $table->timestamps();
        });
        Schema::create('approval_routing_cursors', function (Blueprint $table): void {
            $table->string('scope')->primary();
            $table->uuid('cursor_profile_id')->nullable();
            $table->timestamps();
        });
    }
}
