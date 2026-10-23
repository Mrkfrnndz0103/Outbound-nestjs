<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class ProductionConfigTest extends TestCase
{
    public function test_worker_preflight_checks_runtime_support_with_safe_timeouts(): void
    {
        config()->set([
            'app.key' => 'base64:test-key',
            'app.url' => 'https://api.example.test',
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'publishable-key',
            'services.supabase.service_key' => 'service-key',
            'services.supabase.ca_bundle' => null,
            'services.admin_emails' => ['admin@example.test'],
            'services.google_sheets.sync_enabled' => false,
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres',
            'database.connections.pgsql.password' => 'test-password',
            'queue.default' => 'database',
            'queue.connections.database.retry_after' => 120,
            'workflow_outbox.processing_timeout_seconds' => 300,
        ]);

        $command = $this->artisan('system:verify-config', ['--worker-timeout' => '90']);
        if (extension_loaded('pcntl')) {
            $command->expectsOutput('Application configuration is valid.')->assertExitCode(0);
        } else {
            $command->expectsOutput('Async workers require the PHP pcntl extension for timeout and shutdown signals.')
                ->assertExitCode(1);
        }
    }

    public function test_worker_preflight_rejects_equal_timeout_and_reservation(): void
    {
        config()->set('queue.default', 'database');
        config()->set('queue.connections.database.retry_after', 90);

        $this->artisan('system:verify-config', ['--worker-timeout' => '90'])
            ->expectsOutput('Worker timeout must be less than the queue retry_after reservation.')
            ->assertExitCode(1);
    }

    public function test_worker_preflight_rejects_reservation_at_outbox_lease(): void
    {
        config()->set('queue.default', 'database');
        config()->set('queue.connections.database.retry_after', 300);
        config()->set('workflow_outbox.processing_timeout_seconds', 300);

        $this->artisan('system:verify-config', ['--worker-timeout' => '90'])
            ->expectsOutput('Queue retry_after must be less than the workflow outbox processing lease.')
            ->assertExitCode(1);
    }

    public function test_worker_preflight_rejects_invalid_timeout(): void
    {
        $this->artisan('system:verify-config', ['--worker-timeout' => 'invalid'])
            ->expectsOutput('--worker-timeout must be a positive integer matching queue:work --timeout.')
            ->assertExitCode(1);
    }

    public function test_worker_preflight_rejects_sync_connection(): void
    {
        config()->set('queue.default', 'sync');

        $this->artisan('system:verify-config', ['--worker-timeout' => '90'])
            ->expectsOutput('Worker preflight requires a database or redis queue connection.')
            ->assertExitCode(1);
    }

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
