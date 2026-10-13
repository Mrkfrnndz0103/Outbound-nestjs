<?php

use App\Features\Approvals\PresenceController;
use App\Features\Approvals\SeaTalkApprovalCallbackController;
use App\Features\Approvals\SeaTalkEventCallbackController;
use App\Features\Auth\BackroomController;
use App\Features\Auth\SeatalkController;
use App\Features\Dispatch\DispatchController;
use App\Features\Kpi\KpiController;
use App\Features\Notifications\NotificationController;
use App\Features\Requests\RequestController;
use App\Features\Users\AccessRequestController;
use App\Features\Users\UserController;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

$registerApiRoutes = static function (string $prefix): void {
    Route::prefix($prefix)->group(static function (): void {
        Route::get('/auth/status', function () {
            abort_unless(
                filled(config('services.supabase.url')) && filled(config('services.supabase.anon_key')),
                503,
                'Authentication service is not configured.'
            );

            return response()->json(['configured' => true]);
        });

        Route::middleware([
            EncryptCookies::class,
            AddQueuedCookiesToResponse::class,
            StartSession::class,
            'session.csrf',
            'throttle:api-ip',
            'throttle:api',
        ])->group(function (): void {
            Route::get('/auth/seatalk/config', [SeatalkController::class, 'config']);
            Route::post('/auth/seatalk/logout', [SeatalkController::class, 'logout']);
        });

        Route::post('/auth/backroom/login', [BackroomController::class, 'login'])->middleware('throttle:backroom');
        Route::post('/access-requests', [AccessRequestController::class, 'store'])->middleware('throttle:3,10');

        Route::middleware(['throttle:seatalk-callback', 'seatalk.callback'])->group(function (): void {
            Route::post('/integrations/seatalk/approval/approve', [SeaTalkApprovalCallbackController::class, 'approve']);
            Route::post('/integrations/seatalk/approval/reject', [SeaTalkApprovalCallbackController::class, 'reject']);
        });
        Route::post('/integrations/seatalk/events', [SeaTalkEventCallbackController::class, 'verify'])
            ->middleware(['throttle:seatalk-callback', 'seatalk.event.callback']);

        Route::middleware([EncryptCookies::class, AddQueuedCookiesToResponse::class, StartSession::class, 'session.csrf', 'throttle:api-ip', 'supabase.auth', 'throttle:api'])->group(function (): void {
            Route::get('/auth/me', fn (Request $r) => response()->json($r->attributes->get('actor')));
            Route::post('/auth/password-changed', [BackroomController::class, 'changePassword']);
            Route::get('/users', [UserController::class, 'index']);
            Route::post('/users', [UserController::class, 'store']);
            Route::put('/users/{id}', [UserController::class, 'update']);
            Route::patch('/users/{id}/disable', [UserController::class, 'disable']);
            Route::post('/users/{id}/reset-password', [UserController::class, 'resetPassword']);
            Route::get('/notifications', [NotificationController::class, 'index']);
            Route::patch('/notifications/read-all', [NotificationController::class, 'readAll']);
            Route::patch('/notifications/{id}/read', [NotificationController::class, 'read']);
            Route::post('/presence/heartbeat', [PresenceController::class, 'heartbeat']);
            Route::get('/clusters', function (Request $request) {
                $data = $request->validate(['search' => 'required|string|min:3|max:80']);
                $search = strtolower($data['search']);

                return response()->json(['data' => DB::table('clusters')
                    ->select('id', 'cluster_name', 'hub_name', 'region', 'dock_number', 'backlogs', 'backlogs_ts')
                    ->where(function ($query) use ($search): void {
                        $query->whereRaw('lower(cluster_name) like ?', ["%{$search}%"])
                            ->orWhereRaw('lower(hub_name) like ?', ["%{$search}%"]);
                    })
                    ->where(function ($query): void {
                        $query->where('active', true)->orWhereNull('active');
                    })
                    ->orderBy('cluster_name')
                    ->limit(12)
                    ->get()]);
            });
            Route::get('/kpi/summary', [KpiController::class, 'summary']);
            Route::get('/kpi/daily', [KpiController::class, 'daily']);
            Route::get('/dispatch/intraday', [DispatchController::class, 'intraday']);
            Route::get('/requests/metrics', [RequestController::class, 'metrics']);
            Route::get('/requests/analytics', [RequestController::class, 'analytics']);
            Route::get('/requests', [RequestController::class, 'index']);
            Route::post('/requests', [RequestController::class, 'store'])->middleware('idempotency');
            Route::post('/requests/bulk-approve', [RequestController::class, 'bulkApprove'])->middleware('idempotency');
            Route::get('/requests/{id}', [RequestController::class, 'show']);
            Route::get('/requests/{id}/events', [RequestController::class, 'events']);
            Route::put('/requests/{id}', [RequestController::class, 'update'])->middleware('idempotency');
            Route::post('/requests/{id}/{action}', [RequestController::class, 'action'])->middleware('idempotency')
                ->whereIn('action', ['approve', 'reject-ops', 'cancel', 'reject-mm', 'assign-truck', 'mark-docked', 'reassign-driver']);
        });
    });
};

// Versioned routes are canonical; the unversioned group preserves existing clients.
$registerApiRoutes('v1');
$registerApiRoutes('');
