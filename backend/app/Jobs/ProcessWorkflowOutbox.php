<?php

namespace App\Jobs;

use App\Features\Outbox\RetryableWorkflowOutboxException;
use App\Features\Outbox\TerminalWorkflowOutboxException;
use App\Features\Outbox\WorkflowOutboxHandlerRegistry;
use App\Features\Outbox\WorkflowOutboxRepository;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

final class ProcessWorkflowOutbox implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public string $outboxId) {}

    public function handle(WorkflowOutboxRepository $repository, WorkflowOutboxHandlerRegistry $registry): void
    {
        $outbox = $repository->claim($this->outboxId, CarbonImmutable::now());
        if ($outbox === null) {
            return;
        }
        if ((int) $outbox->attempts > (int) $outbox->max_attempts) {
            $repository->deadLetter($this->outboxId, 'Processing attempts exhausted after abandoned work.', $outbox);

            return;
        }

        try {
            $registry->handlerFor((string) $outbox->event_type)->handle($outbox);
            $repository->complete($this->outboxId, $outbox);
        } catch (RetryableWorkflowOutboxException $exception) {
            $this->rescheduleOrDeadLetter($repository, $outbox, $exception);
        } catch (TerminalWorkflowOutboxException $exception) {
            $repository->deadLetter($this->outboxId, $exception->getMessage(), $outbox);
        } catch (Throwable $exception) {
            report($exception);
            $repository->deadLetter($this->outboxId, 'Unexpected outbox handler failure.', $outbox);
        }
    }

    private function rescheduleOrDeadLetter(
        WorkflowOutboxRepository $repository,
        object $outbox,
        RetryableWorkflowOutboxException $exception,
    ): void {
        $attempts = (int) $outbox->attempts;
        if ($attempts >= (int) $outbox->max_attempts) {
            $repository->deadLetter($this->outboxId, $exception->getMessage(), $outbox);

            return;
        }

        $base = max(1, (int) config('workflow_outbox.base_backoff_seconds', 5));
        $maximum = max($base, (int) config('workflow_outbox.max_backoff_seconds', 300));
        $delay = min($maximum, $base * (2 ** max(0, $attempts - 1)));
        $repository->retry($this->outboxId, $exception->getMessage(), CarbonImmutable::now()->addSeconds($delay), $outbox);
    }
}
