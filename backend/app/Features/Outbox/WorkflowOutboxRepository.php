<?php

namespace App\Features\Outbox;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class WorkflowOutboxRepository
{
    public function dueIds(int $limit): array
    {
        $now = CarbonImmutable::now();
        $stale = $now->subSeconds(max(1, (int) config('workflow_outbox.processing_timeout_seconds', 300)));

        return DB::table('workflow_outbox')->where(function (Builder $query) use ($now, $stale): void {
            $query->where(fn (Builder $pending) => $pending->where('status', 'PENDING')->where('available_at', '<=', $now))
                ->orWhere(fn (Builder $processing) => $processing->where('status', 'PROCESSING')->where('processing_started_at', '<=', $stale));
        })->orderBy('available_at')->orderBy('id')->limit(min(max($limit, 1), 1000))->pluck('id')->all();
    }

    private function owned(string $id, object $lease): Builder
    {
        return DB::table('workflow_outbox')->where('id', $id)->where('id', $lease->id)
            ->where('status', 'PROCESSING')->where('attempts', $lease->attempts)
            ->where('processing_started_at', $lease->processing_started_at);
    }

    public function replay(string $id): bool
    {
        return DB::table('workflow_outbox')->where('id', $id)->where('status', 'DEAD_LETTER')->update([
            'status' => 'PENDING', 'attempts' => 0, 'available_at' => now(),
            'processing_started_at' => null, 'dead_lettered_at' => null, 'updated_at' => now(),
        ]) === 1;
    }

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
        return DB::transaction(function () use ($id, $now): ?object {
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
        });
    }

    public function complete(string $id, object $lease): void
    {
        $now = now();
        $this->owned($id, $lease)->update([
            'status' => WorkflowOutboxStatus::Completed->value,
            'completed_at' => $now,
            'processing_started_at' => null,
            'updated_at' => $now,
        ]);
    }

    public function retry(string $id, string $error, CarbonImmutable $availableAt, object $lease): void
    {
        $now = now();
        $this->owned($id, $lease)->update([
            'status' => WorkflowOutboxStatus::Pending->value,
            'available_at' => $availableAt,
            'processing_started_at' => null,
            'last_error' => mb_substr($error, 0, 5000),
            'updated_at' => $now,
        ]);
    }

    public function deadLetter(string $id, string $error, object $lease): void
    {
        $now = now();
        $this->owned($id, $lease)->update([
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
