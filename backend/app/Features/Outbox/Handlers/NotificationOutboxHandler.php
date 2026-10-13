<?php

namespace App\Features\Outbox\Handlers;

use App\Features\Outbox\TerminalWorkflowOutboxException;
use App\Features\Outbox\WorkflowOutboxHandler;
use Illuminate\Support\Facades\DB;

final class NotificationOutboxHandler implements WorkflowOutboxHandler
{
    public function handle(object $outbox): void
    {
        $payload = is_array($outbox->payload) ? $outbox->payload : [];
        foreach (['request_id', 'event_type', 'title', 'body'] as $required) {
            if (! isset($payload[$required]) || trim((string) $payload[$required]) === '') {
                throw new TerminalWorkflowOutboxException("Notification payload is missing {$required}.");
            }
        }

        if (DB::table('notifications')->where('outbox_id', $outbox->id)->exists()) {
            return;
        }

        DB::table('notifications')->insertOrIgnore([
            'request_id' => $payload['request_id'],
            'user_id' => $payload['user_id'] ?? null,
            'target_role' => $payload['target_role'] ?? null,
            'event_type' => $payload['event_type'],
            'title' => $payload['title'],
            'body' => $payload['body'],
            'outbox_id' => $outbox->id,
            'created_at' => now(),
        ]);
    }
}
