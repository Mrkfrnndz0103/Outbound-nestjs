<?php

namespace App\Features\Approvals;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class SeaTalkApprovalCallbackController
{
    public function __construct(
        private ApprovalService $approvals,
        private ?ApprovalToken $tokens = null,
    ) {}

    public function approve(Request $request): JsonResponse
    {
        return $this->handle($request, 'approve');
    }

    public function reject(Request $request): JsonResponse
    {
        return $this->handle($request, 'reject');
    }

    private function handle(
        Request $request,
        string $action,
    ): JsonResponse {
        // Signature verification remains the responsibility of the
        // existing seatalk.callback middleware.
        $data = $request->validate([
            'item_id' => ['required', 'string', 'max:100'],
            'event_id' => ['nullable', 'string', 'max:255'],
            'token' => ['required', 'string', 'max:255'],
            'timestamp' => ['nullable', 'integer'],
            'employee.employee_code' => [
                'required',
                'string',
                'max:255',
            ],
            'reason' => [
                $action === 'reject' ? 'required' : 'nullable',
                'string',
                'max:500',
            ],
        ]);

        $itemId = (string) $data['item_id'];
        $employeeCode = (string) data_get(
            $data,
            'employee.employee_code',
        );
        $reason = $action === 'reject'
            ? trim((string) $data['reason'])
            : null;
        $token = (string) $data['token'];

        // This fingerprint detects changed content under the same event ID.
        // It is intentionally separate from raw-body signature verification.
        $payloadHash = hash('sha256', json_encode([
            'action' => $action,
            'item_id' => $itemId,
            'employee_code' => $employeeCode,
            'token' => $token,
            'reason' => $reason,
        ], JSON_THROW_ON_ERROR));

        $suppliedEventId = $data['event_id'] ?? null;

        // Preserve the original raw-body fallback for providers that omit
        // event_id. It deduplicates exact delivery repeats only.
        $eventId = is_string($suppliedEventId)
            && trim($suppliedEventId) !== ''
            ? $suppliedEventId
            : hash('sha256', implode("\n", [
                $action,
                $request->getContent(),
                $itemId,
                $employeeCode,
            ]));

        $status = DB::transaction(function () use (
            $itemId,
            $employeeCode,
            $eventId,
            $payloadHash,
            $action,
            $reason,
            $token,
        ): string {
            $item = $this->resolveItem($itemId);
            $requestId = (string) $item->request_id;

            DB::table('seatalk_callback_events')->insertOrIgnore([
                'event_id' => $eventId,
                'provider_item_id' => $itemId,
                'request_id' => $requestId,
                'employee_code' => $employeeCode,
                'action' => $action,
                'payload_hash' => $payloadHash,
                'status' => 'received',
                'received_at' => now(),
                'correlation_id' => (string) Str::uuid(),
            ]);

            $event = DB::table('seatalk_callback_events')
                ->where('event_id', $eventId)
                ->lockForUpdate()
                ->firstOrFail();

            $this->assertMatchingEvent(
                $event,
                $requestId,
                $itemId,
                $employeeCode,
                $action,
                $payloadHash,
            );

            // Only completed receipts are acknowledged without processing.
            if ($event->status === 'processed') {
                return 'duplicate';
            }

            if ($event->status === 'ignored') {
                return 'ignored';
            }

            abort_unless(
                $event->status === 'received',
                409,
                'Callback event requires manual reconciliation.'
            );

            // Historical records without a fingerprint cannot safely be
            // replayed automatically.
            abort_unless(
                is_string($event->payload_hash)
                    && $event->payload_hash !== '',
                409,
                'Legacy callback event requires manual reconciliation.'
            );

            // Use the same lock order as the revised ApprovalService:
            // request -> profile -> assignment.
            DB::table('requests')
                ->where('id', $requestId)
                ->lockForUpdate()
                ->firstOrFail();

            $profile = DB::table('profiles')
                ->where('seatalk_employee_code', $employeeCode)
                ->lockForUpdate()
                ->first();

            if (
                $profile === null
                || ! (bool) $profile->is_active
            ) {
                return $this->ignoreEvent(
                    $eventId,
                    'Actor is disabled or not provisioned.',
                );
            }

            if (
                ! in_array(
                    (string) $profile->role,
                    ['fte_ops', 'fte_mm'],
                    true,
                )
            ) {
                return $this->ignoreEvent(
                    $eventId,
                    'Actor does not have an approval role.',
                );
            }

            $assignment = $this->resolveAssignment(
                $requestId,
                (string) $profile->id,
                $event->assignment_id,
            );

            if ($assignment === null) {
                return $this->ignoreEvent(
                    $eventId,
                    'No matching approval assignment exists.',
                );
            }

            $tokens = $this->tokens ?? app(ApprovalToken::class);
            if (
                ! is_string($assignment->approval_token_hash)
                || $assignment->approval_token_hash === ''
                || ! $tokens->matches(
                    (string) $assignment->id,
                    $token,
                    $assignment->approval_token_hash,
                )
            ) {
                return $this->ignoreEvent($eventId, 'The approval token is invalid.');
            }

            // Do not bind a new callback to an arbitrary historical
            // completed assignment.
            if (
                $event->assignment_id === null
                && $assignment->status !== 'ACTIVE'
            ) {
                return $this->ignoreEvent(
                    $eventId,
                    'The approval assignment is not active.',
                );
            }

            if (
                $assignment->status === 'ACTIVE'
                && $assignment->expires_at !== null
                && ! CarbonImmutable::parse(
                    $assignment->expires_at,
                )->isFuture()
            ) {
                return $this->ignoreEvent(
                    $eventId,
                    'The approval assignment has expired.',
                );
            }

            DB::table('seatalk_callback_events')
                ->where('event_id', $eventId)
                ->update([
                    'assignment_id' => $assignment->id,
                ]);

            $actor = new ApprovalActor(
                (string) $profile->id,
                (string) $profile->role,
                (string) $profile->seatalk_employee_code,
            );

            try {
                // ApprovalService uses nested transactions on the same
                // connection. Its changes commit only with this outer one.
                $result = $action === 'approve'
                    ? $this->approvals->approve(
                        $requestId,
                        $actor,
                        ApprovalSource::SeaTalk,
                        (string) $assignment->id,
                    )
                    : $this->approvals->reject(
                        $requestId,
                        $actor,
                        ApprovalSource::SeaTalk,
                        (string) $assignment->id,
                        (string) $reason,
                    );
            } catch (HttpExceptionInterface $exception) {
                // Authorization failures and obsolete decisions are
                // permanent domain outcomes, not transient database errors.
                if (
                    ! in_array(
                        $exception->getStatusCode(),
                        [403, 409],
                        true,
                    )
                ) {
                    throw $exception;
                }

                return $this->ignoreEvent(
                    $eventId,
                    $exception->getMessage(),
                );
            }

            abort_unless(
                $result->accepted,
                500,
                'Approval service did not accept the decision.'
            );

            // The revised service owns status and responded_at.
            // The controller records only the provider response identity.
            DB::table('seatalk_approval_assignments')
                ->where('id', $assignment->id)
                ->update([
                    'provider_response_id' => $eventId,
                    'approval_token_used_at' => now(),
                    'updated_at' => now(),
                ]);

            DB::table('seatalk_callback_events')
                ->where('event_id', $eventId)
                ->update([
                    'status' => 'processed',
                    'failure_reason' => null,
                    'processed_at' => now(),
                ]);

            return $result->idempotent
                ? 'duplicate'
                : 'processed';
        });

        // Log only after the transaction has completed.
        Log::info('SeaTalk approval callback completed.', [
            'event_id' => $eventId,
            'action' => $action,
            'status' => $status,
        ]);

        return $this->acknowledge();
    }

    private function resolveItem(string $providerItemId): object
    {
        $item = DB::table('seatalk_approval_items')
            ->where('provider_item_id', $providerItemId)
            ->first();

        // Never compare an arbitrary provider string to a UUID column.
        if ($item === null && Str::isUuid($providerItemId)) {
            $item = DB::table('seatalk_approval_items')
                ->where('id', $providerItemId)
                ->first();
        }

        abort_unless(
            $item !== null,
            404,
            'SeaTalk approval item was not found.'
        );

        return $item;
    }

    private function resolveAssignment(
        string $requestId,
        string $profileId,
        ?string $recordedAssignmentId,
    ): ?object {
        $query = DB::table('seatalk_approval_assignments')
            ->where('request_id', $requestId)
            ->where('fte_user_id', $profileId);

        if ($recordedAssignmentId !== null) {
            // A retry must use its recorded assignment.
            $query->where('id', $recordedAssignmentId);
        } else {
            // New callbacks can bind only to the current active assignment.
            $query->where('status', 'ACTIVE');
        }

        return $query
            ->lockForUpdate()
            ->first();
    }

    private function assertMatchingEvent(
        object $event,
        string $requestId,
        string $itemId,
        string $employeeCode,
        string $action,
        string $payloadHash,
    ): void {
        abort_unless(
            (string) $event->request_id === $requestId
                && (string) $event->provider_item_id === $itemId
                && (string) $event->employee_code === $employeeCode
                && (string) $event->action === $action,
            409,
            'Callback event ID was reused with different content.'
        );

        // Do not silently upgrade legacy receipts: their original reason
        // cannot be verified from the receipt alone.
        abort_unless(
            is_string($event->payload_hash)
                && $event->payload_hash !== '',
            409,
            'Legacy callback event requires manual reconciliation.'
        );

        abort_unless(
            hash_equals($event->payload_hash, $payloadHash),
            409,
            'Callback event ID was reused with different content.'
        );
    }

    private function ignoreEvent(
        string $eventId,
        string $reason,
    ): string {
        DB::table('seatalk_callback_events')
            ->where('event_id', $eventId)
            ->update([
                'status' => 'ignored',
                'failure_reason' => $reason,
                'processed_at' => now(),
            ]);

        return 'ignored';
    }

    private function acknowledge(): JsonResponse
    {
        return response()->json(['code' => 0]);
    }
}
