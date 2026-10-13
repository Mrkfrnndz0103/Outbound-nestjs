<?php

namespace App\Features\Outbox\Handlers;

use App\Features\Outbox\RetryableWorkflowOutboxException;
use App\Features\Outbox\WorkflowOutboxHandler;
use Closure;
use Throwable;

final class GoogleSheetsSynchronizationOutboxHandler implements WorkflowOutboxHandler
{
    /** @param Closure(): void $synchronize */
    public function __construct(private Closure $synchronize) {}

    public function handle(object $outbox): void
    {
        if (! config('services.google_sheets.sync_enabled')) {
            return;
        }

        try {
            ($this->synchronize)();
        } catch (Throwable $exception) {
            throw new RetryableWorkflowOutboxException($exception->getMessage(), previous: $exception);
        }
    }
}
