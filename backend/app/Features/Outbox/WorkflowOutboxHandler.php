<?php

namespace App\Features\Outbox;

interface WorkflowOutboxHandler
{
    public function handle(object $outbox): void;
}
