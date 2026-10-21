<?php

namespace Tests\Feature;

use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use PDO;
use Tests\TestCase;

final class SeatalkOAuthSessionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for SeaTalk OAuth tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('role');
            $table->string('email')->unique();
            $table->string('ops_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('must_change_password')->default(false);
            $table->timestamp('password_reset_at')->nullable();
            $table->timestamp('password_changed_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->string('seatalk_employee_code')->nullable();
        });
    }

    public function test_seatalk_state_survives_from_config_request_to_callback(): void
    {
        $route = app('router')->getRoutes()->match(Request::create('/api/v1/auth/seatalk/config', 'GET'));

        $this->assertContains(EncryptCookies::class, $route->gatherMiddleware());
        $this->assertContains(AddQueuedCookiesToResponse::class, $route->gatherMiddleware());
        $this->assertNotContains('supabase.auth', $route->gatherMiddleware());

        config()->set('app.frontend_url', 'https://frontend.test');
        config()->set('services.seatalk', [
            'app_id' => 'test-app',
            'app_secret' => 'test-secret',
            'redirect_uri' => 'https://frontend.test/auth/seatalk/callback',
            'sdk_url' => 'https://example.test/seatalk.js',
            'token_url' => 'https://example.test/token',
            'user_url' => 'https://example.test/user',
            'connect_timeout' => 5,
            'timeout' => 10,
        ]);

        $configResponse = $this->getJson('/api/v1/auth/seatalk/config');
        $configResponse->assertOk();

        $state = $configResponse->json('state');
        $this->assertIsString($state);
        $this->assertNotSame('', $state);

        $this->get('/auth/seatalk/callback?state='.urlencode($state))
            ->assertRedirect('https://frontend.test/?seatalk=error&reason=missing_code');
    }

    public function test_seatalk_callback_persists_employee_code_on_the_matched_profile(): void
    {
        config()->set('app.frontend_url', 'https://frontend.test');
        config()->set('services.seatalk', [
            'app_id' => 'test-app',
            'app_secret' => 'test-secret',
            'redirect_uri' => 'https://frontend.test/auth/seatalk/callback',
            'sdk_url' => 'https://example.test/seatalk.js',
            'token_url' => 'https://example.test/token',
            'user_url' => 'https://example.test/user',
            'connect_timeout' => 5,
            'timeout' => 10,
        ]);
        DB::table('profiles')->insert([
            'id' => '11111111-1111-1111-1111-111111111111',
            'name' => 'FTE Ops',
            'role' => 'fte_ops',
            'email' => 'fte.ops@example.test',
            'is_active' => true,
        ]);
        Http::fake([
            'https://example.test/token' => Http::response(['code' => 0, 'app_access_token' => 'access-token']),
            'https://example.test/user*' => Http::response([
                'code' => 0,
                'employee' => [
                    'email' => 'fte.ops@example.test',
                    'employee_code' => 'seatalk-fte-ops-1',
                ],
            ]),
        ]);

        $configResponse = $this->getJson('/api/v1/auth/seatalk/config');
        $state = $configResponse->json('state');

        $this->get('/auth/seatalk/callback?state='.urlencode($state).'&code=oauth-code')
            ->assertRedirect('https://frontend.test/?seatalk=success');

        $this->assertSame(
            'seatalk-fte-ops-1',
            DB::table('profiles')->where('email', 'fte.ops@example.test')->value('seatalk_employee_code'),
        );
    }
}
