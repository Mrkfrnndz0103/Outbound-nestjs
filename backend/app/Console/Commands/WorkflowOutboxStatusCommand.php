<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class WorkflowOutboxStatusCommand extends Command
{
    protected $signature = 'outbox:status';

    protected $description = 'Report workflow outbox counts and oldest pending/dead-letter work.';

    public function handle(): int
    {
        foreach (['PENDING', 'PROCESSING', 'COMPLETED', 'DEAD_LETTER'] as $status) {
            $count = DB::table('workflow_outbox')->where('status', $status)->count();
            $this->line("{$status}: {$count}");
        }

        foreach (['PENDING', 'DEAD_LETTER'] as $status) {
            $oldest = DB::table('workflow_outbox')
                ->where('status', $status)
                ->orderBy('created_at')
                ->value('created_at');
            $this->line("Oldest {$status}: ".($oldest ?? 'none'));
        }

        return self::SUCCESS;
    }
}
