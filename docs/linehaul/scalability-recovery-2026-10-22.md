# Scalability and failure recovery

Implemented locally on 2026-10-22. Staging deployment and live SeaTalk provider verification remain deferred.

| Finding | Applied fix |
| --- | --- |
| Outbox retries could remain stranded | A minute-based drainer dispatches bounded batches of due retries and abandoned processing leases. Claimed attempt and timestamp fence completion writes; claim and lease snapshot share a transaction. Exhausted attempts become dead letters, with explicit replay. |
| Identical workflow messages could suppress separate events | Notification identity includes the durable request audit-event ID, preserving replay deduplication while allowing separate edits. |
| Queue consumers could truncate or accumulate large backlogs | DOC uses the shared queue snapshot with 100-row cursor pages and Previous/Next controls. Alerts and acknowledgment also work for observed rows outside the current queue page. |
| Realtime bursts could overwhelm API limits | One scheduler coalesces channel signals, with at least five seconds between refreshes, retained dirty state on failure, and shared Retry-After cooldown. Sound is limited to once per five seconds. |
| Identical new operations could reuse an old idempotency key | Keys are unique per user operation, stable during retries, and cleared at successful completion or a new form/dialog intent. Assignment retries retain their original timestamp. |
| Staggered reconnects could lose recovery work | Recovery tracks each channel, refreshes only reconnected channels, retries failed recovery after five seconds, and disposes pending timers. |
| Notification acknowledgment could allocate unbounded receipt arrays | Role receipts are processed in 500-row database chunks, skip existing receipts, and preserve the original read timestamp. Personal notifications use scoped SQL updates. |
| Requests could hang or continue after query cancellation | API deadlines cover session lookup, fetch, and response body (30 seconds by default). Queries forward cancellation signals; transient failures get one query retry, respecting Retry-After. |

## Operations

Run Laravel's scheduler every minute (`php artisan schedule:run`) and keep queue workers running when using an asynchronous queue connection. The scheduled command is `php artisan outbox:drain --limit=100`, protected against overlapping scheduler runs. Use a shared cache for scheduler locks across instances.

The repository's asynchronous Docker profile supplies both services:

```sh
docker compose -f docker-compose.yml -f docker-compose.async.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.async.yml up --build -d
```

These are deployment-owner commands; they have not been executed as part of this local change. The profile explicitly sets the database queue reservation to 120 seconds, above the 90-second worker timeout, and the outbox processing lease to 300 seconds. Its 100-second shutdown grace lets a running job reach the worker timeout before Docker forcibly stops it. Keep worker timeout below queue reservation, and both below the outbox lease when tuning these values. API, scheduler, and workers must use the same database and cache configuration.

The backend image includes PHP `pcntl`, required for Laravel worker timeout signals. Rebuild the image to apply that extension. Container build and process-signal behavior still need verification on a Docker-capable host.

Before starting asynchronous workers, run the preflight in the rebuilt image:

```sh
docker compose -f docker-compose.yml -f docker-compose.async.yml run --rm --no-deps worker php artisan system:verify-config --production --worker-timeout=90
```

Use the actual worker `--timeout` value. This opt-in check rejects nonpositive values, unsupported queue drivers, timeout/reservation/lease conflicts, and missing `pcntl`. It checks the configured default queue connection; keep that connection aligned with the worker command. It verifies configuration and runtime extension availability, not running worker health or scheduler activity. On Windows PHP without `pcntl`, this worker check intentionally fails; run it in the Linux worker image.

The drainer bounds each scan to 100 rows by default; manual limits support 1–1000. Backoff timestamps indicate earliest eligibility: actual dispatch also depends on the one-minute scheduler cadence and worker capacity. Monitor oldest pending age, dead-letter count, worker health, and queue depth; tune capacity against measured traffic.

Inspect outbox health with the existing `php artisan outbox:status`. After correcting a terminal failure, replay a specific dead letter with `php artisan outbox:retry <id>`. Delivery remains at least once; handler idempotency remains required. Worker execution should finish within the configured processing lease timeout (300 seconds by default).

Status diagnostics now distinguish due pending work (`available_at <= now`), delayed pending retries, and stale processing leases (at or beyond the configured processing timeout). CLI and the admin-only status endpoint share one aggregate database snapshot, including the oldest due availability and processing-start timestamps. No payloads or provider error text are returned. An increasing due backlog suggests scheduler/worker capacity trouble; stale processing suggests abandoned or overlong attempts. These are observations, not proof that a specific process is healthy. The aggregate scans stored outbox history, so avoid polling it at request/realtime frequency.

The frontend API cooldown is scoped to its JavaScript runtime. Cursor pages bound each queue response; cursor history retains navigation tokens. Neither mechanism replaces server-side capacity planning or a production load test.

## Verification

- Frontend: 135 unit tests across 38 files passed; TypeScript, Biome, Oxlint, source/API checks, and production build passed.
- Browser: all 32 affected scenarios passed across the initial run and focused rerun. Two initial cold-start loading timeouts passed on rerun. Coverage includes 121-row DOC navigation, operation retry keys, sustained realtime traffic, approval, cancellation, and driver-label workflows.
- Backend: 200 non-PostgreSQL tests and 21 isolated local PostgreSQL tests; final results recorded in the task handoff.
- Independent source review found no introduced Critical or Important defects. No production scheduler, staging load, or live SeaTalk delivery verification was performed.

No schema migration is needed for these eight fixes. Existing schema/RLS deployment remains a separate deployment-owner step.
