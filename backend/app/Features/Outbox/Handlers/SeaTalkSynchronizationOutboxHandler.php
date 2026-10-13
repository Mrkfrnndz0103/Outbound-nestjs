<?php

namespace App\Features\Outbox\Handlers;

use App\Features\Approvals\SynchronizationResult;
use App\Features\Outbox\RetryableWorkflowOutboxException;
use App\Features\Outbox\TerminalWorkflowOutboxException;
use App\Features\Outbox\WorkflowOutboxHandler;
use Closure;

final class SeaTalkSynchronizationOutboxHandler implements WorkflowOutboxHandler
{
    /** @param Closure(string): SynchronizationResult $synchronize */
    public function __construct(private Closure $synchronize) {}

    public function handle(object $outbox): void
    {
        $requestId = trim((string) (($outbox->payload['request_id'] ?? null)));
        if ($requestId === '') {
            throw new TerminalWorkflowOutboxException('SeaTalk synchronization payload is missing request_id.');
        }

        $result = ($this->synchronize)($requestId);
        if (! $result instanceof SynchronizationResult) {
            throw new TerminalWorkflowOutboxException('SeaTalk synchronization returned an invalid result.');
        }
        if ($result->status === 'failed') {
            throw new RetryableWorkflowOutboxException($result->failureReason ?? 'SeaTalk synchronization failed.');
        }
    }
}
