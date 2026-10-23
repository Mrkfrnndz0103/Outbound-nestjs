<?php

namespace App\Features\Outbox;

use App\Features\Approvals\ApprovalItemProvisioner;
use App\Features\Approvals\ApprovalItemSynchronizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class WorkflowSeaTalkOutbox
{
    public function __construct(
        private WorkflowOutboxWriter $writer,
        private WorkflowOutboxDispatcher $dispatcher,
        private ?ApprovalItemProvisioner $provisioner = null,
        private ?ApprovalItemSynchronizer $synchronizer = null,
    ) {}

    public function provision(string $requestId, ?string $assignmentId = null): void
    {
        if (! Schema::hasTable('workflow_outbox')) {
            DB::afterCommit(fn () => $this->provisioner?->sync($requestId));

            return;
        }

        $id = $this->writer->record(
            WorkflowOutboxEvent::SeaTalkProvision,
            'seatalk:provision:'.$requestId.':'.($assignmentId ?? $this->revision($requestId)),
            'request',
            $requestId,
            ['request_id' => $requestId],
        );
        DB::afterCommit(fn () => $this->dispatcher->dispatch($id));
    }

    public function synchronize(string $requestId, string|int|null $eventId = null): void
    {
        if (! Schema::hasTable('workflow_outbox')) {
            DB::afterCommit(fn () => $this->synchronizer?->synchronize($requestId));

            return;
        }

        $id = $this->writer->record(
            WorkflowOutboxEvent::SeaTalkSynchronize,
            'seatalk:synchronize:'.$requestId.':'.($eventId !== null ? 'event:'.$eventId : $this->revision($requestId)),
            'request',
            $requestId,
            ['request_id' => $requestId],
        );
        DB::afterCommit(fn () => $this->dispatcher->dispatch($id));
    }

    private function revision(string $requestId): string
    {
        $request = DB::table('requests')->where('id', $requestId)->first();
        $eventId = Schema::hasTable('request_events')
            ? DB::table('request_events')->where('request_id', $requestId)->max('id') : null;
        $assignmentId = Schema::hasTable('seatalk_approval_assignments')
            ? DB::table('seatalk_approval_assignments')->where('request_id', $requestId)->orderByDesc('sequence')->value('id') : null;

        return 'revision:'.hash('sha256', json_encode([
            $request?->approval_version ?? 0, $request?->approval_status ?? null,
            $request?->status ?? null, $eventId, $assignmentId,
        ], JSON_THROW_ON_ERROR));
    }
}
