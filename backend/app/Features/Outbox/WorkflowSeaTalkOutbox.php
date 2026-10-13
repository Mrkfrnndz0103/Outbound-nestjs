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

    public function provision(string $requestId): void
    {
        if (! Schema::hasTable('workflow_outbox')) {
            DB::afterCommit(fn () => $this->provisioner?->sync($requestId));

            return;
        }

        $id = $this->writer->record(
            WorkflowOutboxEvent::SeaTalkProvision,
            'seatalk:provision:'.$requestId,
            'request',
            $requestId,
            ['request_id' => $requestId],
        );
        DB::afterCommit(fn () => $this->dispatcher->dispatch($id));
    }

    public function synchronize(string $requestId): void
    {
        if (! Schema::hasTable('workflow_outbox')) {
            DB::afterCommit(fn () => $this->synchronizer?->synchronize($requestId));

            return;
        }

        $id = $this->writer->record(
            WorkflowOutboxEvent::SeaTalkSynchronize,
            'seatalk:synchronize:'.$requestId,
            'request',
            $requestId,
            ['request_id' => $requestId],
        );
        DB::afterCommit(fn () => $this->dispatcher->dispatch($id));
    }
}
