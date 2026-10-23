# Staging Deployment Guide

This guide prepares and deploys SOC 5 Outbound to an isolated staging
environment. Staging is for release testing, not production traffic.

## Who runs what

You do **not** need Docker or administrator rights on your local Windows
workstation.

| Work | Where it happens |
|---|---|
| Edit, review, and push the approved code | Developer workstation |
| Create staging Supabase project and secrets | Supabase Dashboard / approved secret store |
| Build and run Docker Compose | Dedicated staging host or authorized CI runner |
| Test the deployed application | Browser at the staging HTTPS URL |

Ask the platform/IT owner for a dedicated staging host with Docker Engine and
Docker Compose v2, or an authorized CI runner with Docker access. Do not install
Docker Desktop or enable privileged virtualization locally when policy requires
administrator approval. If no staging host or runner is available, request
deployment support; do not use the production host or tunnel as a substitute.

## Phase 1 — Prepare an isolated staging environment

### Step 1. Create staging resources

Use resources separate from production:

- Staging hostname and HTTPS ingress, such as `staging.example.com`.
- Staging Supabase project and database credentials.
- Staging Auth settings and test accounts.
- Staging Cloudflare Tunnel or other approved ingress.
- Test-only SeaTalk app or Google Sheets spreadsheet if those integrations
  are part of the acceptance test.
- Sentry environment named `staging`, if Sentry is enabled.

Use synthetic or approved non-production data. Keep access restricted to the
release/test team.

### Step 2. Confirm the staging host

Have the platform owner confirm that the host is dedicated to staging and has
Docker Engine and Compose v2 installed. The current Compose setup binds the
frontend to `127.0.0.1:4173`; it is not configured to run beside production on
the same host. A separate host is the recommended setup.

The production launcher,
[`start-production.ps1`](../../scripts/launchers/start-production.ps1), uses
the production tunnel ID. Never use it for staging.

## Phase 2 — Prepare code, database, and configuration

### Step 3. Select a clean release

Push the reviewed changes, then have the staging host or CI runner check out
the approved commit. Deployment commands below run there, not on your local
workstation.

On a Linux staging host:

```sh
git clone <repository-url> /opt/soc5-outbound-staging
cd /opt/soc5-outbound-staging
git checkout <reviewed-branch-or-commit>
git status --short
git rev-parse HEAD
docker --version
docker compose version
```

Record the commit SHA. The checkout should be clean, and `docker compose
version` must succeed.

### Step 4. Initialize the staging Supabase database

Follow [the canonical fresh/upgrade migration procedure](production-migrations.md).
Prepare and review history here; execute its A / Laravel B / C sequence after the
release image and environment are ready in Step 8. Do not apply all Supabase SQL
before Laravel. Never run the CI auth-stub installer against staging or production.

### Step 5. Configure staging Auth

In the staging Supabase Dashboard:

1. Set the Site URL to `https://<staging-host>`.
2. Add only the staging URLs needed by the enabled sign-in providers.
3. Configure email OTP, SMTP, and Google OAuth for staging. Follow
   [`supabase-auth-setup.md`](../docs/supabase-auth-setup.md) where
   applicable.
4. Create designated test users and verify each has the expected application
   profile and role.
5. Use synthetic test data, not production user or request data.

If testing SeaTalk login, configure a test app and register
`https://<staging-host>/auth/seatalk/callback`. Keep SeaTalk Approval Center
disabled until its test app, permissions, signing secret, callback URLs, and
employee mappings are confirmed.

### Step 6. Create the backend environment file

On the staging host, create `backend/.env` from the example and populate it
using the approved secret store:

```sh
cp backend/.env.example backend/.env
```

Set at least the following values. Replace every placeholder with a staging
value:

```dotenv
APP_NAME="SOC 5 Outbound API"
APP_ENV=staging
APP_KEY=<unique stable staging key>
APP_DEBUG=false
APP_URL=https://<staging-host>
FRONTEND_URL=https://<staging-host>
LOG_CHANNEL=stack

DB_CONNECTION=pgsql
DB_HOST=<staging database host>
DB_PORT=<staging database port>
DB_DATABASE=postgres
DB_USERNAME=<staging database user>
DB_PASSWORD=<staging database password>
DB_SSLMODE=require

SUPABASE_URL=https://<staging-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<staging publishable key>
SUPABASE_SERVICE_ROLE_KEY=<staging service-role key>
ADMIN_EMAILS=<staging admin email addresses>

SEATALK_REDIRECT_URI=https://<staging-host>/auth/seatalk/callback
SEATALK_APPROVAL_ENABLED=false
GOOGLE_SHEETS_SYNC_ENABLED=false
SENTRY_ENVIRONMENT=staging
```

Generate a unique Laravel key once and store it in protected staging
configuration. Do not reuse the production key or regenerate it each release.
If you have local PHP configured, you can generate a key without Docker:

```powershell
$env:PHPRC = (Resolve-Path .\tools\php.local.ini).Path
Set-Location backend
php artisan key:generate --show
```

Treat the output as a secret. Do not paste it into chat, tickets, shell logs,
or source control.

The example file enables Google Sheets sync; turn it off unless a dedicated
test spreadsheet and staging credentials are configured. Keep
`SEATALK_APPROVAL_ENABLED=false` unless the full staging integration is ready.
Never place the service-role key, database password, or Laravel key in frontend
variables or Docker build arguments.

## Phase 3 — Validate and deploy

### Step 7. Validate and build on the staging host

From the repository root on the staging host:

```sh
git status --short
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml config --quiet
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml build
```

Stop if the checkout is dirty, Compose validation fails, or the build fails.
The Compose file declares the Redis data volume at the top level. Compose
receives `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the specified env
file for the frontend build. Those values are public browser configuration;
do not pass server secrets to the frontend.

### Step 8. Apply Laravel migrations and verify configuration

Execute the reviewed [A / Laravel B / C plan](production-migrations.md) on the
explicit staging target. Review existing migration history and a recoverable
snapshot first. This replaces the former Supabase-then-Laravel instructions.

Then run the staging deployment checks:

```sh
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml run --rm api php artisan system:verify-config --staging
```

The configuration check requires `APP_ENV=staging`, `APP_DEBUG=false`, an
HTTPS `APP_URL`, TLS for PostgreSQL, required settings, and the `user_events`
and `idempotency_keys` tables. It connects to the database. Stop and resolve
any errors before proceeding.

### Step 9. Start the staging stack

```sh
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml up --build -d
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml ps
```

The API and scheduler use `backend/.env`. The web container serves the built
frontend and proxies `/api` and `/up` to Laravel. Laravel port 8000 and Redis
port 6379 should not be exposed publicly.

Check health and logs:

```sh
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml logs --tail 200 api
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml logs --tail 200 scheduler
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml logs --tail 200 web
curl --fail http://127.0.0.1:4173/
curl --fail http://127.0.0.1:4173/up
```

Investigate unhealthy or restarting containers before connecting ingress.
The frontend response must be the built app, not a Vite development server.

### Step 10. Connect staging HTTPS ingress

Have the platform owner route the staging hostname through the dedicated
staging tunnel or approved ingress to `http://127.0.0.1:4173`. Configure DNS
and TLS independently from production. Do not expose ports 8000 or 6379, route
the production hostname to staging, or use the production tunnel.

Open `https://<staging-host>` and verify the certificate. The browser should
send API requests to the same origin under `/api`.

## Phase 4 — Test and hand off

### Step 11. Run acceptance checks

Using staging test accounts and data:

1. Confirm the containers are running and the API health check passes.
2. Load the HTTPS site; check for failed assets, console errors, and API
   failures.
3. Sign in, verify the expected test identity and role, and sign out.
4. Test representative request creation, review/approval, status changes, and
   audit history for the release.
5. Test realtime behavior if included in the release acceptance scope.
6. Check scheduler and queue logs. The baseline queue is synchronous; a
   database queue requires its support migrations and a worker.
7. Confirm Sentry reports `staging`, if enabled.
8. Confirm enabled integrations use staging-only destinations.
9. Repeat a basic unauthenticated check.

Record the commit SHA, test results, and any issues. Do not record tokens or
secrets.

### Step 12. Hand off or stop

Share the staging URL and release/test summary with the authorized reviewers.
Restrict access to the environment and monitor `/up`, container restarts,
application logs, scheduler failures, and Supabase errors.

To stop staging without removing its stored volumes:

```sh
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.async.yml down
```

Do not use `docker compose down --volumes` for routine cleanup; it deletes
named volumes.

## Future releases and rollback

For each release, check out the approved clean commit, review Supabase SQL and
Laravel migrations separately, take a staging snapshot before schema changes,
then repeat Steps 7–11.

If a release fails, capture relevant logs without secrets, redeploy the
previous approved application commit, and rerun health and acceptance checks.
Application rollback does not reverse database migrations. Review migration
rollback safety separately and restore a snapshot only when approved.

## Completion checklist

- [ ] Approved clean commit and SHA recorded.
- [ ] Dedicated staging host or authorized CI runner used; no local Docker required.
- [ ] Staging Supabase project, credentials, Auth users, and ingress are isolated.
- [ ] Required Supabase SQL migrations applied in an approved order.
- [ ] Backend has `APP_ENV=staging`, `APP_DEBUG=false`, HTTPS `APP_URL`, and DB TLS.
- [ ] Laravel migrations and `system:verify-config --staging` pass.
- [ ] Frontend built with staging URL and publishable key only.
- [ ] Compose services and `/up` are healthy; internal ports are not public.
- [ ] HTTPS login, API, roles, and release acceptance checks pass.
- [ ] Rollback commit and database recovery path are known.
- [ ] Production hostname, data, credentials, and tunnel remain untouched.
