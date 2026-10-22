<?php

namespace App\Features\Notifications;

use Illuminate\Database\Query\JoinClause;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class NotificationController
{
    public function index(Request $request): JsonResponse
    {
        $actor = $request->attributes->get('actor');
        $query = $this->visibleQuery($actor);
        $readAt = 'case when n.user_id = ? then n.read_at else nr.read_at end';
        $rows = (clone $query)
            ->select([
                'n.id', 'n.user_id', 'n.target_role', 'n.request_id', 'n.event_type',
                'n.title', 'n.body', 'n.created_at', DB::raw("{$readAt} as read_at"),
            ])
            ->addBinding($actor->id, 'select')
            ->orderByDesc('n.created_at')
            ->limit(50)
            ->get();
        $unread = (clone $query)
            ->whereRaw("({$readAt}) is null", [$actor->id])
            ->count();

        return response()->json(['data' => $rows, 'unread' => $unread]);
    }

    public function read(Request $request, int $id): JsonResponse
    {
        $actor = $request->attributes->get('actor');
        $notification = $this->visibleQuery($actor)->where('n.id', $id)->first(['n.id', 'n.user_id']);
        abort_unless($notification, 404, 'Notification not found.');

        if ($notification->user_id === $actor->id) {
            DB::table('notifications')->where('id', $id)->update(['read_at' => now()]);
        } else {
            $this->recordRoleReads($actor->id, [$id]);
        }

        return response()->json(['ok' => true]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $actor = $request->attributes->get('actor');

        DB::transaction(function () use ($actor): void {
            DB::table('notifications')
                ->where('user_id', $actor->id)
                ->whereNull('read_at')
                ->update(['read_at' => now()]);

            DB::table('notifications')
                ->where('target_role', $actor->role)
                ->orderBy('id')
                ->pluck('id')
                ->chunk(500)
                ->each(fn ($ids) => $this->recordRoleReads($actor->id, $ids->all()));
        });

        return response()->json(['ok' => true]);
    }

    public function readRequest(Request $request): JsonResponse
    {
        $data = $request->validate(['request_id' => 'required|uuid']);
        $actor = $request->attributes->get('actor');

        DB::transaction(function () use ($actor, $data): void {
            $notifications = $this->visibleQuery($actor)
                ->where('n.request_id', $data['request_id'])
                ->orderBy('n.id')
                ->get(['n.id', 'n.user_id']);

            foreach ($notifications->chunk(500) as $chunk) {
                $personal = $chunk->where('user_id', $actor->id)->pluck('id')->all();
                $shared = $chunk->reject(fn ($row): bool => $row->user_id === $actor->id)->pluck('id')->all();
                if ($personal !== []) {
                    DB::table('notifications')->whereIn('id', $personal)->whereNull('read_at')->update(['read_at' => now()]);
                }
                $this->recordRoleReads($actor->id, $shared);
            }
        });

        return response()->json(['ok' => true]);
    }

    private function visibleQuery(object $actor)
    {
        return DB::table('notifications as n')
            ->leftJoin('notification_reads as nr', function (JoinClause $join) use ($actor): void {
                $join->on('nr.notification_id', '=', 'n.id')
                    ->where('nr.user_id', '=', $actor->id);
            })
            ->where(function ($query) use ($actor): void {
                $query->where('n.user_id', $actor->id)
                    ->orWhere('n.target_role', $actor->role);
            });
    }

    private function recordRoleReads(string $userId, array $notificationIds): void
    {
        if ($notificationIds === []) {
            return;
        }

        $readAt = now();
        DB::table('notification_reads')->upsert(
            array_map(fn ($id): array => [
                'notification_id' => (int) $id,
                'user_id' => $userId,
                'read_at' => $readAt,
            ], $notificationIds),
            ['notification_id', 'user_id'],
            ['read_at'],
        );
    }
}
