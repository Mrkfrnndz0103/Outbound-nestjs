<?php

namespace Tests\Feature;

use App\Features\Approvals\ApprovalActor;
use App\Features\Approvals\ApprovalService;
use App\Features\Approvals\ApprovalSource;
use App\Features\Requests\RequestAuthorizer;
use App\Features\Requests\RequestRepository;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PDO;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class ApprovalServiceTest extends TestCase
{
    private ApprovalService $service;

    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated approval tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->createSchema();

        $authorizer = new RequestAuthorizer;
        $this->service = new ApprovalService(new RequestRepository($authorizer), $authorizer);
    }

    public function test_role_preview_cannot_override_stored_approval_authorization(): void
    {
        $requestId = $this->insertRequest('PENDING');
        $storedActor = new ApprovalActor((string) Str::uuid(), 'doc_officer');
        $this->insertApprovalProfile($storedActor);
        try {
            $this->service->approve($requestId, new ApprovalActor($storedActor->id, 'fte_ops'), ApprovalSource::Web);
            $this->fail('A preview must not confer the stored approval role.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
        $this->assertDatabaseHas('requests', ['id' => $requestId, 'approval_status' => 'PENDING']);
        $this->assertSame(0, DB::table('request_events')->count());
    }

    public function test_web_approval_records_canonical_metadata_once(): void
    {
        $request = $this->insertRequest('PENDING');
        $actor = new ApprovalActor((string) Str::uuid(), 'fte_ops');
        $this->insertApprovalProfile($actor);

        $first = $this->service->approve($request, $actor, ApprovalSource::Web);
        $second = $this->service->approve($request, $actor, ApprovalSource::Web);

        $this->assertFalse($first->idempotent);
        $this->assertTrue($second->idempotent);
        $this->assertSame('REQUESTED', DB::table('requests')->where('id', $request)->value('status'));
        $this->assertSame('APPROVED', DB::table('requests')->where('id', $request)->value('approval_status'));
        $this->assertSame('WEB', DB::table('requests')->where('id', $request)->value('approval_source'));
        $this->assertSame(1, (int) DB::table('requests')->where('id', $request)->value('approval_version'));
        $this->assertSame(1, DB::table('request_events')->count());
    }

    public function test_rejection_requires_reason_and_closes_active_assignments(): void
    {
        $request = $this->insertRequest('REQUESTED');
        $assignmentId = (string) Str::uuid();
        $actor = new ApprovalActor((string) Str::uuid(), 'fte_mm', 'employee-1');
        $this->insertApprovalProfile($actor);
        DB::table('seatalk_approval_assignments')->insert([
            'id' => $assignmentId,
            'request_id' => $request,
            'fte_user_id' => $actor->id,
            'status' => 'ACTIVE',
        ]);

        $result = $this->service->reject(
            $request,
            $actor,
            ApprovalSource::SeaTalk,
            $assignmentId,
            'No truck available',
        );

        $this->assertSame('REJECTED', $result->request->status);
        $this->assertSame('fte_ops', $result->request->rejection_return_role);
        $this->assertDatabaseHas('notifications', ['request_id' => $request, 'target_role' => 'fte_ops']);
        $this->assertSame('REJECTED', DB::table('requests')->where('id', $request)->value('approval_status'));
        $this->assertSame('REJECTED', DB::table('seatalk_approval_assignments')->where('request_id', $request)->value('status'));
        $this->assertNull(DB::table('seatalk_approval_assignments')->where('request_id', $request)->value('failure_reason'));
    }

    public function test_ops_rejection_returns_to_pic_and_records_the_decision_once(): void
    {
        $request = $this->insertRequest('PENDING');
        $owner = (string) Str::uuid();
        DB::table('requests')->where('id', $request)->update(['created_by' => $owner]);
        $actor = new ApprovalActor((string) Str::uuid(), 'fte_ops');
        $this->insertApprovalProfile($actor);

        $first = $this->service->reject($request, $actor, ApprovalSource::Web, null, '  Correct the dock  ');
        $second = $this->service->reject($request, $actor, ApprovalSource::Web, null, 'Correct the dock');

        $this->assertSame('REJECTED', $first->request->status);
        $this->assertSame('ops_pic', $first->request->rejection_return_role);
        $this->assertSame($actor->id, $first->request->rejected_by);
        $this->assertNotNull($first->request->rejected_at);
        $this->assertSame('Correct the dock', $first->request->rejection_remarks);
        $this->assertTrue($second->idempotent);
        $this->assertDatabaseCount('request_events', 1);
        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseHas('notifications', ['request_id' => $request, 'user_id' => $owner]);
        $metadata = json_decode(DB::table('request_events')->value('metadata'), true);
        $this->assertSame('ops_pic', $metadata['return_role']);
        $this->assertSame('WEB', $metadata['source']);
    }

    public function test_blank_ops_rejection_does_not_mutate_any_workflow_records(): void
    {
        $request = $this->insertRequest('PENDING');
        $actor = new ApprovalActor((string) Str::uuid(), 'fte_ops');
        $this->insertApprovalProfile($actor);

        try {
            $this->service->reject($request, $actor, ApprovalSource::Web, null, '   ');
            $this->fail('A rejection reason is required.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('rejection_remarks', $exception->errors());
        }

        $this->assertDatabaseHas('requests', ['id' => $request, 'status' => 'PENDING', 'approval_version' => 0]);
        $this->assertDatabaseCount('request_events', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_rejection_replay_cannot_replace_the_original_reason(): void
    {
        $request = $this->insertRequest('REQUESTED');
        $actor = new ApprovalActor((string) Str::uuid(), 'fte_mm');
        $this->insertApprovalProfile($actor);
        $this->service->reject($request, $actor, ApprovalSource::Web, null, 'No truck');

        try {
            $this->service->reject($request, $actor, ApprovalSource::Web, null, 'Different reason');
            $this->fail('A different decision must not be treated as a replay.');
        } catch (HttpException $exception) {
            $this->assertSame(409, $exception->getStatusCode());
        }
        $this->assertDatabaseHas('requests', ['id' => $request, 'rejection_remarks' => 'No truck', 'approval_version' => 1]);
        $this->assertDatabaseCount('request_events', 1);
    }

    private function createSchema(): void
    {
        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('role');
            $table->boolean('is_active')->default(true);
            $table->string('seatalk_employee_code')->nullable();
        });
        Schema::create('requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('status');
            $table->string('rejection_remarks')->nullable();
            $table->string('rejection_return_role')->nullable();
            $table->uuid('created_by')->nullable();
            $table->string('approval_status')->default('PENDING');
            $table->uuid('approved_by')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->string('approval_source')->nullable();
            $table->uuid('rejected_by')->nullable();
            $table->dateTime('rejected_at')->nullable();
            $table->unsignedBigInteger('approval_version')->default(0);
            $table->uuid('approval_correlation_id')->nullable();
        });
        Schema::create('request_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_id');
            $table->uuid('actor_id');
            $table->string('event_type');
            $table->string('from_status')->nullable();
            $table->string('to_status');
            $table->text('metadata')->nullable();
        });
        Schema::create('notifications', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_id');
            $table->string('target_role')->nullable();
            $table->uuid('user_id')->nullable();
            $table->string('event_type');
            $table->string('title');
            $table->text('body');
        });
        Schema::create('seatalk_approval_assignments', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('request_id');
            $table->uuid('fte_user_id');
            $table->string('status');
            $table->text('failure_reason')->nullable();
            $table->dateTime('expires_at')->nullable();
            $table->dateTime('responded_at')->nullable();
            $table->dateTime('updated_at')->nullable();
        });
    }

    private function insertRequest(string $status): string
    {
        $id = (string) Str::uuid();
        DB::table('requests')->insert(['id' => $id, 'status' => $status]);

        return $id;
    }

    private function insertApprovalProfile(ApprovalActor $actor): void
    {
        DB::table('profiles')->insert([
            'id' => $actor->id,
            'role' => $actor->role,
            'is_active' => true,
            'seatalk_employee_code' => $actor->employeeCode,
        ]);
    }
}
