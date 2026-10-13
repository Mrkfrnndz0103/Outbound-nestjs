<?php

namespace App\Features\Requests;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class RequestRepository
{
    private const COLUMNS = ['id', 'request_timestamp', 'cluster', 'region', 'dock_no', 'backlogs', 'backlogs_timestamp', 'ob_fte', 'truck_size', 'truck_type', 'plate_number', 'provide_time', 'linehaul_trip_no', 'linehaul_trip_at', 'docked_time', 'status', 'rejection_remarks', 'driver_id', 'driver_assigned_at', 'created_by', 'created_at', 'updated_at'];

    private const APPROVAL_COLUMNS = ['approval_status', 'approved_by', 'approved_at', 'approval_source', 'rejected_by', 'rejected_at', 'approval_version', 'approval_correlation_id', 'rejection_return_role', 'cancellation_remarks'];

    public function __construct(private RequestAuthorizer $authorizer) {}

    public function paginate(object $actor, array $filters): LengthAwarePaginator
    {
        $query = DB::table('requests')
            ->leftJoin('profiles as soc_pic', function ($join): void {
                $join->on(DB::raw('CAST(soc_pic.id AS TEXT)'), '=', 'requests.ob_fte');
            })
            ->leftJoin('profiles as creator', 'creator.id', '=', 'requests.created_by')
            ->select(array_merge(array_map(fn (string $column): string => 'requests.'.$column, $this->columns()), [
                'soc_pic.name as ob_fte_name',
                'creator.name as created_by_name',
            ]));
        if ($actor->role === 'ops_pic' && ! ($actor->is_admin ?? false)) {
            $query->where('created_by', $actor->id);
        }
        if ($status = $filters['status'] ?? null) {
            $query->whereIn('status', $this->storedStatuses($actor, $status));
        }
        if ($search = trim((string) ($filters['search'] ?? ''))) {
            $query->whereRaw("lower(coalesce(plate_number, '')) like ?", ['%'.strtolower($search).'%']);
        }
        if ($dateFrom = $filters['date_from'] ?? null) {
            $this->whereBusinessDate($query, '>=', $dateFrom);
        }
        if ($dateTo = $filters['date_to'] ?? null) {
            $this->whereBusinessDate($query, '<=', $dateTo);
        }

        $sort = $filters['sort'] ?? 'created_at';
        $direction = $filters['direction'] ?? 'desc';
        $query->orderBy('requests.'.$sort, $direction)->orderByDesc('requests.id');

        return $this->withWorkflowActors($query)
            ->paginate(min((int) ($filters['per_page'] ?? 20), 100))
            ->through(fn (object $request): object => $this->forActor($actor, $request));
    }

    public function metrics(object $actor, array $filters = []): Collection
    {
        $query = DB::table('requests')->select('status', DB::raw('count(*) as total'))->groupBy('status');
        $this->scope($query, $actor, $filters);
        if ($search = trim((string) ($filters['search'] ?? ''))) {
            $query->whereRaw("lower(coalesce(plate_number, '')) like ?", ['%'.strtolower($search).'%']);
        }

        return $query
            ->pluck('total', 'status')
            ->reduce(function (Collection $counts, int $total, string $status): Collection {
                $counts[$status] = (int) ($counts[$status] ?? 0) + $total;

                return $counts;
            }, collect());
    }

    public function analytics(object $actor, array $filters = []): array
    {
        $sizes = DB::table('requests')->select('truck_size', DB::raw('count(*) as total'))->groupBy('truck_size');
        $this->scope($sizes, $actor, $filters);

        $businessTimezone = (string) config('app.business_timezone', 'Asia/Manila');
        $now = CarbonImmutable::now($businessTimezone);
        $shiftStart = $now->hour < 6 || $now->hour >= 18
            ? $now->setTime(18, 0)
            : $now->subDay()->setTime(18, 0);
        if ($now->hour < 6) {
            $shiftStart = $now->subDay()->setTime(18, 0);
        }
        $shiftEnd = $shiftStart->addHours(13);
        $shiftQuery = DB::table('requests')->whereBetween('request_timestamp', [$shiftStart->utc(), $shiftEnd->utc()]);
        if ($actor->role === 'ops_pic' && ! ($actor->is_admin ?? false)) {
            $shiftQuery->where('created_by', $actor->id);
        }
        if ($dateFrom = $filters['date_from'] ?? null) {
            $this->whereBusinessDate($shiftQuery, '>=', $dateFrom);
        }
        if ($dateTo = $filters['date_to'] ?? null) {
            $this->whereBusinessDate($shiftQuery, '<=', $dateTo);
        }
        $counts = array_fill(0, 13, 0);
        if (DB::connection()->getDriverName() === 'pgsql') {
            $hourly = $shiftQuery
                ->selectRaw('floor(extract(epoch from (request_timestamp - ?::timestamptz)) / 3600)::int as hour_offset, count(*) as total', [$shiftStart->toIso8601String()])
                ->groupBy('hour_offset')->pluck('total', 'hour_offset');
            foreach ($hourly as $hour => $total) {
                if ((int) $hour >= 0 && (int) $hour <= 12) {
                    $counts[(int) $hour] = (int) $total;
                }
            }
        } else {
            foreach ($shiftQuery->pluck('request_timestamp') as $timestamp) {
                $index = (int) $shiftStart->diffInHours(CarbonImmutable::parse($timestamp)->setTimezone($businessTimezone), false);
                if ($index >= 0 && $index <= 12) {
                    $counts[$index]++;
                }
            }
        }

        return [
            'truck_sizes' => $sizes->pluck('total', 'truck_size'),
            'hourly' => collect($counts)->map(fn (int $count, int $hour) => [
                'label' => $shiftStart->addHours($hour)->format('gA'),
                'count' => $count,
            ])->values(),
            'shift_start' => $shiftStart->toIso8601String(),
            'average_dwell_minutes' => $this->averageMinutes($actor, $filters, 'linehaul_trip_at'),
            'average_waiting_minutes' => $this->averageMinutes($actor, $filters, 'provide_time'),
        ];
    }

    private function averageMinutes(object $actor, array $filters, string $endColumn): ?float
    {
        $query = DB::table('requests')
            ->whereNotNull($endColumn)
            ->selectRaw('avg(extract(epoch from ('.$endColumn.' - request_timestamp)) / 60) as average_minutes');
        $this->scope($query, $actor, $filters);
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $values = $query->select(['request_timestamp', $endColumn])->get();

            return $values->isEmpty() ? null : $values->avg(fn (object $row): float => (strtotime($row->{$endColumn}) - strtotime($row->request_timestamp)) / 60);
        }

        $value = $query->value('average_minutes');

        return $value === null ? null : round((float) $value, 1);
    }

    private function scope(Builder $query, object $actor, array $filters): void
    {
        if ($actor->role === 'ops_pic' && ! ($actor->is_admin ?? false)) {
            $query->where('created_by', $actor->id);
        }
        if ($status = $filters['status'] ?? null) {
            $query->whereIn('status', $this->storedStatuses($actor, $status));
        }
        if ($search = trim((string) ($filters['search'] ?? ''))) {
            $query->whereRaw("lower(coalesce(plate_number, '')) like ?", ['%'.strtolower($search).'%']);
        }
        if ($dateFrom = $filters['date_from'] ?? null) {
            $this->whereBusinessDate($query, '>=', $dateFrom);
        }
        if ($dateTo = $filters['date_to'] ?? null) {
            $this->whereBusinessDate($query, '<=', $dateTo);
        }
    }

    public function lock(string $id): object
    {
        return DB::table('requests')->where('id', $id)->lockForUpdate()->firstOrFail();
    }

    public function findVisible(string $id, object $actor): object
    {
        $query = DB::table('requests')
            ->leftJoin('profiles as soc_pic', function ($join): void {
                $join->on(DB::raw('CAST(soc_pic.id AS TEXT)'), '=', 'requests.ob_fte');
            })
            ->leftJoin('profiles as creator', 'creator.id', '=', 'requests.created_by')
            ->select(array_merge(array_map(fn (string $column): string => 'requests.'.$column, $this->columns()), [
                'soc_pic.name as ob_fte_name',
                'creator.name as created_by_name',
            ]))
            ->where('requests.id', $id);
        $request = $this->withWorkflowActors($query)->firstOrFail();
        abort_unless($this->authorizer->canView($actor, $request), 403);

        return $this->forActor($actor, $request);
    }

    public function events(string $id, object $actor): Collection
    {
        $this->findVisible($id, $actor);

        return DB::table('request_events')->where('request_id', $id)->orderByDesc('created_at')->get();
    }

    public function insert(array $data): object
    {
        DB::table('requests')->insert($data);

        return DB::table('requests')->where('id', $data['id'])->first();
    }

    public function update(string $id, array $data): object
    {
        DB::table('requests')->where('id', $id)->update($data);

        return DB::table('requests')->where('id', $id)->first();
    }

    private function whereBusinessDate(Builder $query, string $operator, string $date): void
    {
        $timezone = (string) config('app.business_timezone', 'Asia/Manila');
        $businessDate = CarbonImmutable::createFromFormat('!Y-m-d', $date, $timezone);
        $bound = $operator === '>='
            ? $businessDate->startOfDay()->utc()
            : $businessDate->endOfDay()->utc();

        $query->where('request_timestamp', $operator, $bound);
    }

    private function storedStatuses(object $actor, string $status): array
    {
        return in_array($actor->role, ['fte_mm', 'doc_officer'], true) && $status === RequestStatus::Pending->value
            ? RequestStatus::approvalPendingValues()
            : [$status];
    }

    /**
     * Scalar subqueries preserve pagination and existing authorization scopes.
     * Never substitute the creator for an unrecorded workflow actor.
     */
    private function withWorkflowActors(Builder $query): Builder
    {
        foreach (['mm_fte' => 'TRUCK_ASSIGNED', 'doc_officer' => 'DRIVER_ASSIGNED'] as $prefix => $eventType) {
            $event = DB::table('request_events as attribution_event')
                ->leftJoin('profiles as attribution_profile', 'attribution_profile.id', '=', 'attribution_event.actor_id')
                ->whereColumn('attribution_event.request_id', 'requests.id')
                ->where('attribution_event.event_type', $eventType)
                ->orderByDesc('attribution_event.created_at')
                ->orderByDesc('attribution_event.id')
                ->limit(1);

            $query->selectSub((clone $event)->select('attribution_event.actor_id'), $prefix.'_id');
            $query->selectSub((clone $event)->select('attribution_profile.name'), $prefix.'_name');
        }

        return $query;
    }

    /**
     * Keep reads compatible while deployments roll out approval metadata.
     *
     * @return list<string>
     */
    private function columns(): array
    {
        $approvalColumns = Cache::remember(
            'requests:approval-columns:v2',
            now()->addMinutes(5),
            static function (): array {
                $columns = array_flip(Schema::getColumnListing('requests'));

                return array_values(array_filter(
                    self::APPROVAL_COLUMNS,
                    static fn (string $column): bool => isset($columns[$column]),
                ));
            },
        );

        return array_merge(
            self::COLUMNS,
            $approvalColumns,
        );
    }

    public function forActor(object $actor, object $request): object
    {
        if (isset($request->status)) {
            $request->display_status = RequestStatus::displayFor($actor->role, $request->status);
            $request->next_action_role = RequestStatus::nextActionRole($request);
        }

        return $request;
    }
}
