# Workflow Outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workflow notifications, SeaTalk synchronization, and Google Sheets synchronization durable, idempotent, retryable side effects recorded atomically with request mutations.

**Architecture:** Request services write `workflow_outbox` intents in their existing database transactions. An after-commit dispatcher enqueues an outbox row job; the job claims the row, routes to an idempotent handler, and records completion, retry, or dead-letter state. Existing provider and Sheets services remain the domain adapters, while notifications gain an outbox delivery key.

**Tech Stack:** Laravel 12, PHP 8.3+, PostgreSQL/Supabase, SQLite feature tests, Laravel database/Redis queues, PHPUnit, Laravel scheduler/Artisan commands.

**Spec:** `docs/superpowers/specs/2026-10-13-workflow-outbox-design.md`

## Global Constraints

- The backend database remains authoritative for request state, audit events, and outbox intent records.
- No remote provider or Google Sheets call may occur before the enclosing request transaction commits.
- Do not add Redis as a prerequisite; database queue support remains valid.
- Outbox payloads and logs must never contain credentials or raw provider secrets.
- Existing request authorization, workflow statuses, audit records, response contracts, provider feature flags, and fail-closed behavior must remain unchanged.
- Outbox delivery must be idempotent and safe to retry against newer request versions.

## Review Focus

- Rollback after a request mutation must remove its outbox intents and dispatch nothing.
- A duplicate notification delivery must produce one notification, enforced by the outbox delivery key.
- A stale provider/sheet retry must not overwrite a newer workflow version.
- A transient failure must return to pending with bounded backoff; an exhausted or terminal failure must become dead-lettered.
- Claim recovery must make a stuck processing row visible and retryable without two workers applying it concurrently.

### Task 1: Add the outbox and notification persistence contract

**Files:**
- Create: `backend/database/migrations/*_create_workflow_outbox.php`
- Create: `supabase/migrations/*_workflow_outbox.sql`
- Modify: `backend/database/migrations/*_notification*.php` or create a follow-up notification column migration
- Modify: `supabase/migrations/*_notification*.sql` or create a follow-up notification column migration
- Test: `backend/tests/Feature/WorkflowOutboxSchemaTest.php`
- Test: `backend/tests/Feature/BackendSupportTablesSecurityMigrationTest.php` if its required-table contract must be extended

**Interfaces:**
- Produces `workflow_outbox` columns for UUID ID, unique idempotency key, aggregate identity, event type, JSON payload, status, attempt limits/counters, availability/claim timestamps, error text, completion/dead-letter timestamps, and created/updated timestamps.
- Produces nullable `notifications.outbox_id` with a uniqueness constraint for delivered outbox notifications.
- Keeps the Laravel and Supabase schemas equivalent, including indexes for pending work and aggregate lookup.

- [ ] **Step 1: Write failing schema tests** for required columns, status constraints, unique idempotency keys, pending-work index, notification delivery-key uniqueness, and JSON payload storage.
- [ ] **Step 2: Run the focused schema tests** with SQLite where possible and the PostgreSQL group when available; confirm failure is caused by missing schema.
- [ ] **Step 3: Implement the Laravel and Supabase migrations** with explicit defaults, safe lengths, and reversible Laravel migration behavior.
- [ ] **Step 4: Run the focused schema tests** and confirm the SQLite-compatible assertions pass; run PostgreSQL assertions against the isolated PostgreSQL database.
- [ ] **Step 5: Review migration parity** and run `php artisan test --group=postgres --fail-on-skipped` in the PostgreSQL environment.

### Task 2: Implement the outbox domain model and transactional writer

**Files:**
- Create: `backend/app/Features/Outbox/WorkflowOutboxStatus.php`
- Create: `backend/app/Features/Outbox/WorkflowOutboxEvent.php`
- Create: `backend/app/Features/Outbox/WorkflowOutboxWriter.php`
- Create: `backend/app/Features/Outbox/WorkflowOutboxRepository.php`
- Test: `backend/tests/Feature/WorkflowOutboxWriterTest.php`

**Interfaces:**
- `WorkflowOutboxWriter::record(string $eventType, string $idempotencyKey, ?string $aggregateType, ?string $aggregateId, array $payload, ?int $maxAttempts = null): string`
- `WorkflowOutboxRepository::find(string $id): ?object`
- `WorkflowOutboxRepository::claim(string $id, CarbonImmutable $now): ?object`
- `WorkflowOutboxRepository::complete(string $id): void`
- `WorkflowOutboxRepository::retry(string $id, string $error, CarbonImmutable $availableAt): void`
- `WorkflowOutboxRepository::deadLetter(string $id, string $error): void`

- [ ] **Step 1: Write failing tests** for stable idempotency, duplicate-record coalescing, JSON payload serialization, and rollback behavior inside a transaction.
- [ ] **Step 2: Run the focused writer tests** and confirm they fail for the missing writer/schema behavior.
- [ ] **Step 3: Implement the enum/value object and writer/repository** using the current transaction connection and an atomic unique-key insert-or-fetch path.
- [ ] **Step 4: Run the focused tests** and confirm duplicate calls return the same outbox ID without creating a second row.
- [ ] **Step 5: Add claim semantics tests** for pending rows, unavailable rows, already-completed rows, and stale processing claims.

### Task 3: Add durable dispatch and handler routing

**Files:**
- Create: `backend/app/Features/Outbox/WorkflowOutboxHandler.php`
- Create: `backend/app/Features/Outbox/WorkflowOutboxHandlerRegistry.php`
- Create: `backend/app/Jobs/ProcessWorkflowOutbox.php`
- Create: `backend/app/Features/Outbox/WorkflowOutboxDispatcher.php`
- Modify: `backend/config/queue.php` only if queue connection settings need explicit after-commit behavior
- Test: `backend/tests/Feature/WorkflowOutboxProcessingTest.php`

**Interfaces:**
- `WorkflowOutboxHandler::handle(object $outbox): void`
- `WorkflowOutboxHandlerRegistry::handlerFor(string $eventType): WorkflowOutboxHandler`
- `WorkflowOutboxDispatcher::dispatch(string $outboxId): void`
- `ProcessWorkflowOutbox::__construct(string $outboxId)` and `handle(WorkflowOutboxRepository $repository, WorkflowOutboxHandlerRegistry $registry): void`

- [ ] **Step 1: Write failing processing tests** for claim-before-handle, completion, retryable exception backoff, terminal exception dead-lettering, missing handler dead-lettering, and stale-claim recovery.
- [ ] **Step 2: Run the focused processing tests** and confirm the expected missing-service/job failures.
- [ ] **Step 3: Implement repository claim/update operations, handler routing, and the queue job** with bounded exponential backoff and configurable maximum attempts.
- [ ] **Step 4: Run processing tests** using the synchronous queue fake/driver and confirm each status transition and attempt count.
- [ ] **Step 5: Add an operational query/Artisan command** reporting counts plus oldest pending and dead-letter rows, and test that output excludes payload secrets.

### Task 4: Move notification creation behind outbox handlers

**Files:**
- Create: `backend/app/Features/Outbox/Handlers/NotificationOutboxHandler.php`
- Create: `backend/app/Features/Outbox/NotificationIntent.php` if a typed payload is needed
- Modify: `backend/app/Features/Requests/RequestService.php`
- Modify: `backend/app/Features/Approvals/ApprovalService.php`
- Test: `backend/tests/Feature/WorkflowNotificationOutboxTest.php`
- Modify: existing request/approval tests only where they currently assert immediate notification insertion

**Interfaces:**
- Notification event type: `workflow.notification.created`.
- Payload fields: request ID, optional user ID, optional target role, event type, title, body, and workflow version/correlation ID.
- Handler inserts one notification carrying `outbox_id`, using the unique delivery key as the replay guard.

- [ ] **Step 1: Write failing tests** proving request create/approval/rejection/cancellation writes notification intents transactionally and does not insert notifications before processing.
- [ ] **Step 2: Run focused tests** and confirm the current synchronous notification behavior fails the new durable contract.
- [ ] **Step 3: Replace direct notification inserts with outbox writes** while preserving exact event/title/body/recipient values.
- [ ] **Step 4: Register and implement the notification handler** with duplicate-safe insertion and stale-version checks where applicable.
- [ ] **Step 5: Run focused request/approval tests** and update test setup to process pending outbox rows explicitly.

### Task 5: Move SeaTalk provisioning and synchronization behind outbox handlers

**Files:**
- Create: `backend/app/Features/Outbox/Handlers/SeaTalkProvisioningOutboxHandler.php`
- Create: `backend/app/Features/Outbox/Handlers/SeaTalkSynchronizationOutboxHandler.php`
- Modify: `backend/app/Features/Requests/RequestService.php`
- Modify: `backend/app/Features/Approvals/ApprovalService.php`
- Modify: `backend/app/Features/Approvals/ApprovalRouter.php` only where it currently performs provider work directly
- Test: `backend/tests/Feature/SeaTalkOutboxDeliveryTest.php`

**Interfaces:**
- Event types: `workflow.seatalk.provision` and `workflow.seatalk.synchronize`.
- Payload contains only request ID and workflow version/correlation data; handlers reread current request/assignment state.
- Handlers delegate to existing `ApprovalItemProvisioner` and `ApprovalItemSynchronizer` and map provider failures to retryable or dead-letter outcomes without changing canonical request state.

- [ ] **Step 1: Write failing tests** for post-commit-only delivery, duplicate provisioning, provider failure retry, feature-disabled behavior, and stale synchronization.
- [ ] **Step 2: Run focused tests** and confirm current after-commit direct calls do not satisfy durable outbox expectations.
- [ ] **Step 3: Replace direct after-commit provider callbacks with outbox intents/dispatches** while preserving stable provider item IDs and feature flags.
- [ ] **Step 4: Register handlers and classify provider exceptions** without logging credentials or raw provider payloads.
- [ ] **Step 5: Run the existing approval provisioning, synchronization, callback, and routing suites plus the new tests.**

### Task 6: Move Google Sheets synchronization behind a coalesced outbox event

**Files:**
- Create: `backend/app/Features/Outbox/Handlers/GoogleSheetsSynchronizationOutboxHandler.php`
- Modify: `backend/app/Jobs/SyncRequestsToGoogleSheetJob.php`
- Modify: the workflow mutation seam or scheduler command that triggers Sheets synchronization
- Test: `backend/tests/Feature/GoogleSheetsOutboxDeliveryTest.php`
- Test: `backend/tests/Feature/SyncRequestsToGoogleSheetJobTest.php`

**Interfaces:**
- Event type: `workflow.google_sheets.synchronize`.
- Payload contains the latest workflow correlation/version marker only; handler invokes the existing full-sync service and respects the existing feature flag.
- Equivalent pending events coalesce to one active intent without losing the latest committed request state.

- [ ] **Step 1: Write failing tests** for disabled sync, coalescing, post-commit dispatch, retry, and successful use of the existing sync service.
- [ ] **Step 2: Run focused tests** and confirm no durable Sheets intent exists.
- [ ] **Step 3: Implement the coalesced writer path and handler** while retaining the existing job as the transport-compatible worker entry point or adapting it to process an outbox ID.
- [ ] **Step 4: Run focused and existing Google Sheets tests** and verify no duplicate full-sync intent is created for one workflow version.

### Task 7: Add PostgreSQL integration coverage and deployment wiring

**Files:**
- Create/Modify: `backend/tests/Feature/PostgresWorkflowOutboxTest.php`
- Modify: `backend/tests/Feature/BackendSupportTablesSecurityMigrationTest.php` if required table/security checks need the outbox
- Modify: `docker-compose.async.yml` only if the existing worker command needs outbox-specific configuration
- Modify: `scripts/preflight.ps1` if a new check must be selected for outbox/schema changes
- Modify: `docs/architecture/system-design.md` and deployment documentation

- [ ] **Step 1: Write failing PostgreSQL tests** for JSONB payloads, unique idempotency keys, concurrent claims, index-backed pending lookup, retry/dead-letter transitions, and notification uniqueness.
- [ ] **Step 2: Run the PostgreSQL group** in the isolated database and confirm failures identify missing schema/behavior.
- [ ] **Step 3: Add only the required deployment/preflight wiring** and document worker, retry, and dead-letter operations.
- [ ] **Step 4: Run the complete backend suite, PostgreSQL suite, Pint, and relevant preflight checks.**

### Task 8: Final verification and handoff

- [ ] Run `npm ci` only if frontend files were affected; otherwise avoid unrelated frontend churn.
- [ ] Run `php artisan test --fail-on-skipped --exclude-group=postgres`.
- [ ] Run `php artisan test --group=postgres --fail-on-skipped` with PostgreSQL available.
- [ ] Run `vendor/bin/pint --test`.
- [ ] Run `git diff --check` and inspect the complete diff for secret leakage, unrelated changes, and migration parity.
- [ ] Run `docker compose config` and, where Docker is available, a worker smoke test.
- [ ] Report each acceptance criterion as verified, blocked, or not applicable with command evidence.

## Current verification status

Implementation tasks 1–7 are complete in the working tree, including the Laravel/Supabase schema pair, transactional writer, durable handlers, retry/dead-letter visibility, bounded queue coverage, and deployment documentation.

Verified locally:

- SQLite/non-PostgreSQL backend suite: 182 passed with 723 assertions in the full regression run.
- PostgreSQL suite: 20 passed with 59 assertions; one support-table RLS test remains skipped because the standalone local database does not contain Supabase's pre-existing `notifications` table.
- `vendor/bin/pint --test`: passed.
- Frontend tests, standard/accessibility lint, build, encoding, audit, and diff checks: passed.

Environment-blocked:

- Docker Compose config/build and worker smoke test: Docker is not installed on this workstation.
- Full fresh-database Laravel migration bootstrap: backend migrations intentionally depend on Supabase-managed base tables, including `notifications`; validate this boundary in the deployment/Supabase environment.
