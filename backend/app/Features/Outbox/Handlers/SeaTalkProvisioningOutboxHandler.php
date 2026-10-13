<?php

namespace App\Features\Outbox\Handlers;

use App\Features\Approvals\ProvisioningResult;
use App\Features\Outbox\RetryableWorkflowOutboxException;
use App\Features\Outbox\TerminalWorkflowOutboxException;
use App\Features\Outbox\WorkflowOutboxHandler;
use Closure;

final class SeaTalkProvisioningOutboxHandler implements WorkflowOutboxHandler
{
    /** @param Closure(string): ProvisioningResult $provision */
    public function __construct(private Closure $provision) {}

    public function handle(object $outbox): void
    {
        $requestId = trim((string) (($outbox->payload['request_id'] ?? null)));
        if ($requestId === '') {
            throw new TerminalWorkflowOutboxException('SeaTalk provisioning payload is missing request_id.');
        }

        $result = ($this->provision)($requestId);
        if (! $result instanceof ProvisioningResult) {
            throw new TerminalWorkflowOutboxException('SeaTalk provisioning returned an invalid result.');
        }
        if ($result->status === 'failed') {
            throw new RetryableWorkflowOutboxException($result->failureReason ?? 'SeaTalk provisioning failed.');
        }
    }
}
