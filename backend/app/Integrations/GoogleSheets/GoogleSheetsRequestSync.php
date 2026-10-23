<?php

namespace App\Integrations\GoogleSheets;

use Carbon\CarbonImmutable;
use Closure;
use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\BatchClearValuesRequest;
use Google\Service\Sheets\ValueRange;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class GoogleSheetsRequestSync
{
    private const HEADERS = [
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
    ];

    public function __construct(private readonly ?Closure $sheetsFactory = null) {}

    public function sync(): int
    {
        $maxRows = (int) config('services.google_sheets.max_rows', 50000);
        if ($maxRows < 1) {
            throw new RuntimeException('Google Sheets max_rows must be positive.');
        }
        $lookbackDays = (int) config('services.google_sheets.lookback_days', 0);
        if ($lookbackDays < 0) {
            throw new RuntimeException('Google Sheets lookback_days must not be negative.');
        }
        $requestIds = DB::table('requests')
            ->when($lookbackDays > 0, fn ($query) => $query->where('request_timestamp', '>=', now()->subDays($lookbackDays)))
            ->orderBy('request_timestamp')->orderBy('id')
            ->limit($maxRows + 1)->pluck('id')->all();
        if (count($requestIds) > $maxRows) {
            throw new RuntimeException("Google Sheets sync exceeds the configured {$maxRows}-row limit.");
        }
        $sheets = $this->client();
        $spreadsheetId = (string) config('services.google_sheets.spreadsheet_id');
        $written = 0;
        $firstBatch = true;
        foreach (array_chunk($requestIds, 500) ?: [[]] as $ids) {
            $rows = DB::table('requests as r')
                ->leftJoin('profiles as creator', 'creator.id', '=', 'r.created_by')
                ->whereIn('r.id', $ids)
                ->select([
                    'r.id', 'r.request_timestamp', 'r.cluster', 'r.region', 'r.dock_no',
                    'r.backlogs', 'r.backlogs_timestamp', 'r.truck_size', 'r.truck_type',
                    'r.plate_number', 'r.provide_time', 'r.linehaul_trip_no', 'r.docked_time',
                    'r.status',
                    'creator.name as ops_pic',
                ])
                ->orderBy('r.request_timestamp')
                ->orderBy('r.id')
                ->get();

            $events = DB::table('request_events as e')
                ->leftJoin('profiles as actor', 'actor.id', '=', 'e.actor_id')
                ->whereIn('e.request_id', $ids)
                ->whereIn('e.event_type', ['REQUEST_CREATED', 'REQUEST_APPROVED', 'TRUCK_ASSIGNED', 'REQUEST_CONFIRMED', 'DRIVER_ASSIGNED', 'DRIVER_REASSIGNED'])
                ->whereNotExists(function ($newer): void {
                    $newer->selectRaw('1')->from('request_events as newer')
                        ->whereColumn('newer.request_id', 'e.request_id')
                        ->whereColumn('newer.event_type', 'e.event_type')
                        ->where(function ($later): void {
                            $later->whereColumn('newer.created_at', '>', 'e.created_at')
                                ->orWhere(function ($tie): void {
                                    $tie->whereColumn('newer.created_at', 'e.created_at')->whereColumn('newer.id', '>', 'e.id');
                                });
                        });
                })
                ->select(['e.request_id', 'e.event_type', 'e.created_at', 'e.metadata', 'actor.name as actor_name'])
                ->orderBy('e.created_at')
                ->orderBy('e.id')
                ->get()
                ->groupBy('request_id');

            $values = $firstBatch ? [self::HEADERS] : [];
            foreach ($rows as $request) {
                $requestEvents = $events->get($request->id, collect())->keyBy('event_type');
                $created = $requestEvents->get('REQUEST_CREATED');
                $approved = $requestEvents->get('REQUEST_APPROVED');
                $assigned = $requestEvents->get('TRUCK_ASSIGNED');
                $confirmed = $events->get($request->id, collect())
                    ->last(fn ($event): bool => in_array($event->event_type, ['DRIVER_ASSIGNED', 'DRIVER_REASSIGNED'], true))
                    ?? $requestEvents->get('REQUEST_CONFIRMED');
                $createdMetadata = $this->metadata($created?->metadata);

                $values[] = [
                    $this->formatTimestamp($request->request_timestamp),
                    $request->cluster,
                    $request->region,
                    $request->dock_no,
                    $request->backlogs,
                    $this->formatTimestamp($request->backlogs_timestamp),
                    $createdMetadata['lh_type_request'] ?? $request->truck_type,
                    $approved?->actor_name,
                    $request->plate_number,
                    $assigned?->actor_name,
                    $request->truck_size,
                    $request->truck_type,
                    $this->formatTimestamp($request->provide_time),
                    $request->linehaul_trip_no,
                    $this->formatTimestamp($assigned?->created_at),
                    $this->formatTimestamp($request->docked_time),
                    $confirmed?->actor_name,
                    $request->ops_pic,
                    $request->status,
                ];
            }

            // The Google PHP client omits null cells while serializing. Reindex
            // each row first so sparse numeric keys cannot become JSON objects.
            $values = array_map(
                static fn (array $row): array => array_map(
                    static fn (mixed $cell): mixed => $cell ?? '',
                    array_values($row),
                ),
                $values,
            );

            if ($values !== []) {
                $start = $firstBatch ? 1 : $written + 2;
                $end = $start + count($values) - 1;
                $body = new ValueRange(['values' => $values]);
                $sheets->spreadsheets_values->update(
                    $spreadsheetId,
                    $this->range("A{$start}:S{$end}"),
                    $body,
                    ['valueInputOption' => 'RAW'],
                );
            }
            $written += $rows->count();
            $firstBatch = false;
        }

        // Only clear stale cells after the replacement data is safely written.
        // A failed cleanup may leave old trailing rows, but it can no longer
        // erase the current sheet before a transient update failure.
        $firstStaleRow = $written + 2;
        $sheets->spreadsheets_values->batchClear(
            $spreadsheetId,
            new BatchClearValuesRequest(['ranges' => [
                $this->range('T1:Z'),
                $this->range("A{$firstStaleRow}:S"),
            ]]),
        );

        return $written;
    }

    private function client(): Sheets
    {
        if ($this->sheetsFactory !== null) {
            return ($this->sheetsFactory)();
        }

        $credentials = config('services.google_sheets.credentials_json');
        $credentialsPath = config('services.google_sheets.credentials_path');
        if ($credentialsPath && is_file($credentialsPath)) {
            $credentials = file_get_contents($credentialsPath);
        }
        if (! is_string($credentials) || trim($credentials) === '') {
            throw new RuntimeException('Google Sheets credentials are not configured.');
        }

        $decoded = json_decode($credentials, true);
        if (! is_array($decoded)) {
            throw new RuntimeException('Google Sheets credentials are not valid JSON.');
        }

        $client = new Client;
        $client->setApplicationName(config('app.name'));
        $client->setAuthConfig($decoded);
        $client->setScopes([Sheets::SPREADSHEETS]);

        return new Sheets($client);
    }

    private function range(string $suffix): string
    {
        $sheet = str_replace("'", "''", (string) config('services.google_sheets.sheet_name', 'Sheet1'));

        return "'{$sheet}'!{$suffix}";
    }

    private function formatTimestamp(mixed $timestamp): string
    {
        if ($timestamp === null || $timestamp === '') {
            return '';
        }

        return CarbonImmutable::parse((string) $timestamp)
            ->setTimezone((string) config('app.timezone'))
            ->format('n/j/Y G:i:s');
    }

    private function metadata(mixed $metadata): array
    {
        if (is_array($metadata)) {
            return $metadata;
        }

        $decoded = json_decode((string) $metadata, true);

        return is_array($decoded) ? $decoded : [];
    }
}
