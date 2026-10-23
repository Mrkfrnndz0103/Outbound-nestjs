<?php

namespace App\Features\Approvals;

use App\Integrations\SeaTalk\ApprovalItemPayload;
use App\Integrations\SeaTalk\SeaTalkApprovalCenterGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

final class ApprovalItemSynchronizer
{
    public function __construct(
        private SeaTalkApprovalCenterGateway $gateway,
        private ApprovalItemProvisioner $provisioner,
    ) {}

    public function synchronize(string $requestId): SynchronizationResult
    {
        if (! Schema::hasTable('seatalk_approval_items')) {
            return new SynchronizationResult('skipped', 'Approval Center schema is not installed.');
        }

        $request = DB::table('requests')->where('id', $requestId)->first();
        $item = DB::table('seatalk_approval_items')->where('request_id', $requestId)->first();
        if ($request === null || $item === null) {
            return new SynchronizationResult('skipped', 'Request or local approval item was not found.');
        }

        try {
            $payload = $this->payload($request);
            if ($item->provider_item_id === null) {
                $provisioned = $this->provisioner->provisionForRequest($request, $payload);
                if (! $provisioned->delivered()) {
                    return new SynchronizationResult($provisioned->status, $provisioned->failureReason);
                }
            } else {
                $this->gateway->updateItem((string) $item->provider_item_id, $payload);
            }

            DB::table('seatalk_approval_items')->where('id', $item->id)->update([
                'status' => $this->itemStatus($request),
                'failure_reason' => null,
                'updated_at' => now(),
            ]);

            return new SynchronizationResult('synchronized');
        } catch (Throwable $exception) {
            $reason = $exception->getMessage() ?: 'Approval Center synchronization failed.';
            DB::table('seatalk_approval_items')->where('id', $item->id)->update([
                'status' => 'FAILED',
                'failure_reason' => mb_substr($reason, 0, 5000),
                'updated_at' => now(),
            ]);
            Log::warning('SeaTalk approval item synchronization failed.', [
                'request_id' => $requestId,
                'exception' => $exception::class,
            ]);

            return new SynchronizationResult('failed', $reason);
        }
    }

    private function payload(object $request): ApprovalItemPayload
    {
        $assignments = Schema::hasTable('seatalk_approval_assignments')
            ? DB::table('seatalk_approval_assignments as assignments')
                ->leftJoin('profiles', 'profiles.id', '=', 'assignments.fte_user_id')
                ->where('assignments.request_id', $request->id)
                ->orderBy('assignments.sequence')
                ->get([
                    'assignments.id', 'assignments.status', 'assignments.sent_at', 'assignments.responded_at',
                    'assignments.failure_reason', 'profiles.seatalk_employee_code',
                ])
            : collect();
        $pending = [];
        $approved = [];
        $rejected = [];
        $chain = [];
        foreach ($assignments as $assignment) {
            $code = (string) ($assignment->seatalk_employee_code ?? '');
            if ($code === '') {
                continue;
            }
            $timestamp = $assignment->responded_at ?? $assignment->sent_at ?? now();
            if (in_array($assignment->status, ['PENDING', 'ACTIVE'], true)) {
                $pending[] = $this->provisioner->assignmentEntry((string) $assignment->id, $code, is_object($timestamp) ? $timestamp->timestamp : now()->parse($timestamp)->timestamp);
            } elseif ($assignment->status === 'APPROVED') {
                $approved[] = ['employee_code' => $code, 'ts' => now()->parse($timestamp)->timestamp];
            } elseif ($assignment->status === 'REJECTED') {
                $rejected[] = ['employee_code' => $code, 'ts' => now()->parse($timestamp)->timestamp];
            }
            $chain[] = [
                'employee_code' => $code,
                'action_time' => now()->parse($timestamp)->timestamp,
                'status' => ['state' => $assignment->status === 'APPROVED' ? 3 : ($assignment->status === 'REJECTED' ? 2 : 0)],
                'comment' => $assignment->failure_reason,
            ];
        }

        $state = match ((string) ($request->approval_status ?? 'PENDING')) {
            'APPROVED' => 1,
            'REJECTED' => 2,
            'CANCELLED' => 4,
            default => 0,
        };

        return $this->provisioner->buildPayload($request, $pending, $approved, $rejected, $chain, $state);
    }

    private function itemStatus(object $request): string
    {
        return match ((string) ($request->approval_status ?? 'PENDING')) {
            'APPROVED' => 'APPROVED',
            'REJECTED' => 'REJECTED',
            'CANCELLED' => 'CLOSED',
            default => 'ACTIVE',
        };
    }
}
