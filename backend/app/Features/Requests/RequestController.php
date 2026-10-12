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

    public function metrics(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => 'nullable|string|max:50',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
        ]);
        $byStatus = $this->repository->metrics($request->attributes->get('actor'), $filters);
        $awaiting = collect(['PENDING', 'REQUESTED', 'REROUTED', 'DOCKING', 'ASSIGNED'])->sum(fn (string $status): int => (int) ($byStatus[$status] ?? 0));

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

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->requestRules());

        return response()->json($this->service->create($request->attributes->get('actor'), $data), 201);
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

        return response()->json(['data' => $this->service->bulkApprove($request->attributes->get('actor'), $data['ids'])]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate($this->requestRules());

        return response()->json($this->service->updateDetails($id, $request->attributes->get('actor'), $data));
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

        return response()->json($this->service->transition($id, $request->attributes->get('actor'), $action, $data));
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
            'approve', 'cancel' => [],
            'reject-ops' => [
                'rejection_remarks' => 'sometimes|string|max:2000',
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
                ? ['driver_id' => 'required|string|max:120']
                : ['linehaul_trip_no' => 'required|string|max:120'],
            default => throw ValidationException::withMessages(['action' => 'Unknown action.']),
        };
    }
}
