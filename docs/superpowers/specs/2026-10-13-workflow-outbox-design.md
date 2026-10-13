# Workflow Outbox Design

## Purpose

Make workflow side effects durable and replayable without allowing external
provider or notification failures to roll back an already committed request
decision. The backend remains the source of truth for request state, audit
events, and outbox intent records.

## Scope and success criteria

The first implementation covers all workflow side effects currently emitted by
request creation, edits, approvals, rejections, assignment, docking, and
cancellation:

- user- and role-targeted notifications;
- SeaTalk approval-item provisioning and synchronization;
- Google Sheets request synchronization.

For every committed workflow mutation, the corresponding outbox intent is
committed atomically. A worker can process each intent after the request
transaction completes, retry transient failures with bounded backoff, and
expose permanently failed work through status queries or operational tooling.
Replaying an intent must not duplicate a notification or create conflicting
SeaTalk/Sheets state.

## Chosen architecture

Add a `workflow_outbox` table as a durable intent log. Each row has a
stable idempotency key, event type, JSON payload, aggregate/request ID,
status, attempt count, next-attempt timestamp, lock/processing timestamps,
completion timestamp, and bounded failure metadata. The status lifecycle is
`PENDING` → `PROCESSING` → `COMPLETED`, with retryable failures returning to
`PENDING` and exhausted failures becoming `DEAD_LETTER`.

Application services write outbox rows inside their existing transactions
instead of registering `DB::afterCommit` callbacks for workflow side effects.
An after-commit dispatcher enqueues a small job identified by the outbox row
ID. The job claims the row transactionally, invokes the handler for its event
type, records completion or retry metadata, and releases the claim on failure.
The durable row is the source of retry state; Laravel's queue is only the
transport and wake-up mechanism.

Handlers are idempotent:

- notifications persist the originating outbox ID as a unique delivery key,
  so a retry cannot insert a duplicate notification;
- SeaTalk handlers call the existing provisioner/synchronizer, which already
  uses stable local/provider item IDs and records provider failure state;
- Google Sheets uses the existing full-sync job/service, with coalescing so
  several request changes can share one pending sync intent.

The existing synchronous `sync` queue remains supported for local development:
dispatching an outbox job may execute immediately there, while database/Redis
workers provide durable asynchronous processing in staging and production.

## Data contract

`workflow_outbox` contains:

- `id`: UUID primary key;
- `idempotency_key`: unique string, derived from aggregate, event type, and
  workflow correlation/version;
- `aggregate_type` and nullable `aggregate_id`;
- `event_type`;
- `payload` JSONB/text containing only the handler input, never credentials;
- `status`;
- `attempts`, `max_attempts`, `available_at`, `processing_started_at`;
- `last_error` capped at a safe length;
- `completed_at`, `dead_lettered_at`, `created_at`, `updated_at`.

Indexes support pending work by status/time and operational lookup by
aggregate/status. The Laravel migration and Supabase migration must express
the same columns, constraints, and indexes.

The notifications table gains a nullable `outbox_id` reference with a unique
index for delivered outbox notifications. Existing notifications remain valid
during rollout; new workflow notifications always carry this reference.

## Transaction and ordering rules

1. Request state, request event, notification intent, and provider/sheet intent
   are written in one database transaction.
2. No remote provider or Sheets call occurs before commit.
3. Outbox intents include the request workflow version/correlation ID so a
   stale retry cannot overwrite a newer state.
4. Multiple equivalent provider-sync intents for one request are coalesced or
   safely superseded; the latest committed request is read when the handler
   runs.
5. A failed notification or provider call never changes canonical request
   state or audit history.

## Retry and dead-letter behavior

Handlers classify failures as retryable or terminal. Retryable failures use
bounded exponential backoff with a configured maximum attempt count. Terminal
validation/contract failures go directly to `DEAD_LETTER`. A dead-letter row
retains the last safe error and can be replayed explicitly after remediation,
creating no second logical side effect because the idempotency key remains
stable.

The implementation must provide a command or service query that reports counts
by status and the oldest pending/dead-letter rows. It must not expose provider
credentials or full HTTP payloads in logs.

## Testing requirements

Tests must prove:

- outbox rows roll back when the enclosing workflow transaction rolls back;
- successful request mutations create the expected intent types exactly once;
- after-commit dispatch does not run for rolled-back mutations;
- duplicate delivery leaves one notification and one provider/sheet logical
  result;
- transient failures reschedule with incremented attempts and terminal
  failures dead-letter;
- a stale retry cannot apply work against a newer workflow version;
- existing authorization, workflow state, audit, and response contracts remain
  unchanged.

PostgreSQL integration coverage must exercise the real JSON, unique-key,
index, claim, and retry/dead-letter behavior. SQLite unit/feature tests may
cover handler logic where PostgreSQL-specific behavior is not under test.

## Operational constraints

- Do not add Redis as a prerequisite; database queue support remains valid.
- Do not send secrets or raw provider credentials into the outbox payload.
- Keep existing provider feature flags and fail-closed behavior.
- Do not introduce caching or unbounded queue scans as part of this change.
- Docker/worker deployment changes are limited to starting the existing queue
  worker with the new outbox job path.
