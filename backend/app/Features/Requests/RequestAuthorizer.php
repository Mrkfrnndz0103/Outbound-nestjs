<?php

namespace App\Features\Requests;

final class RequestAuthorizer
{
    public function canView(object $actor, object $request): bool
    {
        return $actor->role !== 'ops_pic'
            || ($actor->is_admin ?? false)
            || $request->created_by === $actor->id;
    }

    public function canEdit(object $actor, object $request): bool
    {
        if ($request->status === 'REJECTED') {
            return RequestStatus::nextActionRole($request) === $actor->role
                && ($actor->role === 'fte_ops'
                    || ($actor->role === 'ops_pic' && $request->created_by === $actor->id));
        }

        return ($actor->role === 'fte_ops' && in_array($request->status, ['PENDING', 'REROUTED'], true))
            || ($actor->role === 'ops_pic' && $request->created_by === $actor->id && $request->status === 'DOCKED');
    }

    public function canTransition(object $actor, string $action, object $request): bool
    {
        if ($action === 'cancel') {
            if ($actor->role === 'ops_pic') {
                return $request->created_by === $actor->id
                    && (in_array($request->status, ['PENDING', 'REROUTED'], true)
                        || ($request->status === 'REJECTED' && RequestStatus::nextActionRole($request) === 'ops_pic'));
            }

            return in_array($actor->role, ['fte_ops', 'fte_mm'], true)
                && RequestStatus::nextActionRole($request) === $actor->role;
        }

        if ($action === 'mark-docked') {
            return ($actor->role === 'doc_officer' && $request->status === 'DOCKING')
                || ($actor->role === 'ops_pic' && $request->created_by === $actor->id);
        }

        if ($action === 'reassign-driver') {
            return $actor->role === 'doc_officer' && $request->status === 'DOCKING';
        }

        return match ($action) {
            'approve', 'reject-ops' => $actor->role === 'fte_ops',
            'reject-mm', 'assign-truck' => $actor->role === 'fte_mm',
            default => false,
        };
    }
}
