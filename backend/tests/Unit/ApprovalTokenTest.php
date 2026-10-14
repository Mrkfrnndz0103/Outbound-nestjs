<?php

namespace Tests\Unit;

use App\Features\Approvals\ApprovalToken;
use Tests\TestCase;

final class ApprovalTokenTest extends TestCase
{
    public function test_assignment_tokens_are_bound_to_the_assignment_and_verify_without_storing_raw_value(): void
    {
        config()->set('services.seatalk.approval.token_secret', 'test-token-secret');

        $token = app(ApprovalToken::class)->forAssignment('assignment-1');

        $this->assertSame($token, app(ApprovalToken::class)->forAssignment('assignment-1'));
        $this->assertNotSame($token, app(ApprovalToken::class)->forAssignment('assignment-2'));
        $this->assertTrue(app(ApprovalToken::class)->matches('assignment-1', $token));
        $this->assertFalse(app(ApprovalToken::class)->matches('assignment-2', $token));
        $this->assertSame(hash('sha256', $token), app(ApprovalToken::class)->hash($token));
    }
}
