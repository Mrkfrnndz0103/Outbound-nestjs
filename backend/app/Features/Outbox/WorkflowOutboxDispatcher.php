<?php

namespace App\Features\Outbox;

use App\Jobs\ProcessWorkflowOutbox;

final class WorkflowOutboxDispatcher
{
    public function dispatch(string $outboxId): void
    {
        ProcessWorkflowOutbox::dispatch($outboxId);
    }
}
