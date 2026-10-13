<?php

namespace App\Features\Requests;

enum RequestStatus: string
{
    case Pending = 'PENDING';
    case Requested = 'REQUESTED';
    case Cancelled = 'CANCELLED';
    case Rejected = 'REJECTED';
    case Rerouted = 'REROUTED';
    case Assigned = 'ASSIGNED';
    case Docking = 'DOCKING';
    case Docked = 'DOCKED';

    /**
     * @return list<string>
     */
    public static function workflowValues(): array
    {
        return array_map(static fn (self $status): string => $status->value, self::cases());
    }

    /**
     * @return list<string>
     */
    public static function approvalPendingValues(): array
    {
        return [self::Pending->value, self::Rerouted->value];
    }

    public static function nextActionRole(object $request): ?string
    {
        return match ($request->status) {
            'PENDING', 'REROUTED' => 'fte_ops',
            'REQUESTED' => 'fte_mm',
            'ASSIGNED', 'DOCKING' => blank($request->driver_id ?? null) ? 'doc_officer' : 'ops_pic',
            'REJECTED' => $request->rejection_return_role ?? null,
            default => null,
        };
    }

    public static function displayFor(string $role, string $status): string
    {
        if ($status === 'DOCKING' && $role === 'fte_mm') {
            return self::Assigned->value;
        }

        return $status === 'REROUTED' && in_array($role, ['fte_mm', 'doc_officer'], true)
            ? self::Pending->value
            : $status;
    }
}
