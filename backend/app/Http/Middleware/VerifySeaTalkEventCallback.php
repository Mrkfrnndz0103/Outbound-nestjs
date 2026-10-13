<?php

namespace App\Http\Middleware;

use App\Features\Approvals\SeaTalkCallbackSignature;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class VerifySeaTalkEventCallback
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(
            SeaTalkCallbackSignature::verifyEvent(
                $request->getContent(),
                $request->header('Signature'),
                (string) config('services.seatalk.approval.callback_signing_secret'),
            ),
            401,
            'Invalid SeaTalk event callback signature.',
        );

        return $next($request);
    }
}
