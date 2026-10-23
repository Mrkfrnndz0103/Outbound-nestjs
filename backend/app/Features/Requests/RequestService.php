<?php

namespace App\Features\Requests;

use App\Features\Approvals\ApprovalActor;
use App\Features\Approvals\ApprovalItemProvisioner;
use App\Features\Approvals\ApprovalRouter;
use App\Features\Approvals\ApprovalService;
use App\Features\Approvals\ApprovalSource;
use App\Features\Outbox\WorkflowGoogleSheetsOutbox;
use App\Features\Outbox\WorkflowNotificationOutbox;
use App\Features\Outbox\WorkflowOutboxDispatcher;
use App\Features\Outbox\WorkflowOutboxRepository;
use App\Features\Outbox\WorkflowOutboxWriter;
use App\Features\Outbox\WorkflowSeaTalkOutbox;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class RequestService
{
    public function __construct(
        private RequestRepository $requests,
        private RequestAuthorizer $authorizer,
        ?ApprovalService $approvals = null,
        ?ApprovalItemProvisioner $provisioner = null,
        ?WorkflowNotificationOutbox $notifications = null,
        ?WorkflowSeaTalkOutbox $seatalk = null,
        ?WorkflowGoogleSheetsOutbox $sheets = null,
    ) {
        $this->approvals = $approvals ?? new ApprovalService($requests, $authorizer);
        $this->provisioner = $provisioner;
        $this->approvalRouter = $provisioner !== null ? new ApprovalRouter($provisioner) : null;
        $this->notifications = $notifications ?? new WorkflowNotificationOutbox(
            new WorkflowOutboxWriter(new WorkflowOutboxRepository),
            new WorkflowOutboxDispatcher,
        );
        $this->seatalk = $seatalk ?? new WorkflowSeaTalkOutbox(
            new WorkflowOutboxWriter(new WorkflowOutboxRepository),
            new WorkflowOutboxDispatcher,
            $provisioner,
        );
        $this->sheets = $sheets ?? new WorkflowGoogleSheetsOutbox(
            new WorkflowOutboxWriter(new WorkflowOutboxRepository),
            new WorkflowOutboxRepository,
            new WorkflowOutboxDispatcher,
        );
    }

    private ApprovalService $approvals;

    private ?ApprovalItemProvisioner $provisioner;

    private ?ApprovalRouter $approvalRouter;

    private WorkflowNotificationOutbox $notifications;

    private WorkflowSeaTalkOutbox $seatalk;

    private WorkflowGoogleSheetsOutbox $sheets;

    public function create(object $actor, array $data): object
    {
        abort_unless(in_array($actor->role, ['ops_pic', 'fte_ops'], true), 403);

        return DB::transaction(function () use ($actor, $data) {
            $request = $this->requests->insert($data + ['id' => (string) Str::uuid(), 'created_by' => $actor->id, 'status' => 'PENDING']);
            $eventId = $this->event($request->id, $actor->id, 'REQUEST_CREATED', null, 'PENDING', [
                'lh_type_request' => $data['truck_type'] ?? null,
            ]);
            $this->notify($request->id, 'fte_ops', 'REQUEST_CREATED', 'New request', 'A truck request needs review.', $eventId);
            if ($this->provisioner !== null) {
                DB::afterCommit(function () use ($request, $eventId): void {
                    if ($this->approvalRouter !== null && (bool) config('services.seatalk.approval.enabled', false)) {
                        $this->approvalRouter->assignNext((string) $request->id);

                        return;
                    }

                    $this->seatalk->provision((string) $request->id, 'event:'.$eventId);
                });
            }

            return $request;
        });
    }

    public function updateDetails(string $id, object $actor, array $data): object
    {
        return DB::transaction(function () use ($id, $actor, $data) {
            $request = $this->requests->lock($id);
            abort_unless($this->authorizer->canEdit($actor, $request), 403, 'You cannot edit this request at its current workflow stage.');
            $remarks = trim((string) ($data['edit_remarks'] ?? ''));
            if (($actor->role === 'fte_ops' && $remarks === '') || mb_strlen($remarks) > 2000) {
                throw ValidationException::withMessages(['edit_remarks' => 'Edit remarks are required for FTE OPS and must not exceed 2000 characters.']);
            }
            $fields = array_intersect_key($data, array_flip([
                'cluster', 'region', 'dock_no', 'backlogs', 'backlogs_timestamp', 'truck_size', 'truck_type',
            ]));
            $to = $request->status;
            $event = $to === 'DOCKED' ? 'REQUEST_EDITED_AFTER_DOCKED' : 'REQUEST_EDITED';
            $metadata = [
                'changes' => $fields,
                'previous_values' => array_intersect_key((array) $request, $fields),
                'source' => 'WEB',
                'edit_remarks' => $remarks !== '' ? $remarks : null,
            ];

            if ($request->status === 'REJECTED') {
                $to = 'PENDING';
                $event = 'REQUEST_RESUBMITTED';
                $metadata['previous_rejection_remarks'] = $request->rejection_remarks;
                $metadata['previous_rejected_by'] = $request->rejected_by;
                $metadata['previous_return_role'] = $request->rejection_return_role;
                $fields += [
                    'approval_status' => 'PENDING',
                    'rejection_return_role' => null,
                    'approval_source' => 'WEB',
                    'approval_version' => DB::raw('COALESCE(approval_version, 0) + 1'),
                    'approval_correlation_id' => (string) Str::uuid(),
                ];
            }

            $updated = $this->requests->update($id, $fields + ['status' => $to]);
            $eventId = $this->event($id, $actor->id, $event, $request->status, $to, $metadata);
            if ($to === 'DOCKED') {
                foreach (['fte_ops', 'fte_mm', 'doc_officer'] as $role) {
                    $this->notify($id, $role, $event, 'Docked request updated', "Request {$id} was updated by OPS PIC.", $eventId);
                }
            } else {
                $this->notify($id, 'fte_ops', $event, 'Request needs review', "Request {$id} was updated and needs OPS FTE review.", $eventId);
                $this->notifyUser($id, $request->created_by, $event, 'Request updated', "Request {$id} was updated.", $eventId);
                if ($event === 'REQUEST_RESUBMITTED'
                    && $this->approvalRouter !== null
                    && (bool) config('services.seatalk.approval.enabled', false)) {
                    DB::afterCommit(function () use ($id): void {
                        $this->approvalRouter?->assignNext($id);
                    });
                } else {
                    $this->approvals->synchronizeAfterCommit($id, $eventId);
                }
            }

            return $updated;
        });
    }

    public function transition(string $id, object $actor, string $action, array $input): object
    {
        if ($action === 'approve') {
            return $this->approvals->approve($id, ApprovalActor::fromObject($actor), ApprovalSource::Web)->request;
        }

        if (in_array($action, ['reject-ops', 'reject-mm'], true)) {
            abort_unless($actor->role === ($action === 'reject-ops' ? 'fte_ops' : 'fte_mm'), 403);

            return $this->approvals->reject(
                $id,
                ApprovalActor::fromObject($actor),
                ApprovalSource::Web,
                null,
                (string) ($input['rejection_remarks'] ?? ''),
            )->request;
        }

        if ($action === 'cancel') {
            return $this->cancel($id, $actor, $input);
        }

        if ($action === 'reassign-driver' || ($action === 'mark-docked' && $actor->role === 'doc_officer')) {
            return $this->assignDriver($id, $actor, $action, $input);
        }

        return DB::transaction(function () use ($id, $actor, $action, $input) {
            $request = $this->requests->lock($id);
            [$from, $to, $event] = match ($action) {
                'assign-truck' => [['REQUESTED'], 'DOCKING', 'TRUCK_ASSIGNED'],
                'mark-docked' => [['DOCKING'], 'DOCKED', 'TRUCK_DOCKED'],
                default => throw ValidationException::withMessages(['action' => 'Unknown action.']),
            };
            abort_unless(in_array($request->status, $from, true), 409, "Cannot {$action} a {$request->status} request.");
            abort_unless($this->authorizer->canTransition($actor, $action, $request), 403);
            if ($action === 'assign-truck' && blank($input['plate_number'] ?? null)) {
                throw ValidationException::withMessages(['plate_number' => 'Plate number is required.']);
            }
            if ($action === 'mark-docked' && blank($request->driver_id)) {
                throw ValidationException::withMessages(['driver_id' => 'Driver ID is required before entering the linehaul trip number.']);
            }

            $allowedFields = match ($action) {
                'assign-truck' => ['plate_number', 'provide_time', 'truck_size', 'truck_type'],
                'mark-docked' => ['linehaul_trip_no'],
                default => [],
            };
            $fields = array_intersect_key($input, array_flip($allowedFields));
            if ($action === 'assign-truck') {
                $fields['provide_time'] = now();
            }
            if ($action === 'mark-docked') {
                $fields['linehaul_trip_at'] = now();
            }
            $fields['status'] = $to;
            if ($to === 'DOCKED' && blank($fields['docked_time'] ?? null)) {
                $fields['docked_time'] = now();
            }
            $updated = $this->requests->update($id, $fields);
            $eventId = $this->event($id, $actor->id, $event, $request->status, $to, $fields);
            if ($to === 'DOCKED') {
                $this->approvals->closeAssignments($id, strtolower($event));
                $this->approvals->synchronizeAfterCommit($id, $eventId);
            }
            $target = match ($to) {
                'DOCKING' => 'doc_officer', default => null
            };
            if ($target) {
                $this->notify($id, $target, $event, str_replace('_', ' ', $event), "Request {$id} is now {$to}.", $eventId);
            }

            return $updated;
        });
    }

    private function assignDriver(string $id, object $actor, string $action, array $input): object
    {
        return DB::transaction(function () use ($id, $actor, $action, $input) {
            $request = $this->requests->lock($id);
            abort_unless($this->authorizer->canTransition($actor, $action, $request), 403);
            abort_unless($request->status === 'DOCKING', 409, 'Driver assignment is only allowed while the request is DOCKING.');

            if ($action === 'mark-docked' && filled($request->driver_id)) {
                abort(409, 'A Driver ID is already assigned. Use the explicit reassignment action.');
            }
            if ($action === 'reassign-driver' && blank($request->driver_id)) {
                abort(409, 'A Driver ID must already be assigned before it can be reassigned.');
            }

            $driverId = trim((string) ($input['driver_id'] ?? ''));
            if (! preg_match('/\\A[0-9]{1,10}\\z/', $driverId)) {
                throw ValidationException::withMessages(['driver_id' => 'Driver ID must contain 1 to 10 digits.']);
            }

            $event = $action === 'reassign-driver' ? 'DRIVER_REASSIGNED' : 'DRIVER_ASSIGNED';
            $updated = $this->requests->update($id, [
                'driver_id' => $driverId,
                'driver_assigned_at' => now(),
                'status' => 'DOCKING',
            ]);
            $eventId = $this->event($id, $actor->id, $event, 'DOCKING', 'DOCKING', [
                'driver_id' => $driverId,
                'previous_driver_id' => $request->driver_id,
                'source' => 'WEB',
            ]);
            $this->notifyUser($id, $request->created_by, $event, 'Driver assignment complete', "Driver ID {$driverId} is assigned to request {$id}.", $eventId);

            return $updated;
        });
    }

    private function cancel(string $id, object $actor, array $input): object
    {
        return DB::transaction(function () use ($id, $actor, $input) {
            $request = $this->requests->lock($id);
            abort_unless($this->authorizer->canTransition($actor, 'cancel', $request), 403);
            $remarks = trim((string) ($input['cancellation_remarks'] ?? ''));
            if ((in_array($actor->role, ['fte_ops', 'fte_mm'], true) && $remarks === '') || mb_strlen($remarks) > 2000) {
                throw ValidationException::withMessages(['cancellation_remarks' => 'Cancellation remarks are required for FTE OPS and FTE MM and must not exceed 2000 characters.']);
            }

            $updated = $this->requests->update($id, [
                'status' => 'CANCELLED',
                'approval_status' => 'CANCELLED',
                'cancellation_remarks' => $remarks !== '' ? $remarks : null,
                'rejection_return_role' => null,
                'approval_source' => 'WEB',
                'approval_version' => DB::raw('COALESCE(approval_version, 0) + 1'),
                'approval_correlation_id' => (string) Str::uuid(),
            ]);
            $eventId = $this->event($id, $actor->id, 'REQUEST_CANCELLED', $request->status, 'CANCELLED', [
                'cancellation_remarks' => $remarks,
                'source' => 'WEB',
                'correlation_id' => $updated->approval_correlation_id,
            ]);
            $this->notifyUser($id, $request->created_by, 'REQUEST_CANCELLED', 'Request cancelled', "Request {$id} was cancelled. {$remarks}", $eventId);
            foreach (['fte_ops', 'fte_mm', 'doc_officer'] as $role) {
                $this->notify($id, $role, 'REQUEST_CANCELLED', 'Request cancelled', "Request {$id} was cancelled. {$remarks}", $eventId);
            }
            $this->approvals->closeAssignments($id, 'cancelled');
            $this->approvals->synchronizeAfterCommit($id, $eventId);

            return $updated;
        });
    }

    public function bulkApprove(object $actor, array $ids): array
    {
        abort_unless($actor->role === 'fte_ops', 403, 'Only FTE Ops can bulk approve requests.');

        return DB::transaction(function () use ($actor, $ids): array {
            $approved = [];
            foreach ($ids as $id) {
                $approved[] = $this->transition($id, $actor, 'approve', []);
            }

            return $approved;
        });
    }

    private function event(string $id, string $actor, string $type, ?string $from, string $to, array $meta = []): string
    {
        $eventId = DB::table('request_events')->insertGetId(['request_id' => $id, 'actor_id' => $actor, 'event_type' => $type, 'from_status' => $from, 'to_status' => $to, 'metadata' => json_encode($meta)]);
        $this->sheets->requestSync();

        return (string) $eventId;
    }

    private function notify(string $id, string $role, string $event, string $title, string $body, string $eventId): void
    {
        $this->notifications->notify($id, $event, $title, $body, targetRole: $role, correlation: 'request_event:'.$eventId);
    }

    private function notifyUser(string $id, string $userId, string $event, string $title, string $body, string $eventId): void
    {
        $this->notifications->notify($id, $event, $title, $body, userId: $userId, correlation: 'request_event:'.$eventId);
    }
}
