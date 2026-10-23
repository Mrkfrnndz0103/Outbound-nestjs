<?php

namespace Tests\Feature;

use App\Features\Approvals\ApprovalItemProvisioner;
use App\Features\Approvals\ApprovalItemSynchronizer;
use App\Features\Approvals\ApprovalToken;
use App\Integrations\SeaTalk\ApprovalItemPayload;
use App\Integrations\SeaTalk\ProviderItemResult;
use App\Integrations\SeaTalk\SeaTalkApprovalCenterGateway;
use App\Integrations\SeaTalk\SeaTalkProviderException;
use App\Integrations\SeaTalk\SeaTalkResponse;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PDO;
use Tests\TestCase;

final class ApprovalItemSynchronizationTest extends TestCase
{
    private string $requestId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated synchronization tests.');
        }
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        config()->set('services.seatalk.approval.approve_callback_url', 'https://app.test/approve');
        config()->set('services.seatalk.approval.reject_callback_url', 'https://app.test/reject');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->createSchema();
    }

    public function test_active_synchronization_binds_both_callbacks_to_assignment_token(): void
    {
        config()->set('services.seatalk.approval.token_secret', 'synthetic-secret');
        DB::table('requests')->update(['approval_status' => 'PENDING']);
        $expected = app(ApprovalToken::class)->forAssignment('cccccccc-cccc-cccc-cccc-cccccccccccc');
        $captured = null;
        $gateway = Mockery::mock(SeaTalkApprovalCenterGateway::class);
        $gateway->expects('updateItem')->andReturnUsing(function ($id, $payload) use (&$captured) {
            $captured = $payload;
        });
        $this->assertTrue($this->synchronizer($gateway)->synchronize($this->requestId)->synchronized());
        $this->assertSame($expected, $captured->pendingList[0]['token'] ?? null);
        $this->assertStringContainsString('token='.$expected, $captured->approveUrl);
        $this->assertStringContainsString('token='.$expected, $captured->rejectUrl);
    }

    public function test_reconciliation_repairs_terminal_local_divergence(): void
    {
        DB::table('requests')->update(['approval_status' => 'PENDING']);
        DB::table('seatalk_approval_items')->update(['status' => 'REJECTED']);
        config()->set('services.seatalk.approval.token_secret', 'synthetic-secret');
        $gateway = Mockery::mock(SeaTalkApprovalCenterGateway::class);
        $gateway->expects('getItem')->andReturn(new ProviderItemResult(new SeaTalkResponse(200, ['code' => 0])));
        $gateway->expects('updateItem');
        $this->app->instance(SeaTalkApprovalCenterGateway::class, $gateway);
        $this->artisan('seatalk:reconcile-approvals', ['--repair' => true])->assertExitCode(0);
        $this->assertDatabaseHas('seatalk_approval_items', ['status' => 'ACTIVE']);
    }

    public function test_approved_state_updates_provider_lists_and_status(): void
    {
        DB::table('seatalk_approval_assignments')->update(['status' => 'APPROVED', 'responded_at' => now()]);
        $gateway = Mockery::mock(SeaTalkApprovalCenterGateway::class);
        $gateway->expects('updateItem')->with('provider-item-1', Mockery::on(function (ApprovalItemPayload $payload): bool {
            return $payload->statusState === 1
                && $payload->pendingList === []
                && $payload->approvedList[0]['employee_code'] === 'employee-1';
        }));

        $result = $this->synchronizer($gateway)->synchronize($this->requestId);

        $this->assertTrue($result->synchronized());
        $this->assertSame('APPROVED', DB::table('seatalk_approval_items')->value('status'));
    }

    public function test_provider_failure_is_recorded_without_rolling_back_local_state(): void
    {
        $gateway = Mockery::mock(SeaTalkApprovalCenterGateway::class);
        $gateway->expects('updateItem')->andThrow(SeaTalkProviderException::contract('update endpoint not confirmed'));

        $result = $this->synchronizer($gateway)->synchronize($this->requestId);

        $this->assertSame('failed', $result->status);
        $this->assertSame('FAILED', DB::table('seatalk_approval_items')->value('status'));
        $this->assertSame('APPROVED', DB::table('requests')->value('approval_status'));
    }

    public function test_reconciliation_command_reports_local_items_without_changing_canonical_state(): void
    {
        $this->artisan('seatalk:reconcile-approvals')
            ->assertExitCode(0);

        $this->assertSame('APPROVED', DB::table('requests')->value('approval_status'));
    }

    private function synchronizer(SeaTalkApprovalCenterGateway $gateway): ApprovalItemSynchronizer
    {
        return new ApprovalItemSynchronizer($gateway, new ApprovalItemProvisioner($gateway));
    }

    private function createSchema(): void
    {
        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('seatalk_employee_code')->nullable();
        });
        Schema::create('requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('created_by')->nullable();
            $table->string('status')->default('REQUESTED');
            $table->string('approval_status')->default('APPROVED');
            $table->timestamp('created_at')->nullable();
        });
        Schema::create('seatalk_approval_items', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('request_id')->unique();
            $table->string('provider_item_id')->nullable();
            $table->string('status')->default('ACTIVE');
            $table->text('failure_reason')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
        Schema::create('seatalk_approval_assignments', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('request_id');
            $table->uuid('fte_user_id');
            $table->unsignedInteger('sequence')->default(1);
            $table->string('status');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->text('failure_reason')->nullable();
        });

        DB::table('profiles')->insert(['id' => '11111111-1111-1111-1111-111111111111', 'name' => 'Operator', 'seatalk_employee_code' => 'employee-1']);
        DB::table('requests')->insert(['id' => $this->requestId, 'created_by' => '11111111-1111-1111-1111-111111111111', 'created_at' => now()]);
        DB::table('seatalk_approval_items')->insert(['id' => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'request_id' => $this->requestId, 'provider_item_id' => 'provider-item-1']);
        DB::table('seatalk_approval_assignments')->insert(['id' => 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'request_id' => $this->requestId, 'fte_user_id' => '11111111-1111-1111-1111-111111111111', 'status' => 'ACTIVE', 'sent_at' => now()]);
    }
}
