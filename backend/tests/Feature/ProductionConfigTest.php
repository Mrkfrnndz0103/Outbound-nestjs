<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class ProductionConfigTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
    }

    public function test_production_config_rejects_debug_mode(): void
    {
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();
        config()->set([
            'app.env' => 'production',
            'app.debug' => true,
            'app.key' => 'base64:test-key',
            'app.url' => 'https://api.example.test',
            'app.frontend_url' => 'https://frontend.example.test',
            'session.secure' => true,
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.admin_emails' => ['admin@example.test'],
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'password',
            'database.connections.pgsql.sslmode' => 'require',
        ]);

        $this->artisan('system:verify-config', ['--production' => true])->assertExitCode(1);
    }

    public function test_staging_config_accepts_secure_configuration(): void
    {
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();

        config()->set([
            'app.env' => 'staging',
            'app.debug' => false,
            'app.key' => 'base64:test-key',
            'app.url' => 'https://staging-api.example.test',
            'app.frontend_url' => 'https://staging-frontend.example.test',
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.admin_emails' => ['admin@example.test'],
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'password',
            'database.connections.pgsql.sslmode' => 'require',
        ]);

        $this->artisan('system:verify-config', ['--staging' => true])->assertExitCode(0);
    }

    public function test_staging_config_rejects_insecure_frontend_or_session_cookie_settings(): void
    {
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();

        config()->set([
            'app.env' => 'staging',
            'app.debug' => false,
            'app.key' => 'base64:test-key',
            'app.url' => 'https://staging-api.example.test',
            'app.frontend_url' => 'http://staging-frontend.example.test',
            'session.secure' => false,
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.admin_emails' => ['admin@example.test'],
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'password',
            'database.connections.pgsql.sslmode' => 'require',
        ]);

        $this->artisan('system:verify-config', ['--staging' => true])
            ->expectsOutput('FRONTEND_URL must use HTTPS in staging.')
            ->expectsOutput('SESSION_SECURE_COOKIE must be true in staging.')
            ->assertExitCode(1);
    }

    public function test_production_config_accepts_secure_configuration(): void
    {
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();

        config()->set([
            'app.env' => 'production',
            'app.debug' => false,
            'app.key' => 'base64:test-key',
            'app.url' => 'https://api.example.test',
            'app.frontend_url' => 'https://frontend.example.test',
            'session.secure' => true,
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.admin_emails' => ['admin@example.test'],
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'password',
            'database.connections.pgsql.sslmode' => 'require',
        ]);

        $this->artisan('system:verify-config', ['--production' => true])->assertExitCode(0);
    }

    public function test_production_config_fails_when_a_required_table_is_missing(): void
    {
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnFalse();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();

        config()->set([
            'app.env' => 'production',
            'app.debug' => false,
            'app.key' => 'base64:test-key',
            'app.url' => 'https://api.example.test',
            'app.frontend_url' => 'https://frontend.example.test',
            'session.secure' => true,
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.admin_emails' => ['admin@example.test'],
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'password',
            'database.connections.pgsql.sslmode' => 'require',
        ]);

        $this->artisan('system:verify-config', ['--production' => true])->assertExitCode(1);
    }

    public function test_production_config_rejects_a_missing_supabase_ca_bundle(): void
    {
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();

        config()->set([
            'app.env' => 'production',
            'app.debug' => false,
            'app.key' => 'base64:test-key',
            'app.url' => 'https://api.example.test',
            'app.frontend_url' => 'https://frontend.example.test',
            'session.secure' => true,
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.supabase.ca_bundle' => '/missing/prod-ca.crt',
            'services.admin_emails' => ['admin@example.test'],
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'password',
            'database.connections.pgsql.sslmode' => 'require',
        ]);

        $this->artisan('system:verify-config', ['--production' => true])
            ->expectsOutput('SUPABASE_CA_BUNDLE must reference a readable file when configured.')
            ->assertExitCode(1);
    }

    public function test_production_config_rejects_insecure_frontend_or_session_cookie_settings(): void
    {
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();

        config()->set([
            'app.env' => 'production',
            'app.debug' => false,
            'app.key' => 'base64:test-key',
            'app.url' => 'https://api.example.test',
            'app.frontend_url' => 'http://frontend.example.test',
            'session.secure' => false,
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.admin_emails' => ['admin@example.test'],
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'password',
            'database.connections.pgsql.sslmode' => 'require',
        ]);

        $this->artisan('system:verify-config', ['--production' => true])
            ->expectsOutput('FRONTEND_URL must use HTTPS in production.')
            ->expectsOutput('SESSION_SECURE_COOKIE must be true in production.')
            ->assertExitCode(1);
    }

    public function test_staging_config_rejects_enabled_seatalk_approvals_without_assignment_token_secret(): void
    {
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();

        config()->set([
            'app.env' => 'staging',
            'app.debug' => false,
            'app.key' => 'base64:test-key',
            'app.url' => 'https://staging-api.example.test',
            'app.frontend_url' => 'https://staging-frontend.example.test',
            'session.secure' => true,
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.admin_emails' => ['admin@example.test'],
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'password',
            'database.connections.pgsql.sslmode' => 'require',
            'services.seatalk.approval.requested_enabled' => true,
            'services.seatalk.approval.token_secret' => null,
        ]);

        $this->artisan('system:verify-config', ['--staging' => true])
            ->expectsOutput('SEATALK_APPROVAL_TOKEN_SECRET is required when SeaTalk approvals are enabled.')
            ->assertExitCode(1);
    }
}
