<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class AuthenticateSupabaseTest extends TestCase
{
    private string $userId;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for Supabase authentication tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        config()->set('services.supabase', [
            'url' => 'https://test-project.supabase.co',
            'anon_key' => 'test-anon-key',
            'ca_bundle' => '',
            'token_cache_ttl' => 0,
        ]);
        Cache::flush();
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('role');
            $table->string('email')->nullable();
            $table->string('ops_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('must_change_password')->default(false);
            $table->timestamp('password_reset_at')->nullable();
            $table->timestamp('password_changed_at')->nullable();
            $table->timestamps();
        });

        $this->userId = (string) Str::uuid();
        DB::table('profiles')->insert([
            'id' => $this->userId,
            'name' => 'Backroom User',
            'role' => 'ops_pic',
            'email' => 'ops123@backroom.soc5.internal',
            'ops_id' => 'ops123',
            'is_active' => true,
            'must_change_password' => true,
            'password_reset_at' => now()->subMinute(),
            'created_at' => now()->subDay(),
            'updated_at' => now()->subMinute(),
        ]);
    }

    #[DataProvider('authenticationModes')]
    public function test_cookie_admin_preview_matches_bearer_effective_role(bool $cookie): void
    {
        config()->set('services.admin_emails', ['admin@example.test']);
        DB::table('profiles')->where('id', $this->userId)->update(['email' => 'admin@example.test', 'role' => 'fte_ops', 'must_change_password' => false]);
        Http::fake(['https://test-project.supabase.co/auth/v1/user' => Http::response(['id' => $this->userId])]);
        if ($cookie) {
            $this->withSession(['seatalk_profile_id' => $this->userId]);
        } else {
            $this->withToken('synthetic-admin-token');
        }
        $this->withHeader('X-View-Role', 'doc_officer')->getJson('/api/v1/auth/me')
            ->assertOk()->assertJsonPath('role', 'doc_officer');
    }

    public static function authenticationModes(): iterable
    {
        yield 'cookie' => [true];
        yield 'bearer' => [false];
    }

    public function test_missing_ca_bundle_returns_service_unavailable(): void
    {
        config()->set([
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.ca_bundle' => '/missing/prod-ca.crt',
            'services.supabase.token_cache_ttl' => 0,
        ]);

        $this->withToken('test-token')
            ->getJson('/api/auth/me')
            ->assertServiceUnavailable()
            ->assertJsonPath('message', 'Authentication service TLS configuration is invalid.');
    }

    public function test_versioned_auth_me_is_allowed_during_required_password_change(): void
    {
        Http::fake([
            'https://test-project.supabase.co/auth/v1/user' => Http::response([
                'id' => $this->userId,
                'updated_at' => now()->subMinute()->toIso8601String(),
            ]),
        ]);

        $this->withToken('test-token')
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('id', $this->userId)
            ->assertJsonPath('must_change_password', 1);
    }

    public function test_cookie_identity_wins_when_bearer_and_seatalk_credentials_are_both_present(): void
    {
        $this->withSession(['seatalk_profile_id' => $this->userId])
            ->withHeader('Authorization', 'Bearer invalid-bearer')
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('id', $this->userId);
    }

    public function test_stale_cookie_does_not_fall_back_to_a_bearer_identity(): void
    {
        Http::fake([
            'https://test-project.supabase.co/auth/v1/user' => Http::response(['id' => $this->userId], 200),
        ]);

        $this->withSession(['seatalk_profile_id' => (string) Str::uuid()])
            ->withToken('valid-bearer')
            ->getJson('/api/v1/auth/me')
            ->assertUnauthorized();

        Http::assertNothingSent();
    }
}
