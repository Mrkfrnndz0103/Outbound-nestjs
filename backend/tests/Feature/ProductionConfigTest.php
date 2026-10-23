<?php

namespace Tests\Feature;

use Illuminate\Database\Connection;
use Illuminate\Database\Schema\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class ProductionConfigTest extends TestCase
{
    #[DataProvider('seaTalkPrerequisites')]
    public function test_required_seatalk_rejects_each_missing_prerequisite(string $setting): void
    {
        $this->validRequiredSeaTalkConfig();
        config()->set('services.seatalk.approval.'.$setting, null);
        $this->artisan('system:verify-config', ['--require-seatalk' => true])->assertExitCode(1);
    }

    public static function seaTalkPrerequisites(): iterable
    {
        foreach (['requested_enabled', 'enabled', 'app_id', 'app_secret', 'callback_signing_secret', 'token_secret', 'base_url', 'create_path', 'update_path', 'detail_path', 'approve_callback_url', 'reject_callback_url'] as $key) {
            yield $key => [$key];
        }
    }

    public function test_required_seatalk_accepts_complete_configuration(): void
    {
        $this->validRequiredSeaTalkConfig();
        $this->artisan('system:verify-config', ['--require-seatalk' => true])->assertExitCode(0);
    }

    public function test_requested_seatalk_cannot_silently_disable_itself(): void
    {
        $this->validRequiredSeaTalkConfig();
        config()->set('services.seatalk.approval.enabled', false);
        $this->artisan('system:verify-config')->assertExitCode(1);
    }

    private function validRequiredSeaTalkConfig(): void
    {
        config()->set([
            'app.key' => 'base64:test-key', 'app.url' => 'https://api.example.test',
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.anon_key' => 'test-key', 'services.supabase.service_key' => 'test-key',
            'services.supabase.ca_bundle' => null, 'services.admin_emails' => ['admin@example.test'],
            'services.google_sheets.sync_enabled' => false,
            'database.connections.pgsql.host' => 'db.example.test',
            'database.connections.pgsql.username' => 'postgres', 'database.connections.pgsql.password' => 'test-password',
            'services.seatalk.approval' => [
                'requested_enabled' => true, 'enabled' => true, 'app_id' => 'app', 'app_secret' => 'test-secret',
                'callback_signing_secret' => 'test-secret', 'token_secret' => 'test-secret',
                'base_url' => 'https://provider.example.test', 'create_path' => '/create', 'update_path' => '/update', 'detail_path' => '/detail',
                'approve_callback_url' => 'https://api.example.test/approve', 'reject_callback_url' => 'https://api.example.test/reject',
            ],
        ]);
    }

    #[DataProvider('unsafeProductionStorage')]
    public function test_production_rejects_non_shared_or_invalid_storage(string $key, mixed $value): void
    {
        $this->validRequiredSeaTalkConfig();
        config()->set([
            'app.env' => 'production', 'app.debug' => false, 'app.frontend_url' => 'https://frontend.example.test',
            'session.secure' => true, 'database.connections.pgsql.sslmode' => 'require',
            $key => $value,
        ]);
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();
        $this->artisan('system:verify-config', ['--production' => true])->assertExitCode(1);
    }

    public static function unsafeProductionStorage(): iterable
    {
        yield ['session.driver', 'file'];
        yield ['session.driver', 'array'];
        yield ['session.connection', 'default'];
        yield ['cache.default', 'file'];
        yield ['cache.default', 'array'];
        yield ['cache.stores.database.connection', 'default'];
        yield ['cache.stores.database.lock_connection', 'default'];
    }

    #[DataProvider('productionStorageTables')]
    public function test_production_requires_selected_storage_tables(string $table): void
    {
        $this->validRequiredSeaTalkConfig();
        config()->set([
            'app.env' => 'production', 'app.debug' => false, 'app.frontend_url' => 'https://frontend.example.test',
            'session.secure' => true, 'database.connections.pgsql.sslmode' => 'require', 'queue.default' => 'database',
        ]);
        Schema::shouldReceive('hasTable')->with('user_events')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with('idempotency_keys')->andReturnTrue();
        Schema::shouldReceive('hasTable')->with($table)->andReturnFalse();
        $this->artisan('system:verify-config', ['--production' => true])
            ->expectsOutput('Required production storage table is missing: '.$table)->assertExitCode(1);
    }

    public static function productionStorageTables(): iterable
    {
        foreach (['sessions', 'cache', 'cache_locks', 'jobs', 'workflow_outbox'] as $table) {
            yield $table => [$table];
        }
    }

    public function test_sheets_preflight_rejects_negative_export_window(): void
    {
        $this->validRequiredSeaTalkConfig();
        config()->set([
            'services.google_sheets.sync_enabled' => true,
            'services.google_sheets.spreadsheet_id' => 'synthetic-sheet',
            'services.google_sheets.credentials_json' => '{}',
            'services.google_sheets.max_rows' => 100,
            'services.google_sheets.lookback_days' => -1,
        ]);
        $this->artisan('system:verify-config')->assertExitCode(1);
    }

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
        config()->set('database.default', 'pgsql');
        $schema = \Mockery::mock(Builder::class);
        Schema::swap($schema);
        $connection = \Mockery::mock(Connection::class);
        $connection->shouldReceive('getSchemaBuilder')->andReturn($schema);
        DB::shouldReceive('connection')->with('pgsql')->andReturn($connection);
        config()->set('session.driver', 'database');
        config()->set('session.connection', 'pgsql');
        config()->set('cache.default', 'database');
        config()->set('cache.stores.database.connection', 'pgsql');
        config()->set('cache.stores.database.lock_connection', 'pgsql');
        config()->set('queue.default', 'sync');
        foreach (['sessions', 'cache', 'cache_locks', 'jobs', 'workflow_outbox'] as $table) {
            Schema::shouldReceive('hasTable')->with($table)->andReturnTrue()->byDefault();
        }

        config()->set('services.seatalk.approval.requested_enabled', false);
        config()->set('services.seatalk.approval.enabled', false);
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
