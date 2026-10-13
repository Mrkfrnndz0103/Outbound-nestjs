<?php

namespace Tests\Feature;

use App\Features\Approvals\ProvisioningResult;
use App\Features\Approvals\SynchronizationResult;
use App\Features\Outbox\Handlers\SeaTalkProvisioningOutboxHandler;
use App\Features\Outbox\Handlers\SeaTalkSynchronizationOutboxHandler;
use App\Features\Outbox\RetryableWorkflowOutboxException;
use Tests\TestCase;

final class SeaTalkOutboxDeliveryTest extends TestCase
{
    public function test_provisioning_handler_delegates_request_delivery(): void
    {
        $calledWith = null;
        $provisioner = function (string $requestId) use (&$calledWith): ProvisioningResult {
            $calledWith = $requestId;

            return new ProvisioningResult('delivered');
        };

        (new SeaTalkProvisioningOutboxHandler($provisioner))->handle((object) [
            'id' => 'outbox-1',
            'payload' => ['request_id' => 'request-1'],
        ]);

        $this->assertSame('request-1', $calledWith);
    }

    public function test_failed_provisioning_is_retryable(): void
    {
        $provisioner = static fn (string $requestId): ProvisioningResult => new ProvisioningResult('failed', failureReason: 'provider unavailable');

        $this->expectException(RetryableWorkflowOutboxException::class);
        (new SeaTalkProvisioningOutboxHandler($provisioner))->handle((object) [
            'id' => 'outbox-1',
            'payload' => ['request_id' => 'request-1'],
        ]);
    }

    public function test_synchronization_handler_delegates_request_sync(): void
    {
        $calledWith = null;
        $synchronizer = function (string $requestId) use (&$calledWith): SynchronizationResult {
            $calledWith = $requestId;

            return new SynchronizationResult('synchronized');
        };

        (new SeaTalkSynchronizationOutboxHandler($synchronizer))->handle((object) [
            'id' => 'outbox-1',
            'payload' => ['request_id' => 'request-1'],
        ]);

        $this->assertSame('request-1', $calledWith);
    }
}
