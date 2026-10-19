<?php

namespace App\Features\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

final class SeatalkController
{
    public function config(Request $request): JsonResponse
    {
        abort_unless($this->configured(), 503, 'SeaTalk login is not configured.');
        $state = Str::random(64);
        $request->session()->put('seatalk.oauth_state', $state);
        $request->session()->put('seatalk.oauth_state_expires_at', now()->addMinutes(10)->timestamp);

        return response()->json([
            'app_id' => config('services.seatalk.app_id'),
            'redirect_uri' => config('services.seatalk.redirect_uri'),
            'response_type' => 'code',
            'state' => $state,
            'sdk_url' => config('services.seatalk.sdk_url'),
        ]);
    }

    public function callback(Request $request): RedirectResponse
    {
        $frontend = rtrim((string) config('app.frontend_url'), '/');
        $state = (string) $request->query('state', '');
        $expected = (string) $request->session()->pull('seatalk.oauth_state', '');
        $expiresAt = (int) $request->session()->pull('seatalk.oauth_state_expires_at', 0);

        if ($state === '' || $expected === '' || $expiresAt < now()->timestamp || ! hash_equals($expected, $state)) {
            return $this->redirectWithError($frontend, 'invalid_state');
        }
        if ($request->filled('error')) {
            return $this->redirectWithError($frontend, 'cancelled');
        }

        $code = (string) $request->query('code', '');
        if ($code === '') {
            return $this->redirectWithError($frontend, 'missing_code');
        }

        try {
            $token = Http::asJson()->acceptJson()
                ->connectTimeout(config('services.seatalk.connect_timeout', 5))
                ->timeout(config('services.seatalk.timeout', 10))
                ->post(config('services.seatalk.token_url'), [
                    'app_id' => config('services.seatalk.app_id'),
                    'app_secret' => config('services.seatalk.app_secret'),
                ]);
            abort_unless(
                $token->successful()
                    && (int) $token->json('code') === 0
                    && $token->json('app_access_token'),
                422,
                'SeaTalk app authorization failed.'
            );

            $identity = Http::withToken($token->json('app_access_token'))
                ->acceptJson()
                ->connectTimeout(config('services.seatalk.connect_timeout', 5))
                ->timeout(config('services.seatalk.timeout', 10))
                ->get(config('services.seatalk.user_url'), ['code' => $code]);
            abort_unless(
                $identity->successful()
                    && (int) $identity->json('code') === 0
                    && is_array($identity->json('employee')),
                422,
                'SeaTalk identity lookup failed.'
            );

            $employee = $identity->json('employee');
            $email = strtolower(trim((string) data_get($employee, 'email')));
            abort_unless(filter_var($email, FILTER_VALIDATE_EMAIL), 403, 'SeaTalk account is missing a valid email.');

            $profile = DB::table('profiles')->whereRaw('lower(email) = ?', [$email])->where('is_active', true)->first([
                'id', 'name', 'role', 'email', 'ops_id', 'must_change_password', 'password_reset_at', 'password_changed_at', 'created_at',
            ]);
            abort_unless($profile, 403, 'SeaTalk account is not provisioned for SOC 5 Outbound.');

            $employeeCode = trim((string) data_get($employee, 'employee_code'));
            if ($employeeCode !== '') {
                DB::table('profiles')->where('id', $profile->id)->update([
                    'seatalk_employee_code' => $employeeCode,
                ]);
            }

            $request->session()->regenerate();
            $request->session()->put('seatalk_profile_id', $profile->id);
            $request->session()->put('seatalk_email', $email);
            $request->session()->put('seatalk_employee_code', $employeeCode !== '' ? $employeeCode : null);

            return redirect()->to($frontend.'/?seatalk=success');
        } catch (Throwable) {
            return $this->redirectWithError($frontend, 'login_failed');
        }
    }

    public function logout(Request $request): JsonResponse
    {
        $request->session()->forget(['seatalk_profile_id', 'seatalk_email', 'seatalk_employee_code']);
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    private function configured(): bool
    {
        return filled(config('services.seatalk.app_id'))
            && filled(config('services.seatalk.app_secret'))
            && filled(config('services.seatalk.redirect_uri'))
            && filled(config('services.seatalk.token_url'))
            && filled(config('services.seatalk.user_url'))
            && filled(config('services.seatalk.sdk_url'));
    }

    private function redirectWithError(string $frontend, string $error): RedirectResponse
    {
        return redirect()->to($frontend.'/?seatalk=error&reason='.rawurlencode($error));
    }
}
