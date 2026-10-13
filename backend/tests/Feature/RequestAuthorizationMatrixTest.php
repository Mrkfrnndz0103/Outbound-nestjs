<?php

namespace Tests\Feature;

use App\Features\Requests\RequestAuthorizer;
use PHPUnit\Framework\TestCase;

final class RequestAuthorizationMatrixTest extends TestCase
{
    public function test_workflow_actions_are_restricted_to_their_roles(): void
    {
        $request = (object) ['id' => 'request', 'created_by' => 'owner', 'status' => 'PENDING'];
        $allowed = [
            'ops_pic' => ['cancel', 'mark-docked'],
            'fte_ops' => ['approve', 'reject-ops', 'cancel'],
            'fte_mm' => ['reject-mm', 'assign-truck', 'cancel'],
            'doc_officer' => ['mark-docked', 'reassign-driver'],
        ];
        $actions = ['approve', 'reject-ops', 'cancel', 'reject-mm', 'assign-truck', 'mark-docked', 'reassign-driver'];
        $authorizer = new RequestAuthorizer;

        foreach (['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer'] as $role) {
            $request->status = in_array($role, ['fte_mm', 'doc_officer'], true) ? ($role === 'fte_mm' ? 'REQUESTED' : 'DOCKING') : 'PENDING';
            $actor = (object) ['id' => $role === 'ops_pic' ? 'owner' : $role, 'role' => $role];
            foreach ($actions as $action) {
                $expected = in_array($action, $allowed[$role], true)
                    && ($role !== 'ops_pic' || $actor->id === $request->created_by);
                self::assertSame($expected, $authorizer->canTransition($actor, $action, $request), "Unexpected authorization for {$role}/{$action}");
            }
        }

        $nonOwner = (object) ['id' => 'other', 'role' => 'ops_pic'];
        self::assertFalse($authorizer->canTransition($nonOwner, 'cancel', $request));
        self::assertFalse($authorizer->canTransition($nonOwner, 'mark-docked', $request));
    }
}
