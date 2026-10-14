<?php

namespace Tests\Feature;

use Illuminate\Support\Env;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class SeatalkApprovalConfigurationTest extends TestCase
{
    #[DataProvider('approvalGatePrerequisites')]
    public function test_approval_center_remains_disabled_when_a_required_setting_is_missing(string $missing): void
    {
        $approval = $this->loadApprovalConfig([$missing => null]);

        $this->assertFalse($approval['enabled'], "Approval Center should remain disabled when {$missing} is missing.");
    }

    public static function approvalGatePrerequisites(): iterable
    {
        yield 'app id' => ['SEATALK_APP_ID'];
        yield 'app secret' => ['SEATALK_APP_SECRET'];
        yield 'callback signing secret' => ['SEATALK_CALLBACK_SIGNING_SECRET'];
        yield 'approval token secret' => ['SEATALK_APPROVAL_TOKEN_SECRET'];
        yield 'approve callback url' => ['SEATALK_APPROVE_CALLBACK_URL'];
        yield 'reject callback url' => ['SEATALK_REJECT_CALLBACK_URL'];
    }

    public function test_approval_center_defaults_to_disabled_with_safe_non_secret_values(): void
    {
        $approval = $this->loadApprovalConfig([
            'SEATALK_APPROVAL_ENABLED' => 'false',
        ]);

        $this->assertIsArray($approval);
        $this->assertFalse($approval['enabled']);
        $this->assertArrayHasKey('app_id', $approval);
        $this->assertArrayHasKey('app_secret', $approval);
        $this->assertArrayHasKey('callback_signing_secret', $approval);
        $this->assertSame('https://openapi.seatalk.io', $approval['base_url']);
        $this->assertSame(180, $approval['assignment_seconds']);
        $this->assertSame(60, $approval['presence_active_seconds']);
        $this->assertSame(5, $approval['connect_timeout']);
        $this->assertSame(10, $approval['timeout']);
    }

    public function test_approval_callbacks_are_server_only_and_not_in_any_public_seatalk_config(): void
    {
        config()->set([
            'services.seatalk.app_id' => 'public-test-app',
            'services.seatalk.app_secret' => 'public-test-secret',
            'services.seatalk.redirect_uri' => 'https://frontend.example.test/auth/seatalk/callback',
            'services.seatalk.sdk_url' => 'https://example.test/seatalk.js',
            'services.seatalk.token_url' => 'https://example.test/token',
            'services.seatalk.user_url' => 'https://example.test/user',
            'services.seatalk.approval.approve_callback_url' => 'https://api.example.test/approve',
            'services.seatalk.approval.reject_callback_url' => 'https://api.example.test/reject',
            'services.seatalk.approval.callback_signing_secret' => 'server-only-test-secret',
        ]);

        $this->assertSame(
            'https://api.example.test/approve',
            config('services.seatalk.approval.approve_callback_url'),
        );
        $this->assertSame(
            'https://api.example.test/reject',
            config('services.seatalk.approval.reject_callback_url'),
        );

        foreach (['/api/v1/auth/seatalk/config', '/api/auth/seatalk/config'] as $route) {
            $payload = $this->getJson($route)
                ->assertOk()
                ->json();

            $this->assertArrayNotHasKey('approval', $payload);
            $this->assertPublicConfigDoesNotContainSensitiveKeys($payload);
            $this->assertPublicConfigDoesNotContainSensitiveValues($payload, [
                'public-test-secret',
                'server-only-test-secret',
                'https://api.example.test/approve',
                'https://api.example.test/reject',
            ]);
        }
    }

    private function loadApprovalConfig(array $overrides = []): array
    {
        $defaults = [
            'SEATALK_APPROVAL_ENABLED' => 'true',
            'SEATALK_APP_ID' => 'test-app-id',
            'SEATALK_APP_SECRET' => 'test-app-secret',
            'SEATALK_CALLBACK_SIGNING_SECRET' => 'test-callback-signing-secret',
            'SEATALK_APPROVAL_TOKEN_SECRET' => 'test-approval-token-secret',
            'SEATALK_APPROVE_CALLBACK_URL' => 'https://api.example.test/approve',
            'SEATALK_REJECT_CALLBACK_URL' => 'https://api.example.test/reject',
        ];
        $previous = [];

        foreach ($defaults as $key => $default) {
            $previous[$key] = [
                'environment' => getenv($key),
                'env' => array_key_exists($key, $_ENV) ? $_ENV[$key] : null,
                'has_env' => array_key_exists($key, $_ENV),
                'server' => array_key_exists($key, $_SERVER) ? $_SERVER[$key] : null,
                'has_server' => array_key_exists($key, $_SERVER),
            ];

            $value = array_key_exists($key, $overrides) ? $overrides[$key] : $default;
            if ($value === null) {
                putenv($key);
                unset($_ENV[$key], $_SERVER[$key]);
            } else {
                putenv("{$key}={$value}");
                $_ENV[$key] = $value;
                $_SERVER[$key] = $value;
            }
        }

        try {
            Env::enablePutenv();
            $services = require base_path('config/services.php');

            return $services['seatalk']['approval'];
        } finally {
            foreach ($previous as $key => $values) {
                if ($values['environment'] === false) {
                    putenv($key);
                } else {
                    putenv("{$key}={$values['environment']}");
                }

                if ($values['has_env']) {
                    $_ENV[$key] = $values['env'];
                } else {
                    unset($_ENV[$key]);
                }

                if ($values['has_server']) {
                    $_SERVER[$key] = $values['server'];
                } else {
                    unset($_SERVER[$key]);
                }
            }

            Env::enablePutenv();
        }
    }

    private function assertPublicConfigDoesNotContainSensitiveKeys(array $payload): void
    {
        foreach (['app_secret', 'callback_signing_secret', 'approve_callback_url', 'reject_callback_url', 'approval'] as $key) {
            $this->assertFalse($this->containsKey($payload, $key), "Public config contains sensitive key {$key}.");
        }
    }

    private function assertPublicConfigDoesNotContainSensitiveValues(array $payload, array $values): void
    {
        $encoded = json_encode($payload, JSON_THROW_ON_ERROR);

        foreach ($values as $value) {
            $this->assertStringNotContainsString($value, $encoded);
        }
    }

    private function containsKey(array $value, string $needle): bool
    {
        foreach ($value as $key => $nested) {
            if ($key === $needle || (is_array($nested) && $this->containsKey($nested, $needle))) {
                return true;
            }
        }

        return false;
    }
}
