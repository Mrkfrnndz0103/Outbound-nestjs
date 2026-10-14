<?php

namespace App\Features\Approvals;

use RuntimeException;

final class ApprovalToken
{
    public function forAssignment(string $assignmentId): string
    {
        $secret = $this->secret();

        return hash_hmac('sha256', $assignmentId, $secret);
    }

    public function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public function matches(string $assignmentId, string $token, ?string $expectedHash = null): bool
    {
        $expectedHash ??= $this->hash($this->forAssignment($assignmentId));

        return hash_equals($expectedHash, $this->hash($token));
    }

    private function secret(): string
    {
        $secret = (string) config('services.seatalk.approval.token_secret');
        if ($secret === '') {
            throw new RuntimeException('SeaTalk approval token secret is not configured.');
        }

        return $secret;
    }
}
