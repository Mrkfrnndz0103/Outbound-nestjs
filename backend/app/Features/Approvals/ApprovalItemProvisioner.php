<?php

namespace App\Features\Approvals;

use App\Integrations\SeaTalk\ApprovalItemPayload;
use App\Integrations\SeaTalk\SeaTalkApprovalCenterGateway;
use App\Integrations\SeaTalk\SeaTalkProviderException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

final class ApprovalItemProvisioner
{
    public function __construct(private SeaTalkApprovalCenterGateway $adapter) {}

    public function provisionForRequest(object $request, ?ApprovalItemPayload $payload = null): ProvisioningResult
    {
        if (! (bool) config('services.seatalk.approval.enabled', false)) {
            return new ProvisioningResult('skipped');
        }
        if (! Schema::hasTable('seatalk_approval_items')) {
            return new ProvisioningResult('skipped', failureReason: 'Approval Center schema is not installed.');
        }

        $itemId = $this->stableItemId((string) $request->id);
        $item = DB::table('seatalk_approval_items')->where('request_id', $request->id)->first();
        if ($item === null) {
            $localItemId = (string) Str::uuid();
            DB::table('seatalk_approval_items')->insert([
                'id' => $localItemId,
                'request_id' => $request->id,
                'status' => 'PENDING',
                'correlation_id' => (string) Str::uuid(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $item = DB::table('seatalk_approval_items')->where('id', $localItemId)->first();
        } else {
            DB::table('seatalk_approval_items')->where('id', $item->id)->update([
                'status' => 'PENDING',
                'failure_reason' => null,
                'updated_at' => now(),
            ]);
        }

        try {
            $payload ??= $this->payload($request, $itemId);
            $providerItemId = $item->provider_item_id ?: null;
            $providerResponseId = null;
            if ($providerItemId === null) {
                $result = $this->adapter->createItem($payload);
                // The provider item ID is the stable local ID sent in the
                // request; the create response only returns a result code.
                $providerItemId = $itemId;
                $providerResponseId = $result->providerResponseId();
            } else {
                $this->adapter->updateItem((string) $providerItemId, $payload);
            }
            DB::table('seatalk_approval_items')->where('id', $item->id)->update(array_filter([
                'status' => 'ACTIVE',
                'provider_item_id' => $providerItemId,
                'provider_response_id' => $providerResponseId,
                'failure_reason' => null,
                'updated_at' => now(),
            ], static fn (mixed $value): bool => $value !== null));

            if (Schema::hasTable('seatalk_approval_assignments')) {
                $assignment = DB::table('seatalk_approval_assignments')
                    ->where('request_id', $request->id)
                    ->whereIn('status', ['PENDING', 'ACTIVE'])
                    ->orderByDesc('sequence')
                    ->first();
                if ($assignment !== null) {
                    $assignmentUpdate = ['updated_at' => now()];
                    if (Schema::hasColumn('seatalk_approval_assignments', 'seatalk_message_id')) {
                        $assignmentUpdate['seatalk_message_id'] = $providerItemId;
                    }
                    if ($providerResponseId !== null && Schema::hasColumn('seatalk_approval_assignments', 'provider_response_id')) {
                        $assignmentUpdate['provider_response_id'] = $providerResponseId;
                    }
                    DB::table('seatalk_approval_assignments')->where('id', $assignment->id)->update($assignmentUpdate);
                }
            }

            return new ProvisioningResult('delivered', (string) $item->id, $providerItemId);
        } catch (SeaTalkProviderException $exception) {
            $this->recordFailure((string) $item->id, $exception->getMessage());

            return new ProvisioningResult('failed', (string) $item->id, failureReason: $exception->getMessage());
        } catch (Throwable $exception) {
            $this->recordFailure((string) $item->id, 'Unexpected provider provisioning failure.');
            Log::warning('SeaTalk approval item provisioning failed.', [
                'request_id' => (string) $request->id,
                'exception' => $exception::class,
            ]);

            return new ProvisioningResult('failed', (string) $item->id, failureReason: 'Unexpected provider provisioning failure.');
        }
    }

    public function sync(string $requestId): ProvisioningResult
    {
        $request = DB::table('requests')->where('id', $requestId)->first();
        if ($request !== null) {
            return $this->provisionForRequest($request);
        }

        return new ProvisioningResult('skipped', failureReason: 'Request not found.');
    }

    public function stableItemId(string $requestId): string
    {
        return 'req_'.substr(str_replace('-', '', $requestId), 0, 26);
    }

    private function payload(object $request, string $itemId): ApprovalItemPayload
    {
        return $this->buildPayload($request, null, null, null, null, null, $itemId);
    }

    public function buildPayload(
        object $request,
        ?array $pendingList = null,
        ?array $approvedList = null,
        ?array $rejectedList = null,
        ?array $approvalChain = null,
        ?int $statusState = null,
        ?string $itemId = null,
    ): ApprovalItemPayload {
        $itemId ??= $this->stableItemId((string) $request->id);
        $now = now()->timestamp;
        $createdAt = $request->created_at !== null
            ? CarbonImmutable::parse($request->created_at)->timestamp
            : $now;
        $applicantName = (string) ($request->created_by ?? 'FTE OPS');
        if (Schema::hasTable('profiles') && isset($request->created_by)) {
            $applicantName = (string) (DB::table('profiles')->where('id', $request->created_by)->value('name') ?: $applicantName);
        }

        $pending = $pendingList ?? [];
        if ($pendingList === null && Schema::hasTable('profiles') && Schema::hasColumn('profiles', 'seatalk_employee_code')) {
            if (Schema::hasTable('seatalk_approval_assignments')) {
                $pending = DB::table('seatalk_approval_assignments as assignments')
                    ->join('profiles', 'profiles.id', '=', 'assignments.fte_user_id')
                    ->where('assignments.request_id', $request->id)
                    ->whereIn('assignments.status', ['PENDING', 'ACTIVE'])
                    ->where('profiles.role', 'fte_ops')
                    ->where('profiles.is_active', true)
                    ->whereNotNull('profiles.seatalk_employee_code')
                    ->orderBy('assignments.sequence')
                    ->get(['assignments.id as assignment_id', 'profiles.seatalk_employee_code'])
                    ->map(function (object $profile) use ($createdAt): array {
                        return $this->assignmentEntry((string) $profile->assignment_id, (string) $profile->seatalk_employee_code, $createdAt);
                    })
                    ->all();
            }

            if ($pending === []) {
                $pending = DB::table('profiles')
                    ->where('role', 'fte_ops')
                    ->where('is_active', true)
                    ->whereNotNull('seatalk_employee_code')
                    ->orderBy('id')
                    ->limit(100)
                    ->get(['seatalk_employee_code'])
                    ->map(fn (object $profile): array => ['employee_code' => $profile->seatalk_employee_code, 'ts' => $createdAt])
                    ->all();
            }
        }

        $appPathTemplate = config('services.seatalk.approval.app_path');
        $appPath = is_string($appPathTemplate) && $appPathTemplate !== ''
            ? (str_contains($appPathTemplate, '{itemId}')
                ? str_replace('{itemId}', rawurlencode($itemId), $appPathTemplate)
                : rtrim($appPathTemplate, '?&').'?itemId='.rawurlencode($itemId))
            : null;
        $callbackToken = is_string($pending[0]['token'] ?? null) ? $pending[0]['token'] : null;
        $approveUrl = $this->callbackUrl((string) config('services.seatalk.approval.approve_callback_url'), $callbackToken);
        $rejectUrl = $this->callbackUrl((string) config('services.seatalk.approval.reject_callback_url'), $callbackToken);

        return new ApprovalItemPayload(
            itemId: $itemId,
            createdAt: $createdAt,
            updatedAt: $now,
            applicantName: $applicantName,
            title: 'Truck request '.$itemId,
            pendingList: $pending,
            approvedList: $approvedList ?? [],
            rejectedList: $rejectedList ?? [],
            approvalChain: $approvalChain ?? [],
            subtitle: trim(implode(' · ', array_filter([(string) ($request->cluster ?? ''), (string) ($request->dock_no ?? '')]))) ?: null,
            description: 'Outbound truck request requiring FTE OPS approval.',
            itemState: 'Pending',
            statusText: $statusState === null ? 'Pending' : match ($statusState) {
                1 => 'Approved', 2 => 'Rejected', 4 => 'Cancelled', default => 'Pending',
            },
            statusState: $statusState ?? 0,
            appPath: $appPath,
            approveUrl: $approveUrl,
            rejectUrl: $rejectUrl,
        );
    }

    public function assignmentEntry(string $assignmentId, string $employeeCode, int $timestamp): array
    {
        $entry = ['employee_code' => $employeeCode, 'ts' => $timestamp];
        if ((string) config('services.seatalk.approval.token_secret') !== '') {
            $entry['token'] = app(ApprovalToken::class)->forAssignment($assignmentId);
        }

        return $entry;
    }

    private function callbackUrl(string $url, ?string $token): string
    {
        if ($token === null || $token === '') {
            return $url;
        }

        return $url.(str_contains($url, '?') ? '&' : '?').http_build_query(['token' => $token]);
    }

    private function recordFailure(string $itemId, string $reason): void
    {
        DB::table('seatalk_approval_items')->where('id', $itemId)->update([
            'status' => 'FAILED',
            'failure_reason' => mb_substr($reason, 0, 5000),
            'updated_at' => now(),
        ]);
    }
}
