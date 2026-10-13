<?php

namespace Tests\Unit;

use App\Features\Approvals\SeaTalkCallbackSignature;
use PHPUnit\Framework\TestCase;

final class SeaTalkCallbackSignatureTest extends TestCase
{
    public function test_approval_signature_uses_documented_components_and_sorted_query(): void
    {
        $signature = SeaTalkCallbackSignature::approvalSignature(
            'POST',
            '/api/approval?z=last&a=first',
            'application/json',
            '{"item_id":"item-1"}',
            'Tue, 13 Oct 2026 12:00:00 GMT',
            'opaque-token',
            'app-secret',
        );

        $string = implode("\n", [
            'POST',
            '/api/approval',
            'application/json',
            md5('{"item_id":"item-1"}'),
            'Tue, 13 Oct 2026 12:00:00 GMT',
            'opaque-token',
            'a=first&z=last',
        ]);
        $this->assertSame(base64_encode(hash_hmac('sha1', $string, 'app-secret', true)), $signature);
        $this->assertTrue(SeaTalkCallbackSignature::verifyApproval(
            'POST', '/api/approval?z=last&a=first', 'application/json',
            '{"item_id":"item-1"}', 'Tue, 13 Oct 2026 12:00:00 GMT',
            'opaque-token', $signature, 'app-secret',
        ));
    }

    public function test_event_signature_uses_raw_body_and_lowercase_sha256(): void
    {
        $rawBody = '{"event_type":"event_verification","event":{"seatalk_challenge":"abc"}}';
        $signature = hash('sha256', $rawBody.'event-secret');

        $this->assertTrue(SeaTalkCallbackSignature::verifyEvent($rawBody, $signature, 'event-secret'));
        $this->assertFalse(SeaTalkCallbackSignature::verifyEvent($rawBody, strtoupper($signature), 'event-secret'));
    }

    public function test_approval_signature_preserves_and_sorts_duplicate_query_parameters(): void
    {
        $signature = SeaTalkCallbackSignature::approvalSignature(
            'GET', '/callback?tag=z&tag=a', 'application/json', '', 'date', 'token', 'secret',
        );
        $canonical = implode("\n", [
            'GET', '/callback', 'application/json', md5(''), 'date', 'token', 'tag=a&tag=z',
        ]);

        $this->assertSame(base64_encode(hash_hmac('sha1', $canonical, 'secret', true)), $signature);
    }
}
