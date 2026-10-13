<?php

namespace App\Features\Outbox;

use App\Jobs\SyncRequestsToGoogleSheetJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

final class WorkflowGoogleSheetsOutbox
{
    /** @var array<string, true> */
    private array $scheduled = [];

    public function __construct(
        private WorkflowOutboxWriter $writer,
        private WorkflowOutboxRepository $repository,
        private WorkflowOutboxDispatcher $dispatcher,
    ) {}

    public function requestSync(?int $workflowVersion = null): string
    {
        if (! (bool) config('services.google_sheets.sync_enabled', false)) {
            return '';
        }

        if (! Schema::hasTable('workflow_outbox')) {
            DB::afterCommit(fn () => SyncRequestsToGoogleSheetJob::dispatch());

            return '';
        }

        $pending = $this->repository->findPendingEvent(WorkflowOutboxEvent::GoogleSheetsSynchronize);
        $id = $pending?->id;
        if ($id === null) {
            $id = $this->writer->record(
                WorkflowOutboxEvent::GoogleSheetsSynchronize,
                'google_sheets:synchronize:'.Str::uuid(),
                'workflow',
                null,
                ['workflow_version' => $workflowVersion],
            );
        }

        if (! isset($this->scheduled[$id])) {
            $this->scheduled[$id] = true;
            DB::afterCommit(fn () => $this->dispatcher->dispatch($id));
        }

        return (string) $id;
    }
}
