<?php

namespace Tests\Feature;

use App\Integrations\GoogleSheets\GoogleSheetsRequestSync;
use Google\Service\Sheets;
use Google\Service\Sheets\Resource\SpreadsheetsValues;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PDO;
use RuntimeException;
use Tests\TestCase;

final class GoogleSheetsRequestSyncTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('The pdo_sqlite extension is required for Google Sheets sync tests.');
        }

        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        config()->set('services.google_sheets.spreadsheet_id', 'test-sheet');
        config()->set('services.google_sheets.sheet_name', 'Sheet1');
        config()->set('services.google_sheets.max_rows', 100);
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        Schema::create('profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
        });
        Schema::create('requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->timestamp('request_timestamp');
            $table->string('cluster');
            $table->string('region');
            $table->string('dock_no');
            $table->integer('backlogs');
            $table->timestamp('backlogs_timestamp')->nullable();
            $table->string('truck_size');
            $table->string('truck_type');
            $table->string('plate_number')->nullable();
            $table->timestamp('provide_time')->nullable();
            $table->string('linehaul_trip_no')->nullable();
            $table->timestamp('docked_time')->nullable();
            $table->string('status')->default('PENDING');
            $table->uuid('created_by');
        });
        Schema::create('request_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_id');
            $table->string('event_type');
            $table->timestamp('created_at');
            $table->text('metadata')->nullable();
            $table->uuid('actor_id')->nullable();
        });

        DB::table('profiles')->insert(['id' => 'creator-id', 'name' => 'Ops PIC']);
        DB::table('requests')->insert([
            'id' => 'request-id',
            'request_timestamp' => now(),
            'cluster' => 'SOC 5',
            'region' => 'NCR',
            'dock_no' => 'D-1',
            'backlogs' => 10,
            'truck_size' => '6W',
            'truck_type' => 'WETLEASE',
            'status' => 'CANCELLED',
            'created_by' => 'creator-id',
        ]);
    }

    public function test_failed_update_never_clears_existing_sheet_values(): void
    {
        $values = Mockery::mock(SpreadsheetsValues::class);
        $values->shouldReceive('update')->once()->andThrow(new RuntimeException('update failed'));
        $values->shouldNotReceive('batchClear');
        $sheets = Mockery::mock(Sheets::class);
        $sheets->spreadsheets_values = $values;
        $sync = new GoogleSheetsRequestSync(fn (): Sheets => $sheets);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('update failed');

        $sync->sync();
    }

    public function test_successful_update_clears_only_stale_values_afterward(): void
    {
        $values = Mockery::mock(SpreadsheetsValues::class);
        $values->shouldReceive('update')->once()->ordered();
        $values->shouldReceive('batchClear')->once()->ordered();
        $sheets = Mockery::mock(Sheets::class);
        $sheets->spreadsheets_values = $values;
        $sync = new GoogleSheetsRequestSync(fn (): Sheets => $sheets);

        $this->assertSame(1, $sync->sync());
    }

    public function test_sync_includes_the_current_status_for_every_request(): void
    {
        $values = Mockery::mock(SpreadsheetsValues::class);
        $values->shouldReceive('update')
            ->once()
            ->withArgs(function (string $spreadsheetId, string $range, object $body): bool {
                $rows = $body->getValues();

                return $spreadsheetId === 'test-sheet'
                    && $range === "'Sheet1'!A1:S2"
                    && $rows[0] === [
                        'Request time',
                        'Cluster',
                        'Region',
                        'Dock #',
                        'Backlog',
                        'Backlogs Time Stamp',
                        'LH type (input by FTE MM) (Request)',
                        'Ops FTE',
                        'Plate number',
                        'MM FTE',
                        'LH size',
                        'LH type (input by FTE MM)',
                        'Provide Time',
                        'Linehaul Trip',
                        'Assigned time',
                        'Docked Time',
                        'DOC Officer',
                        'OPS/PIC',
                        'Status',
                    ]
                    && $rows[0][18] === 'Status'
                    && $rows[1][18] === 'CANCELLED'
                    && array_is_list(json_decode(
                        json_encode($body->toSimpleObject(), JSON_THROW_ON_ERROR),
                        true,
                        512,
                        JSON_THROW_ON_ERROR,
                    )['values'][1]);
            });
        $values->shouldReceive('batchClear')->once();
        $sheets = Mockery::mock(Sheets::class);
        $sheets->spreadsheets_values = $values;
        $sync = new GoogleSheetsRequestSync(fn (): Sheets => $sheets);

        $this->assertSame(1, $sync->sync());
    }

    public function test_sync_formats_all_exported_timestamps_for_google_sheets(): void
    {
        DB::table('requests')->where('id', 'request-id')->update([
            'request_timestamp' => '2026-10-01 01:00:37',
            'backlogs_timestamp' => '2026-10-01 01:00:37',
            'provide_time' => '2026-10-01 01:00:37',
            'docked_time' => '2026-10-01 01:00:37',
        ]);
        DB::table('request_events')->insert([
            'request_id' => 'request-id',
            'event_type' => 'TRUCK_ASSIGNED',
            'created_at' => '2026-10-01 01:00:37',
            'metadata' => null,
            'actor_id' => null,
        ]);

        $values = Mockery::mock(SpreadsheetsValues::class);
        $values->shouldReceive('update')
            ->once()
            ->withArgs(function (string $spreadsheetId, string $range, object $body): bool {
                $row = $body->getValues()[1];
                $expected = '10/1/2026 1:00:37';

                return $row[0] === $expected
                    && $row[5] === $expected
                    && $row[12] === $expected
                    && $row[14] === $expected
                    && $row[15] === $expected;
            });
        $values->shouldReceive('batchClear')->once();
        $sheets = Mockery::mock(Sheets::class);
        $sheets->spreadsheets_values = $values;
        $sync = new GoogleSheetsRequestSync(fn (): Sheets => $sheets);

        $this->assertSame(1, $sync->sync());
    }

    public function test_scheduled_command_retries_transient_sync_failures(): void
    {
        config()->set('services.google_sheets.sync_enabled', true);
        config()->set('services.google_sheets.retry_attempts', 3);
        config()->set('services.google_sheets.retry_backoff_ms', 0);

        $sync = Mockery::mock(GoogleSheetsRequestSync::class);
        $attempt = 0;
        $sync->shouldReceive('sync')
            ->times(3)
            ->andReturnUsing(function () use (&$attempt): int {
                $attempt++;
                if ($attempt < 3) {
                    throw new RuntimeException('temporary failure');
                }

                return 1;
            });
        $this->app->instance(GoogleSheetsRequestSync::class, $sync);

        $this->assertSame(0, Artisan::call('requests:sync-google-sheet'));
    }

    public function test_over_limit_export_is_rejected_before_loading_request_payloads(): void
    {
        config()->set('services.google_sheets.max_rows', 1);
        $extra = (array) DB::table('requests')->first();
        $extra['id'] = 'second-request';
        DB::table('requests')->insert($extra);
        DB::enableQueryLog();
        try {
            (new GoogleSheetsRequestSync)->sync();
            $this->fail('An over-limit export must fail before calling Google.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('1-row limit', $exception->getMessage());
        }
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        foreach ($queries as $query) {
            $this->assertStringNotContainsString('"r"."cluster"', $query['query']);
            $this->assertStringNotContainsString('request_events', $query['query']);
        }
    }

    public function test_export_writes_bounded_batches_and_clears_only_after_all_batches(): void
    {
        config()->set('services.google_sheets.max_rows', 1000);
        $template = (array) DB::table('requests')->first();
        $requests = [];
        for ($index = 1; $index <= 500; $index++) {
            $requests[] = array_replace($template, ['id' => sprintf('request-%04d', $index)]);
        }
        DB::table('requests')->insert($requests);

        $values = Mockery::mock(SpreadsheetsValues::class);
        $values->shouldReceive('update')->once()->ordered()
            ->withArgs(fn ($id, $range, $body): bool => $range === "'Sheet1'!A1:S501" && count($body->getValues()) === 501);
        $values->shouldReceive('update')->once()->ordered()
            ->withArgs(fn ($id, $range, $body): bool => $range === "'Sheet1'!A502:S502" && count($body->getValues()) === 1);
        $values->shouldReceive('batchClear')->once()->ordered();
        $sheets = Mockery::mock(Sheets::class);
        $sheets->spreadsheets_values = $values;

        $this->assertSame(501, (new GoogleSheetsRequestSync(fn (): Sheets => $sheets))->sync());
    }

    public function test_latest_workflow_actor_is_selected_without_loading_edit_history(): void
    {
        DB::table('profiles')->insert(['id' => 'doc-id', 'name' => 'Current DOC']);
        $events = [];
        for ($index = 0; $index < 1200; $index++) {
            $events[] = ['request_id' => 'request-id', 'event_type' => 'REQUEST_EDITED', 'created_at' => now(), 'actor_id' => 'creator-id'];
        }
        DB::table('request_events')->insert($events);
        DB::table('request_events')->insert([
            ['request_id' => 'request-id', 'event_type' => 'DRIVER_ASSIGNED', 'created_at' => '2026-10-20 01:00:00', 'actor_id' => 'creator-id'],
            ['request_id' => 'request-id', 'event_type' => 'DRIVER_REASSIGNED', 'created_at' => '2026-10-21 01:00:00', 'actor_id' => 'doc-id'],
        ]);
        $values = Mockery::mock(SpreadsheetsValues::class);
        $values->shouldReceive('update')->once()
            ->withArgs(fn ($id, $range, $body): bool => $body->getValues()[1][16] === 'Current DOC');
        $values->shouldReceive('batchClear')->once();
        $sheets = Mockery::mock(Sheets::class);
        $sheets->spreadsheets_values = $values;

        $this->assertSame(1, (new GoogleSheetsRequestSync(fn (): Sheets => $sheets))->sync());
    }

    public function test_explicit_rolling_window_keeps_archived_requests_out_of_export(): void
    {
        $this->travelTo(now()->startOfDay());
        config()->set('services.google_sheets.max_rows', 1);
        config()->set('services.google_sheets.lookback_days', 1);
        $old = (array) DB::table('requests')->first();
        DB::table('requests')->where('id', 'request-id')->update(['request_timestamp' => now()->subDays(30)]);
        DB::table('requests')->insert(array_replace($old, ['id' => 'recent', 'cluster' => 'Recent only', 'request_timestamp' => now()]));

        $values = Mockery::mock(SpreadsheetsValues::class);
        $values->shouldReceive('update')->once()->withArgs(fn ($id, $range, $body): bool => $body->getValues()[1][1] === 'Recent only');
        $values->shouldReceive('batchClear')->once();
        $sheets = Mockery::mock(Sheets::class);
        $sheets->spreadsheets_values = $values;
        $this->assertSame(1, (new GoogleSheetsRequestSync(fn (): Sheets => $sheets))->sync());
    }
}
