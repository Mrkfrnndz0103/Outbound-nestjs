<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

final class VerifyProductionConfig extends Command
{
    protected $signature = 'system:verify-config {--production : Apply production-only requirements} {--staging : Apply staging-only requirements} {--worker-timeout= : Validate async worker safety against this queue:work timeout in seconds}';

    protected $description = 'Verify required application configuration before startup or deployment';

    public function handle(): int
    {
        $required = [
            'APP_KEY' => config('app.key'),
            'APP_URL' => config('app.url'),
            'SUPABASE_URL' => config('services.supabase.url'),
            'SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY' => config('services.supabase.anon_key'),
            'SUPABASE_SERVICE_ROLE_KEY' => config('services.supabase.service_key'),
            'ADMIN_EMAILS' => config('services.admin_emails'),
            'DB_HOST' => config('database.connections.pgsql.host'),
            'DB_USERNAME' => config('database.connections.pgsql.username'),
            'DB_PASSWORD' => config('database.connections.pgsql.password'),
        ];

        $failed = false;
        foreach ($required as $name => $value) {
            if (blank($value)) {
                $this->error("Missing required configuration: {$name}");
                $failed = true;
            }
        }

        $supabaseCaBundle = config('services.supabase.ca_bundle');
        if (filled($supabaseCaBundle) && (! is_file($supabaseCaBundle) || ! is_readable($supabaseCaBundle))) {
            $this->error('SUPABASE_CA_BUNDLE must reference a readable file when configured.');
            $failed = true;
        }

        if (config('services.google_sheets.sync_enabled')) {
            $credentialsConfigured = filled(config('services.google_sheets.credentials_json'))
                || filled(config('services.google_sheets.credentials_path'));
            if (! filled(config('services.google_sheets.spreadsheet_id')) || ! $credentialsConfigured) {
                $this->error('Google Sheets sync is enabled but its spreadsheet ID or credentials are missing.');
                $failed = true;
            }
            if ((int) config('services.google_sheets.max_rows') < 1) {
                $this->error('GOOGLE_SHEETS_MAX_ROWS must be at least 1.');
                $failed = true;
            }
        }

        $deploymentMode = null;
        if ($this->option('production') && $this->option('staging')) {
            $this->error('Choose either --production or --staging, not both.');

            return self::FAILURE;
        }
        if ($this->option('production')) {
            $deploymentMode = 'production';
        }
        if ($this->option('staging')) {
            $deploymentMode = 'staging';
        }

        if ($deploymentMode !== null) {
            if (config('app.env') !== $deploymentMode) {
                $this->error("APP_ENV must be {$deploymentMode} for a {$deploymentMode} deployment.");
                $failed = true;
            }
            if (config('app.debug')) {
                $this->error("APP_DEBUG must be false in {$deploymentMode}.");
                $failed = true;
            }
            if (! in_array(config('database.connections.pgsql.sslmode'), ['require', 'verify-ca', 'verify-full'], true)) {
                $this->error("DB_SSLMODE must enforce TLS in {$deploymentMode}.");
                $failed = true;
            }
            if (! str_starts_with((string) config('app.url'), 'https://')) {
                $this->error("APP_URL must use HTTPS in {$deploymentMode}.");
                $failed = true;
            }
            if (in_array($deploymentMode, ['staging', 'production'], true)) {
                if (! str_starts_with((string) config('app.frontend_url'), 'https://')) {
                    $this->error("FRONTEND_URL must use HTTPS in {$deploymentMode}.");
                    $failed = true;
                }
                if (config('session.secure') !== true) {
                    $this->error("SESSION_SECURE_COOKIE must be true in {$deploymentMode}.");
                    $failed = true;
                }
                if (config('services.seatalk.approval.requested_enabled')
                    && blank(config('services.seatalk.approval.token_secret'))) {
                    $this->error('SEATALK_APPROVAL_TOKEN_SECRET is required when SeaTalk approvals are enabled.');
                    $failed = true;
                }
                if ($deploymentMode === 'production' && config('services.seatalk.approval.enabled')
                    && blank(config('services.seatalk.approval.callback_signing_secret'))) {
                    $this->error('SEATALK_CALLBACK_SIGNING_SECRET is required when SeaTalk approvals are enabled.');
                    $failed = true;
                }
            }
            foreach (['user_events', 'idempotency_keys'] as $table) {
                if (! Schema::hasTable($table)) {
                    $this->error("Required {$deploymentMode} table is missing: {$table}");
                    $failed = true;
                }
            }
        }

        if ($this->option('worker-timeout') !== null && ! $this->verifyWorker()) {
            $failed = true;
        }

        if ($failed) {
            return self::FAILURE;
        }

        $this->info('Application configuration is valid.');

        return self::SUCCESS;
    }

    private function verifyWorker(): bool
    {
        $timeout = filter_var($this->option('worker-timeout'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($timeout === false) {
            $this->error('--worker-timeout must be a positive integer matching queue:work --timeout.');

            return false;
        }

        $connection = (string) config('queue.default');
        $driver = config("queue.connections.{$connection}.driver");
        if (! in_array($driver, ['database', 'redis'], true)) {
            $this->error('Worker preflight requires a database or redis queue connection.');

            return false;
        }

        $valid = true;
        $reservation = (int) config("queue.connections.{$connection}.retry_after");
        if ($timeout >= $reservation) {
            $this->error('Worker timeout must be less than the queue retry_after reservation.');
            $valid = false;
        }
        if ($reservation >= (int) config('workflow_outbox.processing_timeout_seconds')) {
            $this->error('Queue retry_after must be less than the workflow outbox processing lease.');
            $valid = false;
        }
        if (! extension_loaded('pcntl')) {
            $this->error('Async workers require the PHP pcntl extension for timeout and shutdown signals.');
            $valid = false;
        }

        return $valid;
    }
}
