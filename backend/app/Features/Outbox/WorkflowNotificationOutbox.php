<?php

namespace App\Features\Outbox;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class WorkflowNotificationOutbox
{
    public function __construct(
        private WorkflowOutboxWriter $writer,
        private WorkflowOutboxDispatcher $dispatcher,
    ) {}

    public function notify(
        string $requestId,
        string $event,
        string $title,
        string $body,
        ?string $targetRole = null,
        ?string $userId = null,
        ?string $correlation = null,
    ): void {
        if (! Schema::hasTable('workflow_outbox') || ! Schema::hasColumn('notifications', 'outbox_id')) {
            DB::table('notifications')->insert([
                'request_id' => $requestId,
                'user_id' => $userId,
                'target_role' => $targetRole,
                'event_type' => $event,
                'title' => $title,
                'body' => $body,
            ]);

            return;
        }

        $recipient = $targetRole !== null ? 'role:'.$targetRole : 'user:'.$userId;
        $fingerprint = hash('sha256', json_encode([$title, $body, $correlation], JSON_THROW_ON_ERROR));
        $outboxId = $this->writer->record(
            WorkflowOutboxEvent::NotificationCreated,
            implode(':', ['notification', $requestId, $event, $recipient, $fingerprint]),
            'request',
            $requestId,
            array_filter([
                'request_id' => $requestId,
                'user_id' => $userId,
                'target_role' => $targetRole,
                'event_type' => $event,
                'title' => $title,
                'body' => $body,
                'correlation' => $correlation,
            ], static fn (mixed $value): bool => $value !== null),
        );

        DB::afterCommit(fn () => $this->dispatcher->dispatch($outboxId));
    }
}
