<?php

namespace Tests\Feature;

use App\Features\Outbox\RetryableWorkflowOutboxException;
use App\Features\Outbox\TerminalWorkflowOutboxException;
use App\Features\Outbox\WorkflowOutboxDispatcher;
use App\Features\Outbox\WorkflowOutboxHandler;
use App\Features\Outbox\WorkflowOutboxHandlerRegistry;
use App\Features\Outbox\WorkflowOutboxRepository;
use App\Features\Outbox\WorkflowOutboxStatusController;
use App\Features\Outbox\WorkflowOutboxWriter;
use App\Jobs\ProcessWorkflowOutbox;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class WorkflowOutboxProcessingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        config()->set('workflow_outbox.processing_timeout_seconds', 300);
        config()->set('workflow_outbox.max_backoff_seconds', 300);
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        (require database_path('migrations/2026_10_13_000003_create_workflow_outbox.php'))->up();
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('workflow_outbox');
        parent::tearDown();
    }

    public function test_successful_handler_completes_the_outbox_row(): void
    {
        $id = $this->record('success');
        $registry = new WorkflowOutboxHandlerRegistry([
            'success' => new class implements WorkflowOutboxHandler
            {
                public function handle(object $outbox): void {}
            },
        ]);

        (new ProcessWorkflowOutbox($id))->handle(new WorkflowOutboxRepository, $registry);

        $this->assertDatabaseHas('workflow_outbox', [
            'id' => $id,
            'status' => 'COMPLETED',
            'attempts' => 1,
        ]);
    }

    public function test_drainer_dispatches_due_and_abandoned_work_but_not_future_or_completed_rows(): void
    {
        Queue::fake();
        $due = $this->record('due');
        $stale = $this->record('stale');
        $future = $this->record('future');
        $done = $this->record('done');
        DB::table('workflow_outbox')->where('id', $stale)->update(['status' => 'PROCESSING', 'processing_started_at' => now()->subMinutes(10)]);
        DB::table('workflow_outbox')->where('id', $future)->update(['available_at' => now()->addHour()]);
        DB::table('workflow_outbox')->where('id', $done)->update(['status' => 'COMPLETED']);

        $this->artisan('outbox:drain', ['--limit' => 10])->assertExitCode(0);

        Queue::assertPushed(ProcessWorkflowOutbox::class, fn ($job): bool => $job->outboxId === $due);
        Queue::assertPushed(ProcessWorkflowOutbox::class, fn ($job): bool => $job->outboxId === $stale);
        Queue::assertPushed(ProcessWorkflowOutbox::class, 2);
    }

    public function test_retryable_failure_is_dispatched_again_when_due(): void
    {
        $id = $this->record('retry-drain');
        $registry = new WorkflowOutboxHandlerRegistry(['retry-drain' => new class implements WorkflowOutboxHandler
        {
            public function handle(object $outbox): void
            {
                throw new RetryableWorkflowOutboxException('outage');
            }
        }]);
        (new ProcessWorkflowOutbox($id))->handle(new WorkflowOutboxRepository, $registry);
        $this->travel(10)->seconds();
        Queue::fake();
        $this->artisan('outbox:drain')->assertExitCode(0);
        Queue::assertPushed(ProcessWorkflowOutbox::class, fn ($job): bool => $job->outboxId === $id);
    }

    public function test_stale_worker_cannot_complete_a_newer_attempt(): void
    {
        $id = $this->record('fenced');
        $repository = new WorkflowOutboxRepository;
        $old = $repository->claim($id, CarbonImmutable::now());
        $this->travel(10)->minutes();
        $new = $repository->claim($id, CarbonImmutable::now());
        $repository->complete($id, $old);
        $this->assertDatabaseHas('workflow_outbox', ['id' => $id, 'status' => 'PROCESSING', 'attempts' => $new->attempts]);
        $repository->complete($id, $new);
        $this->assertDatabaseHas('workflow_outbox', ['id' => $id, 'status' => 'COMPLETED']);
    }

    public function test_abandoned_attempts_are_capped_and_dead_letter_can_be_replayed(): void
    {
        DB::unprepared("CREATE TRIGGER enforce_outbox_attempt_cap BEFORE UPDATE ON workflow_outbox WHEN NEW.attempts > NEW.max_attempts BEGIN SELECT RAISE(ABORT, 'attempt cap exceeded'); END");
        $id = $this->record('capped');
        DB::table('workflow_outbox')->where('id', $id)->update(['status' => 'PROCESSING', 'attempts' => 5, 'processing_started_at' => now()->subMinutes(10)]);
        $handler = new class implements WorkflowOutboxHandler
        {
            public bool $called = false;

            public function handle(object $outbox): void
            {
                $this->called = true;
            }
        };
        (new ProcessWorkflowOutbox($id))->handle(new WorkflowOutboxRepository, new WorkflowOutboxHandlerRegistry(['capped' => $handler]));
        $this->assertFalse($handler->called);
        $this->assertDatabaseHas('workflow_outbox', ['id' => $id, 'status' => 'DEAD_LETTER']);
        $this->assertDatabaseHas('workflow_outbox', ['id' => $id, 'attempts' => 5]);
        Queue::fake();
        $this->artisan('outbox:retry', ['id' => $id])->assertExitCode(0);
        $this->assertDatabaseHas('workflow_outbox', ['id' => $id, 'status' => 'PENDING', 'attempts' => 0]);
        Queue::assertPushed(ProcessWorkflowOutbox::class);
    }

    public function test_final_active_lease_is_not_dead_lettered_before_expiry(): void
    {
        $id = $this->record('final-active');
        DB::table('workflow_outbox')->where('id', $id)->update([
            'status' => 'PROCESSING', 'attempts' => 5, 'processing_started_at' => now(),
        ]);

        $this->assertNull((new WorkflowOutboxRepository)->claim($id, CarbonImmutable::now()));
        $this->assertDatabaseHas('workflow_outbox', ['id' => $id, 'status' => 'PROCESSING', 'attempts' => 5]);
    }

    public function test_status_endpoint_reports_retry_and_dead_letter_visibility_without_payloads(): void
    {
        $this->record('retry');
        $deadId = $this->record('dead');
        DB::table('workflow_outbox')->where('id', $deadId)->update(['status' => 'DEAD_LETTER', 'last_error' => 'provider failed']);
        $request = Request::create('/api/operations/outbox/status', 'GET');
        $request->attributes->set('actor', (object) ['role' => 'ops_pic', 'is_admin' => true]);

        $response = (new WorkflowOutboxStatusController)->show($request)->getData(true);

        $this->assertSame(1, $response['counts']['PENDING']);
        $this->assertSame(1, $response['counts']['DEAD_LETTER']);
        $this->assertArrayNotHasKey('payload', $response);
    }

    public function test_status_endpoint_rejects_non_admin_operations_users(): void
    {
        $request = Request::create('/api/operations/outbox/status', 'GET');
        $request->attributes->set('actor', (object) ['role' => 'fte_ops', 'is_admin' => false]);

        $this->expectException(HttpException::class);
        (new WorkflowOutboxStatusController)->show($request);
    }

    public function test_status_distinguishes_due_delayed_and_abandoned_work(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-23 10:00:00'));
        $this->record('due-status');
        $delayed = $this->record('delayed-status');
        $stale = $this->record('stale-status');
        $fresh = $this->record('fresh-status');
        DB::table('workflow_outbox')->where('id', $delayed)->update(['available_at' => now()->addMinute()]);
        DB::table('workflow_outbox')->where('id', $stale)->update(['status' => 'PROCESSING', 'processing_started_at' => now()->subSeconds(300)]);
        DB::table('workflow_outbox')->where('id', $fresh)->update(['status' => 'PROCESSING', 'processing_started_at' => now()->subSeconds(299)]);
        $request = Request::create('/api/operations/outbox/status', 'GET');
        $request->attributes->set('actor', (object) ['role' => 'ops_pic', 'is_admin' => true]);

        $response = (new WorkflowOutboxStatusController)->show($request)->getData(true);

        $this->assertSame(1, $response['due_pending']);
        $this->assertSame(1, $response['delayed_pending']);
        $this->assertSame(1, $response['stale_processing']);
        $this->assertSame('2026-10-23 10:00:00', $response['oldest_due_available_at']);
        $this->assertSame('2026-10-23 09:55:00', $response['oldest_processing_started_at']);
        $this->artisan('outbox:status')
            ->expectsOutput('Due pending: 1')
            ->expectsOutput('Delayed pending: 1')
            ->expectsOutput('Stale processing: 1')
            ->assertExitCode(0);
    }

    public function test_empty_status_has_zero_counts_and_null_oldest_times(): void
    {
        $request = Request::create('/api/operations/outbox/status', 'GET');
        $request->attributes->set('actor', (object) ['role' => 'ops_pic', 'is_admin' => true]);
        $response = (new WorkflowOutboxStatusController)->show($request)->getData(true);
        $this->assertSame(0, $response['due_pending']);
        $this->assertSame(0, $response['stale_processing']);
        $this->assertNull($response['oldest_due_available_at']);
        $this->assertNull($response['oldest_processing_started_at']);
    }

    public function test_retryable_failure_reschedules_the_row(): void
    {
        $id = $this->record('retry');
        $registry = new WorkflowOutboxHandlerRegistry([
            'retry' => new class implements WorkflowOutboxHandler
            {
                public function handle(object $outbox): void
                {
                    throw new RetryableWorkflowOutboxException('temporary provider outage');
                }
            },
        ]);

        (new ProcessWorkflowOutbox($id))->handle(new WorkflowOutboxRepository, $registry);

        $row = DB::table('workflow_outbox')->where('id', $id)->first();
        $this->assertSame('PENDING', $row->status);
        $this->assertSame(1, $row->attempts);
        $this->assertSame('temporary provider outage', $row->last_error);
        $this->assertGreaterThan(now()->timestamp, strtotime((string) $row->available_at));
    }

    public function test_terminal_failure_dead_letters_the_row(): void
    {
        $id = $this->record('terminal');
        $registry = new WorkflowOutboxHandlerRegistry([
            'terminal' => new class implements WorkflowOutboxHandler
            {
                public function handle(object $outbox): void
                {
                    throw new TerminalWorkflowOutboxException('invalid provider contract');
                }
            },
        ]);

        (new ProcessWorkflowOutbox($id))->handle(new WorkflowOutboxRepository, $registry);

        $this->assertDatabaseHas('workflow_outbox', [
            'id' => $id,
            'status' => 'DEAD_LETTER',
            'last_error' => 'invalid provider contract',
        ]);
    }

    public function test_missing_handler_dead_letters_the_row(): void
    {
        $id = $this->record('missing');

        (new ProcessWorkflowOutbox($id))->handle(
            new WorkflowOutboxRepository,
            new WorkflowOutboxHandlerRegistry,
        );

        $this->assertDatabaseHas('workflow_outbox', [
            'id' => $id,
            'status' => 'DEAD_LETTER',
        ]);
    }

    public function test_status_command_reports_counts_without_payloads(): void
    {
        $this->record('status');

        $this->artisan('outbox:status')
            ->expectsOutputToContain('PENDING: 1')
            ->doesntExpectOutputToContain('request-1')
            ->assertExitCode(0);
    }

    public function test_dispatcher_enqueues_only_the_outbox_identifier(): void
    {
        Queue::fake();
        $id = $this->record('dispatch');

        app(WorkflowOutboxDispatcher::class)->dispatch($id);

        Queue::assertPushed(ProcessWorkflowOutbox::class, fn (ProcessWorkflowOutbox $job): bool => $job->outboxId === $id);
    }

    private function record(string $eventType): string
    {
        return (new WorkflowOutboxWriter(new WorkflowOutboxRepository))->record(
            $eventType,
            $eventType.':1',
            'request',
            'request-1',
            ['request_id' => 'request-1'],
        );
    }
}
