<?php

namespace App\Console\Commands;

use App\Features\Outbox\WorkflowOutboxDispatcher;
use App\Features\Outbox\WorkflowOutboxRepository;
use Illuminate\Console\Command;
use Throwable;

final class DrainWorkflowOutbox extends Command
{
    protected $signature = 'outbox:drain {--limit=100 : Maximum due jobs to dispatch (1-1000)}';

    protected $description = 'Dispatch due outbox retries and recover abandoned processing attempts.';

    public function handle(WorkflowOutboxRepository $repository, WorkflowOutboxDispatcher $dispatcher): int
    {
        $limit = filter_var($this->option('limit'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 1000]]);
        if ($limit === false) {
            $this->error('Limit must be between 1 and 1000.');

            return self::FAILURE;
        }
        $failed = 0;
        foreach ($repository->dueIds($limit) as $id) {
            try {
                $dispatcher->dispatch($id);
            } catch (Throwable $exception) {
                report($exception);
                $failed++;
            }
        }
        if ($failed > 0) {
            $this->error("{$failed} dispatches failed; durable rows remain eligible for recovery.");
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
