<?php

namespace App\Features\Outbox;

final class WorkflowOutboxEvent
{
    public const NotificationCreated = 'workflow.notification.created';

    public const SeaTalkProvision = 'workflow.seatalk.provision';

    public const SeaTalkSynchronize = 'workflow.seatalk.synchronize';

    public const GoogleSheetsSynchronize = 'workflow.google_sheets.synchronize';
}
