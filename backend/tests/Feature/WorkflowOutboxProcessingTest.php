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
