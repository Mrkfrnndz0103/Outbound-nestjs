<?php

namespace App\Console\Commands;

use App\Features\Outbox\WorkflowOutboxDispatcher;
use App\Features\Outbox\WorkflowOutboxRepository;
use Illuminate\Console\Command;

final class RetryWorkflowOutbox extends Command
{
    protected $signature = 'outbox:retry {id : Dead-letter outbox UUID to replay}';

    protected $description = 'Explicitly replay one dead-letter outbox event after its cause is corrected.';

    public function handle(WorkflowOutboxRepository $repository, WorkflowOutboxDispatcher $dispatcher): int
    {
        $id = (string) $this->argument('id');
        if (! $repository->replay($id)) {
            $this->error('No dead-letter event matches this ID.');

            return self::FAILURE;
        }
        $dispatcher->dispatch($id);
        $this->info('Outbox event scheduled for replay.');

        return self::SUCCESS;
    }
}
