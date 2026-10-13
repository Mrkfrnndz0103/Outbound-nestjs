<?php

namespace App\Features\Requests;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class RequestController
{
    public function __construct(private RequestRepository $repository, private RequestService $service) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', Rule::enum(RequestStatus::class)],
            'search' => 'nullable|string|max:50',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
            'sort' => ['nullable', Rule::in(['created_at', 'request_timestamp', 'cluster', 'dock_no', 'backlogs', 'plate_number', 'status'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        return response()->json($this->repository->paginate($request->attributes->get('actor'), $filters));
    }

    public function queue(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'limit' => 'nullable|integer|min:1|max:100',
            'cursor' => 'nullable|string|max:200',
        ]);

        return response()->json($this->repository->queue(
            $request->attributes->get('actor'),
            (int) ($filters['limit'] ?? 100),
            $filters['cursor'] ?? null,
        ));
    }

    public function metrics(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => 'nullable|string|max:50',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
        ]);
        $byStatus = $this->repository->metrics($request->attributes->get('actor'), $filters);
        $awaiting = collect(['PENDING', 'REQUESTED', 'REROUTED', 'REJECTED', 'DOCKING', 'ASSIGNED'])->sum(fn (string $status): int => (int) ($byStatus[$status] ?? 0));

        return response()->json([
            'total' => $byStatus->sum(),
            'awaiting_action' => $awaiting,
            'by_status' => $byStatus,
        ]);
    }

    public function analytics(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
        ]);

        return response()->json($this->repository->analytics($request->attributes->get('actor'), $filters));
    }

    public function summary(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => 'nullable|string|max:50',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
        ]);
        $actor = $request->attributes->get('actor');
        $byStatus = $this->repository->metrics($actor, $filters);
        $awaiting = collect(['PENDING', 'REQUESTED', 'REROUTED', 'REJECTED', 'DOCKING', 'ASSIGNED'])
            ->sum(fn (string $status): int => (int) ($byStatus[$status] ?? 0));

        return response()->json([
            'metrics' => [
                'total' => $byStatus->sum(),
                'awaiting_action' => $awaiting,
                'by_status' => $byStatus,
            ],
            'analytics' => $this->repository->analytics($actor, $filters),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->requestRules());
        $actor = $request->attributes->get('actor');

        return response()->json($this->repository->forActor($actor, $this->service->create($actor, $data)), 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json($this->repository->findVisible($id, $request->attributes->get('actor')));
    }

    public function events(Request $request, string $id): JsonResponse
    {
        return response()->json($this->repository->events($id, $request->attributes->get('actor')));
    }

    public function bulkApprove(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => 'required|array|min:1|max:100', 'ids.*' => 'required|uuid|distinct']);
        $actor = $request->attributes->get('actor');
        $approved = $this->service->bulkApprove($actor, $data['ids']);

        return response()->json(['data' => array_map(fn (object $row): object => $this->repository->forActor($actor, $row), $approved)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate($this->requestRules());
        $actor = $request->attributes->get('actor');

        return response()->json($this->repository->forActor($actor, $this->service->updateDetails($id, $actor, $data)));
    }

    public function action(Request $request, string $id, string $action): JsonResponse
    {
        $rules = $this->actionRules($action, $request->attributes->get('actor')->role);
        $unexpected = array_values(array_diff(array_keys($request->all()), array_keys($rules)));
        if ($unexpected !== []) {
            throw ValidationException::withMessages([
                'payload' => 'Unexpected fields for this action: '.implode(', ', $unexpected).'.',
            ]);
        }
        $data = $request->validate($rules);
        $actor = $request->attributes->get('actor');

        return response()->json($this->repository->forActor($actor, $this->service->transition($id, $actor, $action, $data)));
    }

    private function requestRules(): array
    {
        return [
            'cluster' => 'required|string|max:120',
            'region' => 'required|string|max:120',
            'dock_no' => 'required|string|max:50',
            'backlogs' => 'required|integer|min:0',
            'backlogs_timestamp' => 'nullable|date',
            'truck_size' => 'required|in:4W,4WAUV,4WCV,6W,10W,6WF',
            'truck_type' => 'required|in:WETLEASE,DRYLEASE',
        ];
    }

    private function actionRules(string $action, string $role): array
    {
        return match ($action) {
            'approve' => [],
            'cancel' => ['cancellation_remarks' => ($role === 'fte_mm' ? 'required' : 'sometimes').'|string|max:2000'],
            'reject-ops' => [
                'rejection_remarks' => 'required|string|max:2000',
            ],
            'reject-mm' => [
                'rejection_remarks' => 'required|string|max:2000',
            ],
            'assign-truck' => [
                'plate_number' => 'required|string|max:50',
                'provide_time' => 'sometimes|nullable|date',
                'truck_size' => 'required|in:4W,4WAUV,4WCV,6W,10W,6WF',
                'truck_type' => 'required|in:WETLEASE,DRYLEASE',
            ],
            'mark-docked' => $role === 'doc_officer'
                ? ['driver_id' => ['required', 'string', 'regex:/\\A[0-9]{1,10}\\z/']]
                : ['linehaul_trip_no' => 'required|string|max:120'],
            'reassign-driver' => ['driver_id' => ['required', 'string', 'regex:/\\A[0-9]{1,10}\\z/']],
            default => throw ValidationException::withMessages(['action' => 'Unknown action.']),
        };
    }
}
