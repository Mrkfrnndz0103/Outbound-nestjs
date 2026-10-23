<?php

namespace App\Features\Outbox;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class WorkflowOutboxStatusController
{
    public function show(Request $request): JsonResponse
    {
        $actor = $request->attributes->get('actor');
        abort_unless(($actor->role ?? null) === 'ops_pic' && ($actor->is_admin ?? false), 403, 'Only admin operations users can view outbox status.');

        return response()->json(app(WorkflowOutboxRepository::class)->statusSnapshot());
    }
}
