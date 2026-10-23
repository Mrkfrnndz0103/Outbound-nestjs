<?php

namespace App\Console\Commands;

use App\Features\Outbox\WorkflowOutboxRepository;
use Illuminate\Console\Command;

final class WorkflowOutboxStatusCommand extends Command
{
    protected $signature = 'outbox:status';

    protected $description = 'Report workflow outbox counts and oldest pending/dead-letter work.';

    public function handle(): int
    {
        $snapshot = app(WorkflowOutboxRepository::class)->statusSnapshot();
        foreach ($snapshot['counts'] as $status => $count) {
            $this->line("{$status}: {$count}");
        }

        foreach (['PENDING', 'DEAD_LETTER'] as $status) {
            $oldest = $snapshot['oldest_'.strtolower($status)];
            $this->line("Oldest {$status}: ".($oldest ?? 'none'));
        }

        $this->line('Due pending: '.$snapshot['due_pending']);
        $this->line('Delayed pending: '.$snapshot['delayed_pending']);
        $this->line('Stale processing: '.$snapshot['stale_processing']);
        $this->line('Oldest due available at: '.($snapshot['oldest_due_available_at'] ?? 'none'));
        $this->line('Oldest processing started at: '.($snapshot['oldest_processing_started_at'] ?? 'none'));

        return self::SUCCESS;
    }
}
