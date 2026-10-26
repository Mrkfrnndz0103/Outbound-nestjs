# SOC 5 Outbound

SOC 5 Outbound is a role-aware outbound logistics portal for Shopee Sorting Facility Dispatch. It supports authenticated operations, truck requests, assignment, docking confirmation, realtime updates, Google Sheets user imports, durable workflow events, and auditable history.

## Technology

- NestJS API and workers on Node.js 22
- Next.js 16, React 19, and TypeScript
- TanStack Query for server state
- Supabase PostgreSQL, Auth, and Realtime
- Google Sheets service-account sync worker
- Supabase Edge Functions for cluster and intraday feeds
- Docker and AWS ECS deployment

The active application is the NestJS/Next.js migration. The former Laravel/Vite implementation is retained only in historical documentation and should not be used as the production entrypoint.

## Project structure

```text
backend-nest/             NestJS API, outbox worker, and Google Sheets worker
frontend/                 Next.js application
supabase/migrations/      PostgreSQL schema and RLS policies
supabase/functions/      sync-clusters and sync-intraday Edge Functions
docs/                     Product, architecture, deployment, and operations docs
scripts/                  CI, deployment, and operational scripts
docker-compose.yml        Local service composition
```

## Local development

Required tools: Node.js 22+, npm, Docker, and Supabase project credentials.

1. Configure `backend-nest/.env` and `frontend/.env.local` from the example files.
2. Install dependencies:

   ```powershell
   cd backend-nest
   npm ci
   cd ..\frontend
   npm ci
   ```

3. Start the local stack:

   ```powershell
   cd ..
   docker compose up --build
   ```

The Next frontend is served on `http://localhost:3000`. The Nest API is served on
`http://localhost:3001`; browser `/api/*` requests are rewritten to the API.

For frontend-only development:

```powershell
cd frontend
npm run dev
```

## Environment configuration

Frontend variables:

```env
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_SENTRY_DSN=<optional>
```

Backend variables include `DATABASE_URL`, Supabase server credentials, CORS and app URLs, SeaTalk credentials, and worker configuration. For Google Sheets user imports:

```env
GOOGLE_USER_IMPORTS_SYNC_ENABLED=true
GOOGLE_USER_IMPORTS_SPREADSHEET_ID=<spreadsheet-id>
GOOGLE_USER_IMPORTS_SHEET_NAME=user
GOOGLE_USER_IMPORTS_MAX_ROWS=5000
GOOGLE_USER_IMPORTS_SYNC_INTERVAL_MS=900000
GOOGLE_SHEETS_CREDENTIALS_PATH=/run/secrets/google-sheets-credentials.json
# or GOOGLE_SHEETS_CREDENTIALS_JSON=<service-account-json>
```

Grant the Google service account Viewer access to the spreadsheet. Never expose
`SUPABASE_SERVICE_ROLE_KEY`, database credentials, SeaTalk secrets, or Google
service-account credentials to the browser or source control.

## Workers and integrations

The Nest process can run the following workers when enabled:

- Google Sheets user-import sync: initial sync on boot, then scheduled sync; safely upserts `user_imports` and deactivates missing rows.
- Durable outbox worker: processes workflow events and retries failures.
- Scheduler/presence workers: run according to the configured deployment task definition.

The Supabase Edge Functions remain separate deployments:

- `sync-clusters` receives signed cluster feed requests.
- `sync-intraday` receives signed intraday feed requests.

Deploy them with the Supabase CLI and configure their shared `SYNC_SECRET`:

```powershell
supabase functions deploy sync-clusters
supabase functions deploy sync-intraday
supabase secrets set SYNC_SECRET="<long-random-secret>"
```

See [Google Sheets sync](docs/deployment/user-imports-sheet-sync.md) and
[Intraday sync setup](docs/docs/intraday-sync-setup.md) for operational details.

## Validation

Run the frontend checks:

```powershell
cd frontend
npm run build
npm test
npm run lint
```

Run the Nest checks:

```powershell
cd backend-nest
npm run build
npm test
npm run lint
```

Validate deployment configuration from the repository root:

```powershell
bash -n scripts/deploy/deploy-aws-ecs.sh scripts/ci/verify-release-static.sh
```

## Production deployment

Production releases are driven by tagged Travis CI builds when
`PRODUCTION_DEPLOY_ENABLED=true`. The pipeline builds the Nest image from
`backend-nest/Dockerfile`, pushes it to ECR, and updates the ECS API, worker, and
scheduler services.

Required production setup:

1. Configure AWS account, ECR, ECS cluster, service, and task-definition variables.
2. Confirm ECS task definitions use container names `api`, `worker`, and `scheduler`, or set the corresponding `ECS_*_CONTAINER_NAME` variables.
3. Apply Supabase migrations and deploy both Edge Functions.
4. Configure production environment variables and worker credentials.
5. Back up the database and verify the previous ECS task definition is available for rollback.
6. After deployment, check `/health/ready`, login, API requests, Google Sheets sync, outbox processing, and Edge Function requests.

The current release pipeline does not require a staging acceptance job. Production
rollout therefore requires explicit operator verification of the checks above.

## Documentation

- [Setup guide](docs/docs/setup-guide.md)
- [System design](docs/architecture/system-design.md)
- [System blueprint](docs/docs/system-blueprint.md)
- [Google Sheets sync](docs/deployment/user-imports-sheet-sync.md)
- [Intraday sync setup](docs/docs/intraday-sync-setup.md)
- [AWS ECS deployment](docs/deployment/aws-console-setup-simplified.md)
