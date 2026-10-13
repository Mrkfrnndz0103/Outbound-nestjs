<?php

namespace App\Jobs;

use App\Features\Approvals\ApprovalRouter;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

final class ExpireSeaTalkAssignments implements ShouldQueue
{
    public function __construct() {}

    public function handle(ApprovalRouter $router): void
    {
        if (! Schema::hasTable('seatalk_approval_assignments')) {
            return;
        }

        $expired = DB::transaction(function (): array {
            return DB::table('seatalk_approval_assignments')
                ->whereIn('status', ['PENDING', 'ACTIVE'])
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', now())
                ->lockForUpdate()
                ->get(['id', 'request_id'])
                ->map(function (object $assignment): string {
                    DB::table('seatalk_approval_assignments')->where('id', $assignment->id)->update([
                        'status' => 'EXPIRED',
                        'responded_at' => now(),
                        'updated_at' => now(),
                    ]);

                    return (string) $assignment->request_id;
                })
                ->unique()
                ->values()
                ->all();
        });

        foreach ($expired as $requestId) {
            $router->assignNext($requestId);
        }

        foreach ($this->pendingRequestsWithoutAssignment() as $requestId) {
            $router->assignNext($requestId);
        }

        if ($expired !== []) {
            Log::info('SeaTalk approval assignments expired.', ['request_count' => count($expired)]);
        }
    }

    /** @return array<int, string> */
    private function pendingRequestsWithoutAssignment(): array
    {
        if (! (bool) config('services.seatalk.approval.enabled', false)
            || ! Schema::hasTable('requests')
            || ! Schema::hasTable('profiles')
            || ! Schema::hasColumn('profiles', 'last_seen_at')
            || ! Schema::hasColumn('requests', 'status')) {
            return [];
        }

        $presenceThreshold = now()->subSeconds((int) config('services.seatalk.approval.presence_active_seconds', 60));
        $presentApprover = DB::table('profiles')
            ->where('role', 'fte_ops')
            ->where('is_active', true)
            ->whereNotNull('last_seen_at')
            ->where('last_seen_at', '>=', $presenceThreshold)
            ->when(Schema::hasColumn('profiles', 'seatalk_employee_code'), fn ($query) => $query->whereNotNull('seatalk_employee_code'))
            ->exists();
        if (! $presentApprover) {
            return [];
        }

        $retryThreshold = now()->subSeconds((int) config('services.seatalk.approval.delivery_retry_seconds', 300));
        $query = DB::table('requests')
            ->whereIn('status', ['PENDING', 'REROUTED'])
            ->when(Schema::hasColumn('requests', 'approval_status'), fn ($builder) => $builder->where('approval_status', 'PENDING'))
            ->whereNotExists(fn ($builder) => $builder
                ->selectRaw('1')
                ->from('seatalk_approval_assignments as active_assignments')
                ->whereColumn('active_assignments.request_id', 'requests.id')
                ->whereIn('active_assignments.status', ['PENDING', 'ACTIVE']))
            ->when(Schema::hasColumn('seatalk_approval_assignments', 'updated_at'), fn ($builder) => $builder
                ->whereNotExists(fn ($failed) => $failed
                    ->selectRaw('1')
                    ->from('seatalk_approval_assignments as failed_assignments')
                    ->whereColumn('failed_assignments.request_id', 'requests.id')
                    ->where('failed_assignments.status', 'FAILED')
                    ->where('failed_assignments.updated_at', '>=', $retryThreshold)))
            ->orderBy('id')
            ->limit(100);

        return $query->pluck('id')->map(static fn (mixed $id): string => (string) $id)->all();
    }
}
