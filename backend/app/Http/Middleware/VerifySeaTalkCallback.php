<?php

namespace App\Http\Middleware;

use App\Features\Approvals\SeaTalkCallbackSignature;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

final class VerifySeaTalkCallback
{
    public function handle(Request $request, Closure $next): Response
    {
        $valid = SeaTalkCallbackSignature::verifyApproval(
            $request->getMethod(),
            $request->getRequestUri(),
            $request->header('Content-Type'),
            $request->getContent(),
            $request->header('Date'),
            $request->header('x-token'),
            $request->header('Authorization'),
            (string) config('services.seatalk.app_secret'),
        );
        if (! $valid) {
            Log::warning('Invalid SeaTalk approval callback signature.', [
                'path' => $request->path(),
                'event_id' => $request->input('event_id'),
            ]);
            abort(401, 'Invalid SeaTalk callback signature.');
        }

        return $next($request);
    }
}
