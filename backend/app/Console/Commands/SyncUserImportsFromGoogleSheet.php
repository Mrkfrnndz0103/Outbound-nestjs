<?php

namespace App\Console\Commands;

use App\Integrations\GoogleSheets\GoogleSheetsUserImportsSync;
use Illuminate\Console\Command;
use Throwable;

final class SyncUserImportsFromGoogleSheet extends Command
{
    protected $signature = 'users:sync-imports-google-sheet';

    protected $description = 'Sync the user directory Google Sheet into public.user_imports';

    public function handle(GoogleSheetsUserImportsSync $sync): int
    {
        if (! config('services.user_imports_sheet.sync_enabled')) {
            $this->line('User imports Google Sheets sync is disabled.');

            return self::SUCCESS;
        }

        $attempts = max(1, (int) config('services.google_sheets.retry_attempts', 3));
        $backoffMilliseconds = max(0, (int) config('services.google_sheets.retry_backoff_ms', 1000));
        for ($attempt = 1; $attempt <= $attempts; $attempt++) {
            try {
                $result = $sync->sync();
                $this->info("Synchronized {$result['synced']} user row(s) into user_imports.");

                return self::SUCCESS;
            } catch (Throwable $exception) {
                if ($attempt === $attempts) {
                    $this->error('User imports Google Sheets sync failed: '.$exception->getMessage());

                    return self::FAILURE;
                }

                usleep($backoffMilliseconds * (2 ** ($attempt - 1)) * 1000);
            }
        }

        return self::FAILURE;
    }
}
