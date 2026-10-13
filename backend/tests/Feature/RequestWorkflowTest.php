<?php

namespace Tests\Feature;

use App\Features\Requests\RequestAuthorizer;
use App\Features\Requests\RequestController;
use App\Features\Requests\RequestRepository;
use App\Features\Requests\RequestService;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PDO;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class RequestWorkflowTest extends TestCase
{
    private RequestRepository $repository;

    private RequestService $service;

    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for isolated request workflow tests.');
        }
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        $this->createSchema();
        $authorizer = new RequestAuthorizer;
        $this->repository = new RequestRepository($authorizer);
        $this->service = new RequestService($this->repository, $authorizer);
    }

    public function test_fte_ops_can_edit_a_pending_request(): void
    {
        $request = $this->insertRequest(['status' => 'PENDING']);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];

        $updated = $this->service->updateDetails($request->id, $actor, [
            'cluster' => 'SOC 6',
            'region' => 'NCR',
            'dock_no' => 'D-12',
            'backlogs' => 42,
            'truck_size' => '10W',
            'truck_type' => 'DRYLEASE',
        ]);

        $this->assertSame('SOC 6', $updated->cluster);
        $this->assertSame('PENDING', $updated->status);
        $this->assertSame('PENDING', $updated->approval_status);
        $this->assertDatabaseHas('request_events', ['request_id' => $request->id, 'event_type' => 'REQUEST_EDITED']);
        $this->assertDatabaseHas('notifications', [
            'request_id' => $request->id,
            'user_id' => $request->created_by,
            'event_type' => 'REQUEST_EDITED',
        ]);
    }

    public function test_fte_ops_rejection_records_the_return_role(): void
    {
        $request = $this->insertRequest(['status' => 'PENDING']);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];

        $this->insertProfile($actor);
        $updated = $this->service->transition($request->id, $actor, 'reject-ops', ['rejection_remarks' => 'Correct the dock']);

        $this->assertSame('REJECTED', $updated->status);
        $this->assertSame('ops_pic', $updated->rejection_return_role);
        $this->assertSame('REJECTED', $updated->approval_status);
        $this->assertDatabaseHas('request_events', ['request_id' => $request->id, 'event_type' => 'REQUEST_REJECTED_BY_OPS']);
    }

    public function test_request_list_filters_by_plate_and_date(): void
    {
        $this->insertRequest(['plate_number' => 'ABC-1234', 'request_timestamp' => '2026-06-15 08:00:00']);
        $this->insertRequest(['plate_number' => 'XYZ-9000', 'request_timestamp' => '2026-05-10 08:00:00']);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];

        $result = $this->repository->paginate($actor, [
            'search' => 'abc',
            'date_from' => '2026-06-01',
            'date_to' => '2026-06-30',
            'sort' => 'plate_number',
            'direction' => 'asc',
            'per_page' => 20,
        ]);

        $this->assertSame(1, $result->total());
        $this->assertSame('ABC-1234', $result->items()[0]->plate_number);
    }

    public function test_action_queue_is_bounded_role_scoped_and_cursor_paginated(): void
    {
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $first = $this->insertRequest(['status' => 'PENDING', 'created_at' => '2026-06-30 08:00:00', 'updated_at' => '2026-06-30 08:00:00']);
        $second = $this->insertRequest(['status' => 'REJECTED', 'rejection_return_role' => 'fte_ops', 'created_at' => '2026-06-30 09:00:00', 'updated_at' => '2026-06-30 09:00:00']);
        $this->insertRequest(['status' => 'REJECTED', 'rejection_return_role' => 'ops_pic', 'created_at' => '2026-06-30 10:00:00', 'updated_at' => '2026-06-30 10:00:00']);

        $firstPage = $this->repository->queue($actor, 1);

        $this->assertCount(1, $firstPage['data']);
        $this->assertSame($second->id, $firstPage['data'][0]->id);
        $this->assertTrue($firstPage['has_more']);
        $this->assertNotNull($firstPage['next_cursor']);

        $secondPage = $this->repository->queue($actor, 1, $firstPage['next_cursor']);

        $this->assertSame($first->id, $secondPage['data'][0]->id);
        $this->assertFalse($secondPage['has_more']);
        $this->assertNull($secondPage['next_cursor']);
    }

    public function test_queue_endpoint_returns_bounded_cursor_contract(): void
    {
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];
        $this->insertRequest(['status' => 'REQUESTED']);
        $request = Request::create('/api/requests/queue?limit=1');
        $request->attributes->set('actor', $actor);

        $response = (new RequestController($this->repository, $this->service))->queue($request);
        $payload = $response->getData(true);

        $this->assertSame(['data', 'has_more', 'next_cursor', 'limit'], array_keys($payload));
        $this->assertSame(1, $payload['limit']);
        $this->assertCount(1, $payload['data']);
    }

    public function test_fte_mm_sees_a_requested_handoff_as_requested(): void
    {
        $request = $this->insertRequest(['status' => 'REQUESTED']);
        $midmile = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];
        $ops = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $this->insertProfile($midmile);
        $this->insertProfile($ops);

        $midmileRequests = $this->repository->paginate($midmile, ['status' => 'REQUESTED']);
        $opsRequests = $this->repository->paginate($ops, ['status' => 'REQUESTED']);

        $this->assertSame($request->id, $midmileRequests->items()[0]->id);
        $this->assertSame('REQUESTED', $midmileRequests->items()[0]->status);
        $this->assertSame('REQUESTED', $opsRequests->items()[0]->status);
    }

    public function test_fte_mm_rejection_returns_to_ops_for_editing_and_reapproval(): void
    {
        $request = $this->insertRequest(['status' => 'REQUESTED']);
        $midmile = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];
        $ops = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $this->insertProfile($midmile);
        $this->insertProfile($ops);

        $updated = $this->service->transition($request->id, $midmile, 'reject-mm', [
            'rejection_remarks' => 'No truck available',
        ]);

        $this->assertSame('REJECTED', $updated->status);
        $this->assertSame('fte_ops', $updated->rejection_return_role);
        $this->assertSame('REJECTED', $this->repository->findVisible($request->id, $ops)->status);
        $this->assertDatabaseHas('notifications', ['request_id' => $request->id, 'target_role' => 'fte_ops']);

        $corrected = $this->service->updateDetails($request->id, $ops, ['cluster' => 'SOC 6']);
        $this->assertSame('PENDING', $corrected->status);
        $this->assertSame('PENDING', $corrected->approval_status);
        $this->assertNull($corrected->rejection_return_role);
        $this->assertDatabaseHas('request_events', ['request_id' => $request->id, 'event_type' => 'REQUEST_REJECTED_BY_MM', 'to_status' => 'REJECTED']);

        $approved = $this->service->transition($request->id, $ops, 'approve', []);
        $this->assertSame('REQUESTED', $approved->status);
        $this->assertSame($ops->id, $approved->approved_by);
    }

    public function test_rejected_canonical_state_is_preserved_for_every_role(): void
    {
        $request = $this->insertRequest(['status' => 'PENDING']);
        $opsPic = (object) ['id' => $request->created_by, 'role' => 'ops_pic'];
        $fteOps = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $fteMm = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];
        $docOfficer = (object) ['id' => (string) Str::uuid(), 'role' => 'doc_officer'];

        $this->insertProfile($fteOps);
        $this->service->transition($request->id, $fteOps, 'reject-ops', ['rejection_remarks' => 'Correct the dock']);

        foreach ([$opsPic, $fteOps, $fteMm, $docOfficer] as $actor) {
            $read = $this->repository->findVisible($request->id, $actor);
            $this->assertSame('REJECTED', $read->status);
            $this->assertSame('REJECTED', $read->display_status);
            $this->assertSame('ops_pic', $read->next_action_role);
        }

    }

    public function test_analytics_applies_date_filters(): void
    {
        $this->insertRequest(['truck_size' => '4W', 'request_timestamp' => '2026-06-15 08:00:00']);
        $this->insertRequest(['truck_size' => '10W', 'request_timestamp' => '2026-05-15 08:00:00']);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];

        $result = $this->repository->analytics($actor, [
            'date_from' => '2026-06-01',
            'date_to' => '2026-06-30',
        ]);

        $this->assertSame(1, (int) $result['truck_sizes']['4W']);
        $this->assertArrayNotHasKey('10W', $result['truck_sizes']->all());
    }

    public function test_analytics_returns_dwell_and_waiting_averages_from_milestone_timestamps(): void
    {
        $this->insertRequest([
            'request_timestamp' => '2026-06-15 08:00:00',
            'provide_time' => '2026-06-15 08:30:00',
            'linehaul_trip_at' => '2026-06-15 10:00:00',
        ]);
        $this->insertRequest([
            'request_timestamp' => '2026-06-15 09:00:00',
            'provide_time' => '2026-06-15 10:00:00',
            'linehaul_trip_at' => '2026-06-15 12:00:00',
        ]);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];

        $result = $this->repository->analytics($actor, [
            'date_from' => '2026-06-01',
            'date_to' => '2026-06-30',
        ]);

        $this->assertSame(45.0, $result['average_waiting_minutes']);
        $this->assertSame(150.0, $result['average_dwell_minutes']);
    }

    public function test_non_postgres_date_filters_use_the_business_timezone(): void
    {
        config()->set('app.business_timezone', 'Asia/Manila');
        $this->insertRequest(['request_timestamp' => '2026-05-31 16:30:00']);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];

        $result = $this->repository->paginate($actor, [
            'date_from' => '2026-06-01',
            'date_to' => '2026-06-01',
        ]);

        $this->assertSame(1, $result->total());
    }

    public function test_docking_assignment_notifies_doc_officer(): void
    {
        $request = $this->insertRequest(['status' => 'REQUESTED']);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];

        $this->service->transition($request->id, $actor, 'assign-truck', ['plate_number' => 'ABC-123']);

        $this->assertDatabaseHas('notifications', ['request_id' => $request->id, 'target_role' => 'doc_officer']);
        $this->assertDatabaseHas('request_events', [
            'request_id' => $request->id,
            'event_type' => 'TRUCK_ASSIGNED',
            'from_status' => 'REQUESTED',
            'to_status' => 'DOCKING',
        ]);
        $this->assertSame('DOCKING', DB::table('requests')->where('id', $request->id)->value('status'));
        $this->assertNotNull(DB::table('requests')->where('id', $request->id)->value('provide_time'));
    }

    public function test_request_becomes_docked_only_after_driver_and_trip_are_present(): void
    {
        $docOfficer = (object) ['id' => (string) Str::uuid(), 'role' => 'doc_officer'];
        $opsPic = (object) ['id' => (string) Str::uuid(), 'role' => 'ops_pic'];
        $request = $this->insertRequest(['status' => 'DOCKING', 'created_by' => $opsPic->id]);

        $this->service->transition($request->id, $docOfficer, 'mark-docked', ['driver_id' => ' 00123 ']);
        $this->assertSame('00123', DB::table('requests')->where('id', $request->id)->value('driver_id'));
        $this->assertSame('DOCKING', DB::table('requests')->where('id', $request->id)->value('status'));
        $this->assertNotNull(DB::table('requests')->where('id', $request->id)->value('driver_assigned_at'));
        $this->assertDatabaseHas('notifications', [
            'request_id' => $request->id,
            'user_id' => $opsPic->id,
            'event_type' => 'DRIVER_ASSIGNED',
        ]);

        $this->service->transition($request->id, $opsPic, 'mark-docked', ['linehaul_trip_no' => 'LH-1']);
        $this->assertSame('DOCKED', DB::table('requests')->where('id', $request->id)->value('status'));
        $this->assertDatabaseHas('request_events', [
            'request_id' => $request->id,
            'event_type' => 'TRUCK_DOCKED',
            'from_status' => 'DOCKING',
            'to_status' => 'DOCKED',
        ]);
        $this->assertNotNull(DB::table('requests')->where('id', $request->id)->value('linehaul_trip_at'));
    }

    public function test_driver_assignment_rejects_non_digits_or_more_than_ten_digits(): void
    {
        $docOfficer = (object) ['id' => (string) Str::uuid(), 'role' => 'doc_officer'];
        foreach (['', '12A', '12345678901'] as $driverId) {
            $request = $this->insertRequest(['status' => 'DOCKING']);
            try {
                $this->service->transition($request->id, $docOfficer, 'mark-docked', ['driver_id' => $driverId]);
                $this->fail('Invalid Driver ID should be rejected.');
            } catch (ValidationException) {
                $this->assertNull(DB::table('requests')->where('id', $request->id)->value('driver_id'));
            }
        }
    }

    public function test_driver_assignment_cannot_overwrite_without_explicit_reassignment(): void
    {
        $request = $this->insertRequest(['status' => 'DOCKING', 'driver_id' => '123']);
        $docOfficer = (object) ['id' => (string) Str::uuid(), 'role' => 'doc_officer'];

        try {
            $this->service->transition($request->id, $docOfficer, 'mark-docked', ['driver_id' => '456']);
            $this->fail('An existing Driver ID must not be overwritten through assignment.');
        } catch (HttpException $exception) {
            $this->assertSame(409, $exception->getStatusCode());
        }

        $updated = $this->service->transition($request->id, $docOfficer, 'reassign-driver', ['driver_id' => '456']);
        $this->assertSame('456', $updated->driver_id);
        $this->assertDatabaseHas('request_events', ['request_id' => $request->id, 'event_type' => 'DRIVER_REASSIGNED']);
    }

    public function test_non_owner_ops_pic_cannot_mark_request_docked(): void
    {
        $request = $this->insertRequest(['status' => 'DOCKING', 'created_by' => (string) Str::uuid()]);
        $opsPic = (object) ['id' => (string) Str::uuid(), 'role' => 'ops_pic'];

        try {
            $this->service->transition($request->id, $opsPic, 'mark-docked', ['linehaul_trip_no' => 'LH-1']);
            $this->fail('A non-owner Ops PIC should not be able to dock the request.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }

        $this->assertNull(DB::table('requests')->where('id', $request->id)->value('linehaul_trip_no'));
    }

    public function test_docking_transition_ignores_fields_owned_by_another_workflow_step(): void
    {
        $request = $this->insertRequest(['status' => 'DOCKING', 'truck_type' => 'WETLEASE', 'driver_id' => 'DRV-1']);
        $opsPic = (object) ['id' => $request->created_by, 'role' => 'ops_pic'];

        $updated = $this->service->transition($request->id, $opsPic, 'mark-docked', [
            'linehaul_trip_no' => 'LH-1',
            'truck_type' => 'DRYLEASE',
        ]);

        $this->assertSame('DOCKED', $updated->status);
        $this->assertSame('WETLEASE', $updated->truck_type);
    }

    public function test_disallowed_docking_field_cannot_complete_the_transition(): void
    {
        $opsPic = (object) ['id' => (string) Str::uuid(), 'role' => 'ops_pic'];
        $request = $this->insertRequest(['status' => 'DOCKING', 'created_by' => $opsPic->id]);

        $this->expectException(ValidationException::class);
        $this->service->transition($request->id, $opsPic, 'mark-docked', [
            'linehaul_trip_no' => 'LH-1',
            'driver_id' => 'DRV-INJECTED',
        ]);
    }

    public function test_pic_can_correct_their_rejected_request_but_ops_cannot_take_over(): void
    {
        $fteOps = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $this->insertProfile($fteOps);
        $request = $this->insertRequest();
        $this->service->transition($request->id, $fteOps, 'reject-ops', ['rejection_remarks' => 'Wrong dock']);

        try {
            $this->service->updateDetails($request->id, $fteOps, ['dock_no' => 'D-99']);
            $this->fail('Only the owning PIC may correct this rejection.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }

        $pic = (object) ['id' => $request->created_by, 'role' => 'ops_pic'];
        $updated = $this->service->updateDetails($request->id, $pic, ['dock_no' => 'D-02']);
        $this->assertSame('PENDING', $updated->status);
        $this->assertSame('D-02', $updated->dock_no);
        $this->assertDatabaseHas('notifications', ['request_id' => $request->id, 'event_type' => 'REQUEST_RESUBMITTED', 'target_role' => 'fte_ops']);
        $event = DB::table('request_events')->where('event_type', 'REQUEST_RESUBMITTED')->first();
        $this->assertSame('REJECTED', $event->from_status);
        $this->assertSame('PENDING', $event->to_status);
        $this->assertSame('Wrong dock', json_decode($event->metadata, true)['previous_rejection_remarks']);
    }

    public function test_web_ops_rejection_requires_a_reason(): void
    {
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $this->insertProfile($actor);
        $request = $this->insertRequest();
        $this->expectException(ValidationException::class);
        $this->service->transition($request->id, $actor, 'reject-ops', []);
    }

    public function test_cancellation_is_available_at_the_responsible_fte_stage_and_preserves_remarks(): void
    {
        foreach (['fte_ops' => 'PENDING', 'fte_mm' => 'REQUESTED'] as $role => $status) {
            $request = $this->insertRequest(['status' => $status]);
            $actor = (object) ['id' => (string) Str::uuid(), 'role' => $role];
            $updated = $this->service->transition($request->id, $actor, 'cancel', ['cancellation_remarks' => '  Duplicate request  ']);
            $this->assertSame('CANCELLED', $updated->status);
            $this->assertSame('CANCELLED', $updated->approval_status);
            $this->assertSame('Duplicate request', $updated->cancellation_remarks);
            $this->assertDatabaseHas('request_events', ['request_id' => $request->id, 'actor_id' => $actor->id, 'event_type' => 'REQUEST_CANCELLED']);
            $pic = (object) ['id' => $request->created_by, 'role' => 'ops_pic'];
            $this->assertSame('Duplicate request', $this->repository->findVisible($request->id, $pic)->cancellation_remarks);
        }
    }

    public function test_mm_cancellation_requires_remarks_and_cannot_cancel_another_stage(): void
    {
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];
        $request = $this->insertRequest(['status' => 'REQUESTED']);
        try {
            $this->service->transition($request->id, $actor, 'cancel', ['cancellation_remarks' => '   ']);
            $this->fail('FTE MM cancellation requires remarks.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('cancellation_remarks', $exception->errors());
        }
        $this->assertDatabaseHas('requests', ['id' => $request->id, 'status' => 'REQUESTED']);
        $this->assertDatabaseCount('request_events', 0);

        $pending = $this->insertRequest();
        try {
            $this->service->transition($pending->id, $actor, 'cancel', ['cancellation_remarks' => 'Not mine']);
            $this->fail('FTE MM cannot cancel a request awaiting OPS FTE.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
    }

    public function test_pic_can_edit_docked_details_without_restarting_workflow(): void
    {
        $request = $this->insertRequest(['status' => 'DOCKED', 'driver_id' => '12345', 'linehaul_trip_no' => 'LH-1']);
        $actor = (object) ['id' => $request->created_by, 'role' => 'ops_pic'];
        $updated = $this->service->updateDetails($request->id, $actor, ['dock_no' => 'D-02', 'status' => 'PENDING', 'driver_id' => '999']);
        $this->assertSame('DOCKED', $updated->status);
        $this->assertSame('12345', $updated->driver_id);
        $this->assertSame('LH-1', $updated->linehaul_trip_no);
        $this->assertSame('D-02', $updated->dock_no);
        $this->assertDatabaseHas('request_events', ['request_id' => $request->id, 'event_type' => 'REQUEST_EDITED_AFTER_DOCKED', 'from_status' => 'DOCKED', 'to_status' => 'DOCKED']);
        $metadata = json_decode(DB::table('request_events')->where('request_id', $request->id)->value('metadata'), true);
        $this->assertSame('D-01', $metadata['previous_values']['dock_no'] ?? null);
        $this->assertSame('D-02', $metadata['changes']['dock_no']);
        foreach (['fte_ops', 'fte_mm', 'doc_officer'] as $role) {
            $this->assertDatabaseHas('notifications', ['request_id' => $request->id, 'target_role' => $role, 'event_type' => 'REQUEST_EDITED_AFTER_DOCKED']);
        }
    }

    public function test_non_owner_pic_cannot_edit_docked_or_rejected_requests(): void
    {
        foreach (['DOCKED', 'REJECTED'] as $status) {
            $request = $this->insertRequest(['status' => $status, 'rejection_return_role' => $status === 'REJECTED' ? 'ops_pic' : null]);
            $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'ops_pic'];
            try {
                $this->service->updateDetails($request->id, $actor, ['dock_no' => 'D-99']);
                $this->fail('A non-owner PIC must not edit the request.');
            } catch (HttpException $exception) {
                $this->assertSame(403, $exception->getStatusCode());
            }
            $this->assertDatabaseHas('requests', ['id' => $request->id, 'dock_no' => 'D-01', 'status' => $status]);
        }
    }

    public function test_notification_failure_rolls_back_cancellation_and_audit_event(): void
    {
        $request = $this->insertRequest(['status' => 'REQUESTED']);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];
        Schema::drop('notifications');
        try {
            $this->service->transition($request->id, $actor, 'cancel', ['cancellation_remarks' => 'No truck']);
            $this->fail('A failed notification write must abort the transaction.');
        } catch (QueryException) {
            $this->assertDatabaseHas('requests', ['id' => $request->id, 'status' => 'REQUESTED', 'cancellation_remarks' => null]);
            $this->assertDatabaseCount('request_events', 0);
        }
    }

    public function test_mm_assignment_has_a_separate_display_status_without_changing_canonical_state(): void
    {
        $request = $this->insertRequest(['status' => 'DOCKING']);
        $mm = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];
        $doc = (object) ['id' => (string) Str::uuid(), 'role' => 'doc_officer'];
        $mmRead = $this->repository->findVisible($request->id, $mm);
        $docRead = $this->repository->findVisible($request->id, $doc);
        $this->assertSame('DOCKING', $mmRead->status);
        $this->assertSame('ASSIGNED', $mmRead->display_status);
        $this->assertSame('DOCKING', $docRead->display_status);
        $this->assertSame('doc_officer', $docRead->next_action_role);
        $this->assertSame(1, $this->repository->metrics($mm)['DOCKING']);
    }

    public function test_rejected_requests_are_counted_as_awaiting_action(): void
    {
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $this->insertRequest(['status' => 'REJECTED', 'rejection_return_role' => 'fte_ops']);
        $httpRequest = Request::create('/api/requests/metrics');
        $httpRequest->attributes->set('actor', $actor);
        $response = (new RequestController($this->repository, $this->service))->metrics($httpRequest)->getData(true);
        $this->assertSame(1, $response['awaiting_action']);
        $this->assertSame(1, $response['by_status']['REJECTED']);
    }

    public function test_dashboard_summary_combines_metrics_and_analytics_under_one_filter_contract(): void
    {
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $this->insertRequest(['status' => 'PENDING', 'request_timestamp' => '2026-06-30 08:00:00']);
        $httpRequest = Request::create('/api/requests/summary', 'GET', [
            'date_from' => '2026-06-30',
            'date_to' => '2026-06-30',
        ]);
        $httpRequest->attributes->set('actor', $actor);

        $response = (new RequestController($this->repository, $this->service))->summary($httpRequest)->getData(true);

        $this->assertSame(1, $response['metrics']['total']);
        $this->assertSame(1, $response['metrics']['by_status']['PENDING']);
        $this->assertArrayHasKey('truck_sizes', $response['analytics']);
        $this->assertArrayHasKey('hourly', $response['analytics']);
    }

    public function test_old_release_column_cache_does_not_hide_new_workflow_metadata(): void
    {
        Cache::put('requests:approval-columns:v1', ['approval_status', 'approved_by', 'approved_at', 'approval_source', 'rejected_by', 'rejected_at', 'approval_version', 'approval_correlation_id'], 300);
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_ops'];
        $request = $this->insertRequest(['status' => 'REJECTED', 'rejection_return_role' => 'fte_ops', 'cancellation_remarks' => 'Historical remarks']);
        $read = $this->repository->findVisible($request->id, $actor);
        $this->assertSame('fte_ops', $read->next_action_role);
        $this->assertSame('Historical remarks', $read->cancellation_remarks);
    }

    private function insertRequest(array $overrides = []): object
    {
        $id = (string) Str::uuid();
        DB::table('requests')->insert(array_merge([
            'id' => $id,
            'request_timestamp' => '2026-06-30 08:00:00',
            'cluster' => 'SOC 5',
            'region' => 'NCR',
            'dock_no' => 'D-01',
            'backlogs' => 10,
            'truck_size' => '6W',
            'truck_type' => 'WETLEASE',
            'plate_number' => null,
            'driver_assigned_at' => null,
            'linehaul_trip_at' => null,
            'status' => 'PENDING',
            'created_by' => (string) Str::uuid(),
            'created_at' => '2026-06-30 08:00:00',
            'updated_at' => '2026-06-30 08:00:00',
        ], $overrides));

        return DB::table('requests')->where('id', $id)->first();
    }

    public function test_request_reads_attribute_workflow_actors_instead_of_the_creator(): void
    {
        $creator = (object) ['id' => (string) Str::uuid(), 'role' => 'ops_pic'];
        $mm = (object) ['id' => (string) Str::uuid(), 'role' => 'fte_mm'];
        $doc = (object) ['id' => (string) Str::uuid(), 'role' => 'doc_officer'];
        foreach ([$creator, $mm, $doc] as $actor) {
            $this->insertProfile($actor);
        }
        DB::table('profiles')->where('id', $mm->id)->update(['name' => 'MM Assigner']);
        DB::table('profiles')->where('id', $doc->id)->update(['name' => 'Driver Assigner']);
        $request = $this->insertRequest(['created_by' => $creator->id, 'status' => 'REQUESTED']);
        $this->service->transition($request->id, $mm, 'assign-truck', ['plate_number' => 'ABC-123']);
        $this->service->transition($request->id, $doc, 'mark-docked', ['driver_id' => '123']);
        $this->service->transition($request->id, $creator, 'mark-docked', ['linehaul_trip_no' => 'LH-1']);

        $detail = $this->repository->findVisible($request->id, $creator);
        $list = $this->repository->paginate($creator, [])->items()[0];
        foreach ([$detail, $list] as $read) {
            $this->assertSame($mm->id, $read->mm_fte_id ?? null);
            $this->assertSame('MM Assigner', $read->mm_fte_name ?? null);
            $this->assertSame($doc->id, $read->doc_officer_id ?? null);
            $this->assertSame('Driver Assigner', $read->doc_officer_name ?? null);
            $this->assertSame($creator->id, $read->created_by);
        }
    }

    public function test_missing_actor_events_are_returned_as_null_without_creator_fallback(): void
    {
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'ops_pic'];
        $request = $this->insertRequest(['created_by' => $actor->id]);
        $read = $this->repository->findVisible($request->id, $actor);
        foreach (['mm_fte_id', 'mm_fte_name', 'doc_officer_id', 'doc_officer_name'] as $field) {
            $this->assertTrue(property_exists($read, $field));
            $this->assertNull($read->{$field});
        }
    }

    public function test_latest_attribution_event_wins_with_a_deterministic_tie_break(): void
    {
        $actor = (object) ['id' => (string) Str::uuid(), 'role' => 'ops_pic'];
        $request = $this->insertRequest(['created_by' => $actor->id]);
        $old = (string) Str::uuid();
        $latest = (string) Str::uuid();
        foreach ([$old, $latest, null] as $index => $actorId) {
            DB::table('request_events')->insert([
                'request_id' => $request->id, 'event_type' => $index === 2 ? 'TRUCK_DOCKED' : 'TRUCK_ASSIGNED',
                'actor_id' => $actorId, 'metadata' => '{}', 'created_at' => '2026-10-13 00:00:00',
            ]);
        }
        $read = $this->repository->findVisible($request->id, $actor);
        $this->assertSame($latest, $read->mm_fte_id ?? null);
        $this->assertNull($read->mm_fte_name);
        $this->assertNull($read->doc_officer_id);

        DB::table('request_events')->insert([
            'request_id' => $request->id, 'event_type' => 'TRUCK_ASSIGNED', 'actor_id' => null,
            'metadata' => '{}', 'created_at' => '2026-10-13 00:00:01',
        ]);
        $latestRead = $this->repository->findVisible($request->id, $actor);
        $this->assertNull($latestRead->mm_fte_id);
        $this->assertNull($latestRead->mm_fte_name);
    }

    private function createSchema(): void
    {
        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name')->nullable();
            $table->string('role')->nullable();
            $table->boolean('is_active')->default(true);
        });
        Schema::create('requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->dateTime('request_timestamp');
            $table->string('cluster');
            $table->string('region');
            $table->string('dock_no');
            $table->integer('backlogs');
            $table->dateTime('backlogs_timestamp')->nullable();
            $table->string('ob_fte')->nullable();
            $table->string('truck_size');
            $table->string('truck_type');
            $table->string('plate_number')->nullable();
            $table->dateTime('provide_time')->nullable();
            $table->string('linehaul_trip_no')->nullable();
            $table->dateTime('docked_time')->nullable();
            $table->string('status');
            $table->text('rejection_remarks')->nullable();
            $table->string('rejection_return_role')->nullable();
            $table->text('cancellation_remarks')->nullable();
            $table->string('approval_status')->default('PENDING');
            $table->uuid('approved_by')->nullable();
            $table->string('approval_source')->nullable();
            $table->uuid('rejected_by')->nullable();
            $table->unsignedBigInteger('approval_version')->default(0);
            $table->uuid('approval_correlation_id')->nullable();
            $table->string('driver_id')->nullable();
            $table->dateTime('driver_assigned_at')->nullable();
            $table->dateTime('linehaul_trip_at')->nullable();
            $table->uuid('created_by');
            $table->dateTime('approved_at')->nullable();
            $table->dateTime('rejected_at')->nullable();
            $table->dateTime('confirmed_at')->nullable();
            $table->timestamps();
        });
        Schema::create('request_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_id');
            $table->string('event_type');
            $table->uuid('actor_id')->nullable();
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
    }

    private function insertProfile(object $actor): void
    {
        DB::table('profiles')->insert([
            'id' => $actor->id,
            'role' => $actor->role,
            'is_active' => true,
        ]);
    }
}
