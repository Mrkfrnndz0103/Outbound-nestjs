<?php

namespace App\Features\Outbox;

enum WorkflowOutboxStatus: string
{
    case Pending = 'PENDING';
    case Processing = 'PROCESSING';
    case Completed = 'COMPLETED';
    case DeadLetter = 'DEAD_LETTER';
}
