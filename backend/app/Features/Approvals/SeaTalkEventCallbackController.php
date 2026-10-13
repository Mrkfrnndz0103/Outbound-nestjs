<?php

namespace App\Features\Approvals;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SeaTalkEventCallbackController
{
    public function verify(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);
        abort_unless(is_array($payload), 400, 'Invalid SeaTalk event payload.');
        abort_unless(($payload['event_type'] ?? null) === 'event_verification', 400, 'Unsupported SeaTalk event.');

        $challenge = data_get($payload, 'event.seatalk_challenge');
        abort_unless(is_string($challenge) && $challenge !== '', 400, 'SeaTalk challenge is required.');

        return response()->json(['seatalk_challenge' => $challenge]);
    }
}
