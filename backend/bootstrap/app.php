<?php

use App\Console\Commands\ProvisionBackroomUsers;
use App\Console\Commands\PruneIdempotencyKeys;
use App\Console\Commands\ReconcileSeaTalkApprovals;
use App\Console\Commands\RetryUserEvents;
use App\Console\Commands\SentryTest;
use App\Console\Commands\SyncRequestsToGoogleSheet;
use App\Console\Commands\VerifyProductionConfig;
use App\Http\Middleware\AuthenticateSupabase;
use App\Http\Middleware\IdempotencyMiddleware;
use App\Http\Middleware\RequestTelemetry;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\VerifySeaTalkCallback;
use App\Http\Middleware\VerifySeaTalkEventCallback;
use App\Http\Middleware\VerifySessionCsrf;
use App\Jobs\ExpireSeaTalkAssignments;
use App\Jobs\SyncRequestsToGoogleSheetJob;
use App\Support\ApiRequestConsoleLogger;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Sentry\Laravel\Integration;
use Symfony\Component\HttpFoundation\Response;
use Throwable as ThrowableType;

// This application uses direct outbound TLS connections. Prevent inherited
// machine proxy variables from routing Google, Supabase, or other HTTP calls
// through an unavailable local proxy.
foreach (['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'] as $proxyVariable) {
    putenv($proxyVariable);
    unset($_ENV[$proxyVariable], $_SERVER[$proxyVariable]);
}
putenv('NO_PROXY=*');
putenv('no_proxy=*');

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withCommands([
        ProvisionBackroomUsers::class,
        PruneIdempotencyKeys::class,
        ReconcileSeaTalkApprovals::class,
        RetryUserEvents::class,
        SyncRequestsToGoogleSheet::class,
        VerifyProductionConfig::class,
        SentryTest::class,
    ])
    ->withSchedule(function (Schedule $schedule): void {
        $schedule->job(new SyncRequestsToGoogleSheetJob)
            ->everyFiveMinutes()
            ->withoutOverlapping();
        $schedule->command('idempotency:prune')->hourly()->withoutOverlapping();
        $schedule->command('audit:retry-user-events')->everyFiveMinutes()->withoutOverlapping();
        $schedule->job(new ExpireSeaTalkAssignments)->everyMinute()->withoutOverlapping();
        $schedule->command('seatalk:reconcile-approvals --repair')->everyFiveMinutes()->withoutOverlapping();
    })
    ->withMiddleware(function (Middleware $middleware): void {
        // XSRF-TOKEN is intentionally readable by the same-origin SPA, like
        // Laravel's standard CSRF cookie. The session cookie remains encrypted.
        $middleware->encryptCookies(except: ['XSRF-TOKEN']);
        $trustedProxies = array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '')))));
        $middleware->trustProxies(at: $trustedProxies);
        $middleware->append(SecurityHeaders::class);
        $middleware->append(RequestTelemetry::class);
        $middleware->alias([
            'supabase.auth' => AuthenticateSupabase::class,
            'idempotency' => IdempotencyMiddleware::class,
            'seatalk.callback' => VerifySeaTalkCallback::class,
            'seatalk.event.callback' => VerifySeaTalkEventCallback::class,
            'session.csrf' => VerifySessionCsrf::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);
        $exceptions->report(function (ThrowableType $exception): ?bool {
            if (request()->is('api', 'api/*')) {
                Log::channel('single')->error('API request exception', [
                    'exception' => $exception,
                ]);

                return false;
            }

            return null;
        });
        $exceptions->respond(function (Response $response, ThrowableType $exception, Request $request): Response {
            $consoleLogger = app(ApiRequestConsoleLogger::class);

            if ($consoleLogger->isApiRequest($request)) {
                $startedAt = $request->attributes->get('request_started_at');
                $durationMs = is_numeric($startedAt)
                    ? round((microtime(true) - (float) $startedAt) * 1000, 2)
                    : 0.0;

                $consoleLogger->log($request, $response->getStatusCode(), $durationMs);
            }

            return $response;
        });
    })
    ->create();
