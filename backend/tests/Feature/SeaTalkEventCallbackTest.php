<?php

namespace Tests\Feature;

use Tests\TestCase;

final class SeaTalkEventCallbackTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('services.seatalk.approval.callback_signing_secret', 'event-secret');
    }

    public function test_verification_event_returns_the_exact_challenge_after_signature_validation(): void
    {
        $payload = [
            'event_type' => 'event_verification',
            'event' => ['seatalk_challenge' => 'challenge-123'],
        ];
        $body = json_encode($payload, JSON_THROW_ON_ERROR);
        $signature = hash('sha256', $body.'event-secret');

        $this->withHeaders(['Signature' => $signature])
            ->postJson('/api/v1/integrations/seatalk/events', $payload)
            ->assertOk()
            ->assertExactJson(['seatalk_challenge' => 'challenge-123']);
    }

    public function test_invalid_event_signature_is_rejected(): void
    {
        $this->withHeaders(['Signature' => str_repeat('0', 64)])
            ->postJson('/api/v1/integrations/seatalk/events', [
                'event_type' => 'event_verification',
                'event' => ['seatalk_challenge' => 'challenge-123'],
            ])
            ->assertUnauthorized();
    }
}
