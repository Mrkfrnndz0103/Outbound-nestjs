<?php

namespace App\Features\Approvals;

use App\Features\Outbox\WorkflowOutboxDispatcher;
use App\Features\Outbox\WorkflowOutboxRepository;
use App\Features\Outbox\WorkflowOutboxWriter;
use App\Features\Outbox\WorkflowSeaTalkOutbox;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

final class ApprovalRouter
{
    private const SCOPE = 'fte_ops';

    private WorkflowSeaTalkOutbox $seatalk;

    private ApprovalToken $tokens;

    public function __construct(private ApprovalItemProvisioner $provisioner, ?ApprovalToken $tokens = null)
    {
        $this->tokens = $tokens ?? app(ApprovalToken::class);
        $this->seatalk = new WorkflowSeaTalkOutbox(
            new WorkflowOutboxWriter(new WorkflowOutboxRepository),
            new WorkflowOutboxDispatcher,
            $provisioner,
        );
    }

    public function assignNext(string $requestId): RoutingResult
    {
        if (! Schema::hasTable('seatalk_approval_assignments') || ! Schema::hasTable('profiles')) {
            return new RoutingResult('unavailable', $requestId, failureReason: 'Routing schema is not installed.');
        }

        $result = DB::transaction(function () use ($requestId): RoutingResult {
            $request = DB::table('requests')->where('id', $requestId)->lockForUpdate()->first();
            if ($request === null) {
                return new RoutingResult('not_found', $requestId);
            }
            if (! in_array($request->status, ['PENDING', 'REROUTED'], true)
                || (isset($request->approval_status) && $request->approval_status !== 'PENDING')) {
                return new RoutingResult('terminal', $requestId);
            }

            $active = DB::table('seatalk_approval_assignments')
                ->where('request_id', $requestId)
                ->whereIn('status', ['PENDING', 'ACTIVE'])
                ->lockForUpdate()
                ->first();
            if ($active !== null) {
                return new RoutingResult('already_assigned', $requestId, (string) $active->id, (string) $active->fte_user_id);
            }

            $threshold = now()->subSeconds((int) config('services.seatalk.approval.presence_active_seconds', 60));
            $candidates = DB::table('profiles')
                ->where('role', 'fte_ops')
                ->where('is_active', true)
                ->whereNotNull('last_seen_at')
                ->where('last_seen_at', '>=', $threshold)
                ->when(Schema::hasColumn('profiles', 'seatalk_employee_code'), fn ($query) => $query->whereNotNull('seatalk_employee_code'))
                ->orderBy('id')
                ->lockForUpdate()
                ->get(['id']);
            if ($candidates->isEmpty()) {
                return new RoutingResult('no_candidate', $requestId);
            }

            $routingCycle = Schema::hasColumn('seatalk_approval_assignments', 'routing_cycle')
                ? max(1, (int) (DB::table('seatalk_approval_assignments')->where('request_id', $requestId)->max('routing_cycle') ?: 1))
                : 1;
            $attemptedIds = Schema::hasColumn('seatalk_approval_assignments', 'routing_cycle')
                ? DB::table('seatalk_approval_assignments')
                    ->where('request_id', $requestId)
                    ->where('routing_cycle', $routingCycle)
                    ->whereIn('status', ['EXPIRED', 'FAILED'])
                    ->pluck('fte_user_id')
                    ->map(fn (mixed $id): string => (string) $id)
                    ->all()
                : [];
            $eligible = $candidates->reject(fn (object $candidate): bool => in_array((string) $candidate->id, $attemptedIds, true))->values();
            if ($eligible->isEmpty()) {
                $routingCycle++;
                $eligible = $candidates;
            }

            $cursor = DB::table('approval_routing_cursors')->where('scope', self::SCOPE)->lockForUpdate()->first();
            $selected = $eligible->first();
            if ($cursor?->cursor_profile_id !== null) {
                $afterCursor = $eligible->first(fn (object $candidate): bool => (string) $candidate->id > (string) $cursor->cursor_profile_id);
                $selected = $afterCursor ?? $eligible->first();
            }
            if ($cursor === null) {
                DB::table('approval_routing_cursors')->insert([
                    'scope' => self::SCOPE,
                    'cursor_profile_id' => $selected->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } else {
                DB::table('approval_routing_cursors')->where('scope', self::SCOPE)->update([
                    'cursor_profile_id' => $selected->id,
                    'updated_at' => now(),
                ]);
            }

            $item = DB::table('seatalk_approval_items')->where('request_id', $requestId)->first();
            if ($item === null) {
                $itemId = (string) Str::uuid();
                DB::table('seatalk_approval_items')->insert([
                    'id' => $itemId,
                    'request_id' => $requestId,
                    'status' => 'PENDING',
                    'correlation_id' => (string) Str::uuid(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $item = DB::table('seatalk_approval_items')->where('id', $itemId)->first();
            }

            $sequence = ((int) DB::table('seatalk_approval_assignments')->where('request_id', $requestId)->max('sequence')) + 1;
            $assignmentId = (string) Str::uuid();
            $assignment = [
                'id' => $assignmentId,
                'request_id' => $requestId,
                'seatalk_approval_item_id' => $item->id,
                'fte_user_id' => $selected->id,
                'sequence' => $sequence,
                'status' => 'ACTIVE',
                'sent_at' => now(),
                'expires_at' => now()->addSeconds((int) config('services.seatalk.approval.assignment_seconds', 180)),
                'correlation_id' => (string) Str::uuid(),
                'created_at' => now(),
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('seatalk_approval_assignments', 'routing_cycle')) {
                $assignment['routing_cycle'] = $routingCycle;
            }
            if (Schema::hasColumn('seatalk_approval_assignments', 'approval_token_hash')) {
                $assignment['approval_token_hash'] = $this->tokens->hash($this->tokens->forAssignment($assignmentId));
            }
            DB::table('seatalk_approval_assignments')->insert($assignment);

            return new RoutingResult('assigned', $requestId, $assignmentId, (string) $selected->id);
        });

        if (! $result->assigned()) {
            return $result;
        }

        if (Schema::hasTable('workflow_outbox')) {
            $this->seatalk->provision($requestId, $result->assignmentId);

            return $result;
        }

        try {
            $delivery = $this->provisioner->sync($requestId);
            if ($delivery instanceof ProvisioningResult && $delivery->status === 'failed') {
                $this->markDeliveryFailed($result->assignmentId, $delivery->failureReason ?? 'Provider delivery failed.');

                return new RoutingResult('delivery_failed', $requestId, $result->assignmentId, $result->profileId, $delivery->failureReason);
            }
        } catch (Throwable $exception) {
            $this->markDeliveryFailed($result->assignmentId, 'Provider delivery failed.');

            return new RoutingResult('delivery_failed', $requestId, $result->assignmentId, $result->profileId, 'Provider delivery failed.');
        }

        return $result;
    }

    private function markDeliveryFailed(?string $assignmentId, string $reason): void
    {
        if ($assignmentId !== null) {
            DB::table('seatalk_approval_assignments')->where('id', $assignmentId)->update([
                'status' => 'FAILED',
                'failure_reason' => $reason,
                'updated_at' => now(),
            ]);
        }
    }
}
