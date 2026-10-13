<?php

namespace App\Features\Outbox;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class WorkflowOutboxStatusController
{
    public function show(Request $request): JsonResponse
    {
        $actor = $request->attributes->get('actor');
        abort_unless(($actor->role ?? null) === 'ops_pic' && ($actor->is_admin ?? false), 403, 'Only admin operations users can view outbox status.');

        $counts = collect(['PENDING', 'PROCESSING', 'COMPLETED', 'DEAD_LETTER'])
            ->mapWithKeys(fn (string $status): array => [$status => DB::table('workflow_outbox')->where('status', $status)->count()]);

        return response()->json([
            'counts' => $counts,
            'oldest_pending' => $this->oldest('PENDING'),
            'oldest_dead_letter' => $this->oldest('DEAD_LETTER'),
        ]);
    }

    private function oldest(string $status): ?string
    {
        $value = DB::table('workflow_outbox')->where('status', $status)->orderBy('created_at')->value('created_at');

        return $value === null ? null : (string) $value;
    }
}
