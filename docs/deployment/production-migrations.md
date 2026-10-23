# Production and staging migration procedure

This is the canonical procedure for a real Supabase target, both fresh and upgrade.
The database owner executes it during an approved maintenance window. The CI
`apply-postgres-migration-chain.sh` uses synthetic auth stubs and must never run
against a real Supabase project. The old `run-staging-migrations.sh` is retired.
Do not use a directory sort, numeric offsets, `migrate:fresh`, or an indiscriminate
`supabase db push`: legacy numeric prefixes are duplicated.

## Prepare and review history

1. Pin the reviewed release SHA and build the release image. Stop ingress writes,
   scheduler and workers before schema work; ensure no old worker can claim jobs.
   Record the exact project reference, database host, port, database and user from
   the approved secret store. Obtain a tested recoverable backup, schema dump,
   Supabase migration history and Laravel `migrations` rows. Keep these artifacts
   protected; they may include sensitive schema or configuration details.
2. For a **fresh** real Supabase project, verify its managed `auth` schema/functions
   and roles exist and its application tables are absent. Never install CI auth
   stubs. Use an empty applied list only after documenting this inspection.
3. For an **upgrade**, reconcile each full SQL filename to actual history and
   schema effects, including Laravel history. Old duplicate prefixes cannot prove
   a filename was applied. Resolve missing/changed/partial migrations with the DBA;
   do not mark them applied, replay them, or skip by position to bypass an error.
   Existing sessions tables must have the expected Laravel columns and UUID user
   identifiers; reconcile incompatible legacy tables before the session migration.
4. Create a protected reviewed-history JSON file outside source control:

   ```json
   {
     "target": "reviewed-project-ref/database",
     "mode": "upgrade",
     "reviewedBy": "database owner and review reference",
     "schemaEvidence": "protected schema/history inspection reference",
     "backupReference": "verified restore artifact reference",
     "applied": [{"file": "001_initial_schema.sql", "sha256": "64-character reviewed file hash"}]
   }
   ```

   `applied` must contain every confirmed applied Supabase SQL filename and its
   SHA-256 at execution, as an exact manifest prefix. This is a review record,
   not automatic history adoption. A fresh record uses `mode: fresh, applied: []`.
   Compute hashes with `sha256sum supabase/migrations/<filename>` and compare them
   against original release artifacts, not merely today's files. The tool rejects
   gaps, unknown filenames, duplicates, changed hashes and missing review evidence.
   Non-prefix history requires a separate owner-reviewed reconciliation before
   this procedure; never fabricate entries just to make the planner pass.

   ```sh
   node scripts/ci/validate-migration-manifest.mjs
   node scripts/plan-production-migrations.mjs /protected/reviewed-history.json reviewed-project-ref/database
   ```

   Save and independently review the resulting plan against the target. This is
   offline planning only; the tool neither connects nor applies or repairs history.

## Execute A, then Laravel B, then C

Use a TLS direct/session-pool database connection for migrations. Supply credentials
through the approved secret mechanism (`PG*` or a protected service/password file),
never command-line passwords. Before **each** execution session verify the explicit
connection with `psql -X -v ON_ERROR_STOP=1 -c 'select current_database(), current_user, inet_server_addr(), inet_server_port();'`.
Confirm it matches the reviewed target and the backend's resolved `DB_*` settings;
stop on any difference. Clear stale Laravel config cache before inspecting settings.
Do not output passwords or complete environment/config dumps.

- **A:** Apply only the pending phase A filenames in the generated plan, in manifest
  order, through and including `20261013060000_workflow_outbox.sql`. For each reviewed
  file run `psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/<exact-filename>`.
  Stop at the first failure. Record successful full filename, SHA-256, target,
  release SHA, execution timestamp and outcome in the protected deployment ledger.
- **B:** On the same database, review `php artisan migrate:status` in the release
  image, then run `php artisan migrate --force`. Laravel creates/alters backend
  support tables and records its own history. It must finish before phase C's
  reconciliation. A fresh database may have no Laravel migration repository;
  `migrate --force` creates it. Never delete existing migration history.
- **C:** Apply only pending phase C filenames in their listed order with the same
  `psql` command, recording each success. This includes production reconciliation
  and the intraday all-active-role read policy. C is not a substitute for B.

Some historical SQL can have partial effects before a failure. Do not rerun or
mark a failed file applied automatically. Keep writes stopped, inspect its actual
schema effects and restore or obtain an owner-reviewed forward recovery plan.
After each completed release retain the updated ledger and Laravel history as the
next upgrade's input; reconcile these with Supabase-managed history rather than
blindly using migration repair to manufacture agreement.

## Shared sessions, cache, workers and acceptance

Production uses `docker-compose.yml` **plus** `docker-compose.async.yml`. The overlay
selects PostgreSQL database sessions and shared database cache/locks on `pgsql` for
API, scheduler and worker, plus the database queue. Laravel's forward
`2026_10_23_000001_create_shared_sessions_table` creates sessions if absent and
hardens RLS/grants even when the table already exists. Cache, queue and session
tables must deny `PUBLIC`, `anon`, `authenticated`; Laravel uses the intended
privileged server database role, never a browser role. Verify this in the actual
release database. Sessions must not be added to browser realtime publications.

All replicas must use the same stable `APP_KEY`, session cookie/domain/lifetime,
database and cache prefix; keep `SESSION_SECURE_COOKIE=true` behind HTTPS. Replacing
a file-session deployment logs existing users out once: file sessions are not
copied automatically. Database sessions survive subsequent API recreation. Do not
regenerate APP_KEY or drop sessions/cache tables during ordinary rollback.

Run these on the release host after schema verification, using the same reviewed
image/environment and both Compose files:

```sh
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml config --quiet
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml run --rm api php artisan system:verify-config --production --worker-timeout=90 --require-seatalk
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml up -d --force-recreate api scheduler worker web
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml ps
```

Staging uses `--staging` instead of `--production`; include `--require-seatalk` when
accepting the required SeaTalk integration. Explicitly inspect resolved store names
and connectivity before restoring traffic. The base Compose profile alone is not
the selected production profile. Scheduler (`schedule:work`) must run once; worker
(`queue:work database`) must run and use timeout 90 < queue retry_after 120; outbox
processing recovery timeout is 300. Recreate every long-running worker/scheduler
on code/config changes. Allow the 100-second worker grace period before shutdown;
a killed job must be safely reclaimed after its lease, not manually duplicated.

In an isolated release fixture, verify all four active roles can read intended
intraday dashboard rows, backend support/session tables remain inaccessible to
browser roles, login and CSRF succeed, and recreating API retains the same session.
Check logout invalidates it across replicas, shared cache invalidation/locks are
visible across API/scheduler/worker, and an interrupted worker recovers without
duplicate provider effect. Test with synthetic users and a test provider only.
These live/profile checks are release gates, not claims made by offline tests.

Rollback: stop new writes and all workers first. Prefer a reviewed compatible
previous image with forward schema retained. Never run broad migration rollback
or drop sessions to undo application code. If schema is incompatible or a migration
partially failed, use the rehearsed backup/restore or DBA forward repair plan,
including reconciliation of outbox/provider effects since the backup. Revalidate
schema, RLS, config, sessions and queues before reopening traffic. Record the
recovery point and operational data loss window.

Documentation checked 2026-10-23: Supabase changelog and current database migration /
Data API security guides; no relevant migration/RLS breaking change found. The
announced November HTTP TLS cipher removal requires release-host TLS acceptance,
not a change to these schema statements.
