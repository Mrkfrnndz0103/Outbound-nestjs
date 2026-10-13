<?php

namespace App\Features\Outbox;

use App\Features\Approvals\ApprovalItemProvisioner;
use App\Features\Approvals\ApprovalItemSynchronizer;
use App\Features\Outbox\Handlers\GoogleSheetsSynchronizationOutboxHandler;
use App\Features\Outbox\Handlers\NotificationOutboxHandler;
use App\Features\Outbox\Handlers\SeaTalkProvisioningOutboxHandler;
use App\Features\Outbox\Handlers\SeaTalkSynchronizationOutboxHandler;
use App\Integrations\GoogleSheets\GoogleSheetsRequestSync;

final class WorkflowOutboxHandlerRegistry
{
    /** @param array<string, WorkflowOutboxHandler> $handlers */
    public function __construct(private array $handlers = []) {}

    public function handlerFor(string $eventType): WorkflowOutboxHandler
    {
        $handler = $this->handlers[$eventType] ?? $this->defaultHandler($eventType);
        if (! $handler instanceof WorkflowOutboxHandler) {
            throw new TerminalWorkflowOutboxException("No outbox handler registered for {$eventType}.");
        }

        return $handler;
    }

    private function defaultHandler(string $eventType): ?WorkflowOutboxHandler
    {
        return match ($eventType) {
            WorkflowOutboxEvent::NotificationCreated => new NotificationOutboxHandler,
            WorkflowOutboxEvent::GoogleSheetsSynchronize => new GoogleSheetsSynchronizationOutboxHandler(
                static fn () => app(GoogleSheetsRequestSync::class)->sync(),
            ),
            WorkflowOutboxEvent::SeaTalkProvision => new SeaTalkProvisioningOutboxHandler(
                static fn (string $requestId) => app(ApprovalItemProvisioner::class)->sync($requestId),
            ),
            WorkflowOutboxEvent::SeaTalkSynchronize => new SeaTalkSynchronizationOutboxHandler(
                static fn (string $requestId) => app(ApprovalItemSynchronizer::class)->synchronize($requestId),
            ),
            default => null,
        };
    }
}
