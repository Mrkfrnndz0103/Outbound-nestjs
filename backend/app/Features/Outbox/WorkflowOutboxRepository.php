<?php

namespace App\Features\Outbox;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class WorkflowOutboxRepository
{
    public function find(string $id): ?object
    {
        $row = DB::table('workflow_outbox')->where('id', $id)->first();

        return $this->decode($row);
    }

    public function findPendingEvent(string $eventType): ?object
    {
        $row = DB::table('workflow_outbox')
            ->where('event_type', $eventType)
            ->whereIn('status', [WorkflowOutboxStatus::Pending->value, WorkflowOutboxStatus::Processing->value])
            ->orderBy('created_at')
            ->first();

        return $this->decode($row);
    }

    public function claim(string $id, CarbonImmutable $now): ?object
    {
        $staleBefore = $now->subSeconds((int) config('workflow_outbox.processing_timeout_seconds', 300));
        $updated = DB::table('workflow_outbox')
            ->where('id', $id)
            ->where(function ($query) use ($now, $staleBefore): void {
                $query
                    ->where(function ($pending) use ($now): void {
                        $pending->where('status', WorkflowOutboxStatus::Pending->value)
                            ->where('available_at', '<=', $now);
                    })
                    ->orWhere(function ($processing) use ($staleBefore): void {
                        $processing->where('status', WorkflowOutboxStatus::Processing->value)
                            ->where('processing_started_at', '<=', $staleBefore);
                    });
            })
            ->update([
                'status' => WorkflowOutboxStatus::Processing->value,
                'attempts' => DB::raw('attempts + 1'),
                'processing_started_at' => $now,
                'updated_at' => $now,
            ]);

        return $updated === 1 ? $this->find($id) : null;
    }

    public function complete(string $id): void
    {
        $now = now();
        DB::table('workflow_outbox')->where('id', $id)->update([
            'status' => WorkflowOutboxStatus::Completed->value,
            'completed_at' => $now,
            'processing_started_at' => null,
            'updated_at' => $now,
        ]);
    }

    public function retry(string $id, string $error, CarbonImmutable $availableAt): void
    {
        $now = now();
        DB::table('workflow_outbox')->where('id', $id)->update([
            'status' => WorkflowOutboxStatus::Pending->value,
            'available_at' => $availableAt,
            'processing_started_at' => null,
            'last_error' => mb_substr($error, 0, 5000),
            'updated_at' => $now,
        ]);
    }

    public function deadLetter(string $id, string $error): void
    {
        $now = now();
        DB::table('workflow_outbox')->where('id', $id)->update([
            'status' => WorkflowOutboxStatus::DeadLetter->value,
            'dead_lettered_at' => $now,
            'processing_started_at' => null,
            'last_error' => mb_substr($error, 0, 5000),
            'updated_at' => $now,
        ]);
    }

    private function decode(?object $row): ?object
    {
        if ($row === null) {
            return null;
        }

        $row->payload = json_decode((string) $row->payload, true, 512, JSON_THROW_ON_ERROR);

        return $row;
    }
}
