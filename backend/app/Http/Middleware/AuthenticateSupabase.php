<?php

namespace App\Http\Middleware;

use App\Integrations\SupabaseHttpOptions;
use App\Support\AuthenticatedProfileCache;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

final class AuthenticateSupabase
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->session()->has('seatalk_profile_id')) {
            $profile = AuthenticatedProfileCache::findActive($request->session()->get('seatalk_profile_id'));
            abort_unless($profile, 401, 'Invalid or expired SeaTalk session.');
            $profile->is_admin = in_array(strtolower((string) $profile->email), array_map('strtolower', config('services.admin_emails', [])), true);
            $profile->original_role = $profile->role;
            $viewRole = $request->header('X-View-Role');
            if ($profile->is_admin && in_array($viewRole, ['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer'], true)) {
                $profile->role = $viewRole;
            }
            $request->attributes->set('actor', $profile);
            $request->attributes->set('supabase_user_updated_at', null);

            return $next($request);
        }

        $token = $request->bearerToken();
        abort_unless($token, 401, 'Authentication required.');

        $supabaseUrl = rtrim((string) config('services.supabase.url'), '/');
        $supabaseKey = (string) config('services.supabase.anon_key');
        if ($supabaseUrl === '' || $supabaseKey === '') {
            Log::error('Supabase Auth is not configured.', [
                'url_configured' => $supabaseUrl !== '',
                'key_configured' => $supabaseKey !== '',
            ]);

            abort(503, 'Authentication service is not configured.');
        }

        $cacheKey = 'supabase_auth_user:'.hash('sha256', $token);
        $cacheTtl = (int) config('services.supabase.token_cache_ttl', 30);
        $cached = $cacheTtl > 0 ? Cache::get($cacheKey) : null;

        if ($cached !== null) {
            $authUserId = $cached['id'];
            $supabaseUpdatedAt = $cached['updated_at'];
        } else {
            $caBundle = config('services.supabase.ca_bundle');
            if (filled($caBundle) && (! is_file($caBundle) || ! is_readable($caBundle))) {
                Log::error('Supabase Auth TLS configuration is invalid.', [
                    'ca_bundle' => $caBundle,
                ]);

                abort(503, 'Authentication service TLS configuration is invalid.');
            }

            try {
                $response = Http::withHeaders(['apikey' => $supabaseKey])
                    ->withToken($token)
                    ->withOptions(SupabaseHttpOptions::guzzle())
                    ->withOptions(['verify' => config('services.supabase.ca_bundle') ?: true])
                    ->connectTimeout(config('services.supabase.connect_timeout', 5))
                    ->timeout(config('services.supabase.timeout', 10))
                    ->get($supabaseUrl.'/auth/v1/user');
            } catch (ConnectionException $exception) {
                Log::error('Unable to reach Supabase Auth.', [
                    'url' => $supabaseUrl,
                    'error' => $exception->getMessage(),
                ]);

                abort(503, 'Authentication service is temporarily unavailable.');
            }

            if (! $response->successful()) {
                Log::warning('Supabase rejected an authentication token.', [
                    'status' => $response->status(),
                ]);
                abort(401, 'Invalid or expired session.');
            }

            $authUserId = $response->json('id');
            $supabaseUpdatedAt = $response->json('updated_at');

            if ($cacheTtl > 0) {
                Cache::put($cacheKey, ['id' => $authUserId, 'updated_at' => $supabaseUpdatedAt], $cacheTtl);
            }
        }

        try {
            $profile = AuthenticatedProfileCache::findActive($authUserId);
        } catch (QueryException $exception) {
            Log::error('Unable to load the authenticated Supabase profile.', [
                'auth_user_id' => $authUserId,
                'sql_state' => $exception->errorInfo[0] ?? null,
                'error' => $exception->getMessage(),
            ]);

            abort(503, 'Account database is temporarily unavailable.');
        }
        abort_unless($profile, 403, 'Account is disabled or not provisioned.');
        $profile->is_admin = in_array(strtolower((string) $profile->email), array_map('strtolower', config('services.admin_emails', [])), true);
        $profile->original_role = $profile->role;
        $viewRole = $request->header('X-View-Role');
        if ($profile->is_admin && in_array($viewRole, ['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer'], true)) {
            $profile->role = $viewRole;
        }
        $request->attributes->set('actor', $profile);
        $request->attributes->set('supabase_user_updated_at', $supabaseUpdatedAt);

        if ($profile->must_change_password) {
            $allowed = [
                'GET:api/auth/me',
                'GET:api/v1/auth/me',
                'POST:api/auth/password-changed',
                'POST:api/v1/auth/password-changed',
            ];
            abort_unless(in_array($request->method().':'.$request->path(), $allowed, true), 403, 'Password change required.');
        }

        return $next($request);
    }
}
