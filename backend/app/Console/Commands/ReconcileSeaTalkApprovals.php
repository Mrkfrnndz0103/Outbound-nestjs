<?php

namespace App\Console\Commands;

use App\Features\Approvals\ApprovalItemSynchronizer;
use App\Integrations\SeaTalk\SeaTalkApprovalCenterGateway;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class ReconcileSeaTalkApprovals extends Command
{
    protected $signature = 'seatalk:reconcile-approvals
        {--repair : Retry provider synchronization for pending or failed local items}
        {--limit=100 : Maximum number of items to inspect}';

    protected $description = 'Report local SeaTalk approval items and optionally retry provider synchronization';

    public function handle(
        ApprovalItemSynchronizer $synchronizer,
        SeaTalkApprovalCenterGateway $gateway,
    ): int {
        if (! Schema::hasTable('seatalk_approval_items')) {
            $this->warn('Approval Center schema is not installed.');

            return self::SUCCESS;
        }

        $limit = max(1, min(1000, (int) $this->option('limit')));
        $items = DB::table('seatalk_approval_items as items')
            ->join('requests', 'requests.id', '=', 'items.request_id')
            ->where(function ($query): void {
                $query->whereIn('items.status', ['PENDING', 'ACTIVE', 'FAILED'])
                    ->orWhereRaw("items.status <> CASE requests.approval_status WHEN 'APPROVED' THEN 'APPROVED' WHEN 'REJECTED' THEN 'REJECTED' WHEN 'CANCELLED' THEN 'CLOSED' ELSE 'ACTIVE' END");
            })
            ->orderBy('items.updated_at')
            ->limit($limit)
            ->get(['items.id', 'items.request_id', 'items.status', 'items.provider_item_id', 'items.failure_reason', 'requests.approval_status']);

        $this->info(sprintf('Inspected %d local approval item(s).', $items->count()));
        $this->table(['Item', 'Request', 'Local status', 'Provider ID', 'Failure'], $items->map(fn (object $item): array => [
            $item->id,
            $item->request_id,
            $item->status,
            $item->provider_item_id ?: '-',
            $item->failure_reason ? mb_substr((string) $item->failure_reason, 0, 80) : '-',
        ])->all());

        $mismatches = 0;
        foreach ($items as $item) {
            if (! $item->provider_item_id) {
                $this->warn(sprintf('%s: no provider item ID exists yet.', $item->request_id));
                $mismatches++;

                continue;
            }

            try {
                $providerItem = $gateway->getItem((string) $item->provider_item_id)->item();
                $providerState = data_get($providerItem, 'status.state');
                $expectedState = $this->expectedState((string) ($item->approval_status ?? 'PENDING'));
                if ($providerState !== $expectedState) {
                    $this->warn(sprintf(
                        '%s: provider state %s differs from canonical state %s.',
                        $item->request_id,
                        $providerState === null ? 'unknown' : (string) $providerState,
                        (string) $expectedState,
                    ));
                    $mismatches++;
                }
            } catch (\Throwable $exception) {
                $this->warn(sprintf('%s: provider comparison failed: %s', $item->request_id, $exception->getMessage()));
                $mismatches++;
            }
        }

        if (! $this->option('repair')) {
            $this->line('Dry run only. Use --repair to retry provider synchronization.');

            return self::SUCCESS;
        }

        $failed = 0;
        foreach ($items as $item) {
            $result = $synchronizer->synchronize((string) $item->request_id);
            if (! $result->synchronized()) {
                $failed++;
                $this->warn(sprintf('%s: %s', $item->request_id, $result->failureReason ?? $result->status));
            }
        }

        $this->info(sprintf('Retried %d item(s); %d still need attention; %d provider mismatch(es) observed.', $items->count(), $failed, $mismatches));

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function expectedState(string $approvalStatus): int
    {
        return match ($approvalStatus) {
            'APPROVED' => 1,
            'REJECTED' => 2,
            'CANCELLED' => 4,
            default => 0,
        };
    }
}
