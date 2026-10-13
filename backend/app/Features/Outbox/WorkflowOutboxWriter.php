<?php

namespace App\Features\Outbox;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class WorkflowOutboxWriter
{
    public function __construct(private WorkflowOutboxRepository $repository) {}

    public function record(
        string $eventType,
        string $idempotencyKey,
        ?string $aggregateType,
        ?string $aggregateId,
        array $payload,
        ?int $maxAttempts = null,
    ): string {
        $existing = DB::table('workflow_outbox')->where('idempotency_key', $idempotencyKey)->value('id');
        if ($existing !== null) {
            return (string) $existing;
        }

        $id = (string) Str::uuid();
        DB::table('workflow_outbox')->insertOrIgnore([
            'id' => $id,
            'idempotency_key' => $idempotencyKey,
            'aggregate_type' => $aggregateType,
            'aggregate_id' => $aggregateId,
            'event_type' => $eventType,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'status' => WorkflowOutboxStatus::Pending->value,
            'attempts' => 0,
            'max_attempts' => $maxAttempts ?? (int) config('workflow_outbox.max_attempts', 5),
            'available_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return (string) DB::table('workflow_outbox')->where('idempotency_key', $idempotencyKey)->value('id');
    }
}
