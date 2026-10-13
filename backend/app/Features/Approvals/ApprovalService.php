<?php

namespace App\Features\Approvals;

use App\Features\Requests\RequestAuthorizer;
use App\Features\Requests\RequestRepository;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class ApprovalService
{
    public function __construct(
        private RequestRepository $requests,
        private RequestAuthorizer $authorizer,
        private ?ApprovalItemSynchronizer $synchronizer = null,
    ) {}

    public function synchronizeAfterCommit(string $requestId): void
    {
        if ($this->synchronizer === null) {
            return;
        }

        DB::afterCommit(function () use ($requestId): void {
            $this->synchronizer?->synchronize($requestId);
        });
    }

    public function approve(
        string $requestId,
        ApprovalActor $actor,
        ApprovalSource $source,
        ?string $assignmentId = null,
    ): ApprovalResult {
        return DB::transaction(function () use (
            $requestId,
            $actor,
            $source,
            $assignmentId,
        ): ApprovalResult {
            $request = $this->requests->lock($requestId);

            // Authorization always precedes any idempotent response.
            $this->authorizeActor($actor, $source, 'approve', $request);

            $assignment = $this->resolveAssignment(
                $requestId,
                $actor,
                $source,
                $assignmentId,
            );

            if ($this->alreadyApproved($request)) {
                $this->assertReplayAssignment(
                    $requestId,
                    $assignment,
                    'APPROVED',
                    'REQUEST_APPROVED',
                );

                return new ApprovalResult($request, true, true);
            }

            abort_unless(
                in_array($request->status, ['PENDING', 'REROUTED'], true),
                409,
                "Cannot approve a {$request->status} request."
            );

            $this->assertActiveAssignment($assignment);

            $correlationId = (string) Str::uuid();

            $updated = $this->requests->update($requestId, [
                'status' => 'REQUESTED',
                'approval_status' => 'APPROVED',
                'approved_by' => $actor->id,
                'approved_at' => now(),
                'rejected_by' => null,
                'rejected_at' => null,
                'rejection_remarks' => null,
                'approval_source' => $source->value,
                'approval_version' => DB::raw(
                    'COALESCE(approval_version, 0) + 1'
                ),
                'approval_correlation_id' => $correlationId,
            ]);

            $this->event(
                $requestId,
                $actor->id,
                'REQUEST_APPROVED',
                $request->status,
                'REQUESTED',
                [
                    'source' => $source->value,
                    'correlation_id' => $correlationId,
                    'assignment_id' => $assignment?->id,
                ],
            );

            $this->notify(
                $requestId,
                'fte_mm',
                'REQUEST_APPROVED',
                'Request approved',
                "Request {$requestId} is now REQUESTED.",
            );

            // Preserve the actual responding assignment's outcome.
            $this->completeAssignment($assignment, 'APPROVED');
            $this->closeAssignments($requestId, 'approved');
            $this->synchronizeAfterCommit($requestId);

            return new ApprovalResult($updated, true);
        });
    }

    public function reject(
        string $requestId,
        ApprovalActor $actor,
        ApprovalSource $source,
        ?string $assignmentId,
        string $reason,
    ): ApprovalResult {
        $reason = trim($reason);

        if ($reason === '') {
            throw ValidationException::withMessages([
                'rejection_remarks' => 'A rejection reason is required.',
            ]);
        }

        return DB::transaction(function () use (
            $requestId,
            $actor,
            $source,
            $assignmentId,
            $reason,
        ): ApprovalResult {
            $request = $this->requests->lock($requestId);

            $isOpsRejection = $actor->role === 'fte_ops';
            $action = $isOpsRejection ? 'reject-ops' : 'reject-mm';

            // Reject unauthorized roles before inspecting repeated decisions.
            $this->authorizeActor($actor, $source, $action, $request);

            $assignment = $this->resolveAssignment(
                $requestId,
                $actor,
                $source,
                $assignmentId,
            );

            $returnRole = $isOpsRejection ? 'ops_pic' : 'fte_ops';
            $eventType = $isOpsRejection
                ? 'REQUEST_REJECTED_BY_OPS'
                : 'REQUEST_REJECTED_BY_MM';

            if ($this->alreadyRejected($request)) {
                abort_unless(
                    ($request->rejection_return_role ?? null) === $returnRole
                        && ($request->rejected_by ?? null) === $actor->id
                        && ($request->rejection_remarks ?? null) === $reason,
                    409,
                    'This request already has a different rejection decision.'
                );
                $this->assertReplayAssignment($requestId, $assignment, 'REJECTED', $eventType);

                return new ApprovalResult($request, true, true);
            }

            $allowedStatuses = $isOpsRejection ? ['PENDING', 'REROUTED'] : ['REQUESTED'];
            abort_unless(
                in_array($request->status, $allowedStatuses, true),
                409,
                "Cannot reject a {$request->status} request."
            );

            $this->assertActiveAssignment($assignment);

            $correlationId = (string) Str::uuid();
            $toStatus = 'REJECTED';
            $fields = [
                'status' => $toStatus,
                'rejection_remarks' => $reason,
                'rejection_return_role' => $returnRole,
                'rejected_by' => $actor->id,
                'rejected_at' => now(),
                'approval_status' => 'REJECTED',
                'approval_source' => $source->value,
                'approval_version' => DB::raw('COALESCE(approval_version, 0) + 1'),
                'approval_correlation_id' => $correlationId,
            ];

            $updated = $this->requests->update($requestId, $fields);

            $this->event(
                $requestId,
                $actor->id,
                $eventType,
                $request->status,
                $toStatus,
                [
                    'rejection_remarks' => $reason,
                    'return_role' => $returnRole,
                    'source' => $source->value,
                    'correlation_id' => $correlationId,
                    'assignment_id' => $assignment?->id,
                ],
            );

            if ($isOpsRejection) {
                $this->notifyUser(
                    $requestId,
                    (string) $request->created_by,
                    $eventType,
                    'Request rejected',
                    "Request {$requestId} was rejected by FTE Ops.",
                );
            } else {
                $this->notify(
                    $requestId,
                    'fte_ops',
                    $eventType,
                    'Request returned for editing',
                    "Request {$requestId} was rejected by FTE MM: {$reason}",
                );
            }

            $this->completeAssignment($assignment, 'REJECTED');

            $this->closeAssignments(
                $requestId,
                $isOpsRejection ? 'rejected_by_ops' : 'rejected',
            );

            $this->synchronizeAfterCommit($requestId);

            return new ApprovalResult($updated, true);
        });
    }

    public function closeAssignments(
        string $requestId,
        string $reason,
    ): void {
        if (! Schema::hasTable('seatalk_approval_assignments')) {
            return;
        }

        DB::table('seatalk_approval_assignments')
            ->where('request_id', $requestId)
            ->whereIn('status', ['PENDING', 'ACTIVE'])
            ->update([
                'status' => 'CLOSED',
                'failure_reason' => $reason,
                'updated_at' => now(),
            ]);
    }

    private function authorizeActor(
        ApprovalActor $actor,
        ApprovalSource $source,
        string $action,
        object $request,
    ): void {
        // Lock the current profile so disabling cannot race this decision
        // without participating in database locking.
        $profile = DB::table('profiles')
            ->where('id', $actor->id)
            ->lockForUpdate()
            ->first();

        abort_unless(
            $profile !== null && (bool) $profile->is_active,
            403,
            'Account is disabled or not provisioned.'
        );

        abort_unless(
            (string) $profile->role === $actor->role,
            403,
            'Account role has changed. Refresh your session.'
        );

        if ($source === ApprovalSource::SeaTalk) {
            $employeeCode = (string) (
                $profile->seatalk_employee_code ?? ''
            );

            abort_unless(
                $actor->employeeCode !== null
                    && $actor->employeeCode !== ''
                    && $employeeCode !== ''
                    && hash_equals($employeeCode, $actor->employeeCode),
                403,
                'SeaTalk identity does not match the account.'
            );
        }

        abort_unless(
            $this->authorizer->canView((object) $actor, $request)
                && $this->authorizer->canTransition(
                    (object) $actor,
                    $action,
                    $request,
                ),
            403,
            'You are not authorized to perform this action.'
        );
    }

    private function resolveAssignment(
        string $requestId,
        ApprovalActor $actor,
        ApprovalSource $source,
        ?string $assignmentId,
    ): ?object {
        if ($source === ApprovalSource::SeaTalk) {
            abort_unless(
                $assignmentId !== null && trim($assignmentId) !== '',
                409,
                'A SeaTalk approval assignment is required.'
            );
        }

        // Web decisions do not require a SeaTalk assignment.
        if ($assignmentId === null) {
            return null;
        }

        abort_unless(
            Schema::hasTable('seatalk_approval_assignments'),
            503,
            'Approval assignment schema is not installed.'
        );

        $assignment = DB::table('seatalk_approval_assignments')
            ->where('id', $assignmentId)
            ->where('request_id', $requestId)
            ->where('fte_user_id', $actor->id)
            ->lockForUpdate()
            ->first();

        abort_unless(
            $assignment !== null,
            409,
            'The approval assignment is invalid or belongs to another user.'
        );

        return $assignment;
    }

    private function assertActiveAssignment(?object $assignment): void
    {
        if ($assignment === null) {
            return;
        }

        abort_unless(
            $assignment->status === 'ACTIVE',
            409,
            'The approval assignment is no longer active.'
        );

        if ($assignment->expires_at !== null) {
            abort_unless(
                CarbonImmutable::parse($assignment->expires_at)
                    ->isFuture(),
                409,
                'The approval assignment has expired.'
            );
        }
    }

    private function assertReplayAssignment(
        string $requestId,
        ?object $assignment,
        string $expectedStatus,
        string $eventType,
    ): void {
        // Authorized web callers may repeat an already completed decision.
        if ($assignment === null) {
            return;
        }

        abort_unless(
            $assignment->status === $expectedStatus,
            409,
            'This assignment did not complete the requested decision.'
        );

        // Match the most recent decision of this type, not merely any
        // historical completed assignment for this request.
        $event = DB::table('request_events')
            ->where('request_id', $requestId)
            ->where('event_type', $eventType)
            ->orderByDesc('id')
            ->first(['actor_id', 'metadata']);

        $metadata = $event !== null
            ? json_decode((string) $event->metadata, true)
            : null;

        abort_unless(
            $event !== null
                && (string) $event->actor_id
                    === (string) $assignment->fte_user_id
                && is_array($metadata)
                && ($metadata['assignment_id'] ?? null)
                    === (string) $assignment->id
                && ($metadata['source'] ?? null)
                    === ApprovalSource::SeaTalk->value,
            409,
            'The completed assignment does not match the recorded decision.'
        );
    }

    private function completeAssignment(
        ?object $assignment,
        string $status,
    ): void {
        if ($assignment === null) {
            return;
        }

        DB::table('seatalk_approval_assignments')
            ->where('id', $assignment->id)
            ->update([
                'status' => $status,
                'responded_at' => now(),
                'failure_reason' => null,
                'updated_at' => now(),
            ]);
    }

    private function alreadyApproved(object $request): bool
    {
        return $request->status === 'REQUESTED'
            && ($request->approval_status ?? null) === 'APPROVED';
    }

    private function alreadyRejected(object $request): bool
    {
        return $request->status === 'REJECTED'
            && ($request->approval_status ?? null) === 'REJECTED';
    }

    private function event(
        string $requestId,
        string $actorId,
        string $type,
        ?string $from,
        string $to,
        array $metadata = [],
    ): void {
        DB::table('request_events')->insert([
            'request_id' => $requestId,
            'actor_id' => $actorId,
            'event_type' => $type,
            'from_status' => $from,
            'to_status' => $to,
            'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR),
        ]);
    }

    private function notify(
        string $requestId,
        string $role,
        string $event,
        string $title,
        string $body,
    ): void {
        DB::table('notifications')->insert([
            'request_id' => $requestId,
            'target_role' => $role,
            'event_type' => $event,
            'title' => $title,
            'body' => $body,
        ]);
    }

    private function notifyUser(
        string $requestId,
        string $userId,
        string $event,
        string $title,
        string $body,
    ): void {
        DB::table('notifications')->insert([
            'request_id' => $requestId,
            'user_id' => $userId,
            'event_type' => $event,
            'title' => $title,
            'body' => $body,
        ]);
    }
}
