# SOC 5 Outbound

SOC 5 Outbound is a lightweight, role-aware truck request portal for Shopee
Sorting Facility Dispatch. It replaces the Google Sheets workflow with controlled
request approvals, truck assignment, docking confirmation, realtime updates, and
an auditable event history.

## Technology

- Laravel 12 modular-monolith API on PHP 8.4
- React 19, TypeScript, and Vite
- TanStack Query for server state
- Zustand for client UI state
- Sass for styling
- Supabase PostgreSQL, Auth, and Realtime
- NGINX and Docker for deployment

The MVP intentionally avoids microservices, Redis, Pinecone, and dedicated load
balancers. These should only be introduced after production measurements establish
a concrete need. The rationale is documented in [System Design](docs/architecture/system-design.md).

## Project structure

```text
backend/                 Laravel API
frontend/                React/Vite application
supabase/migrations/     PostgreSQL schema and RLS policies
docs/                    Product and architecture documents
tools/php.ini            Base PHP configuration template
scripts/launchers/       Backend setup and development launchers
```

## Quick start on this Windows machine

No administrator access is required. The setup script generates the
machine-local PHP configuration in `tools/php.local.ini` from the tracked
`tools/php.ini` template; launchers use the generated file automatically.

Before starting, ensure `php`, `composer`, `npm`, and `cloudflared` are
available on `PATH`. Authenticate `cloudflared` once if needed:

```powershell
cloudflared tunnel login
```

1. Configure `backend/.env` and `frontend/.env` as described in the
   [Setup Guide](docs/setup-guide.md).
2. Initialize the backend and local machine prerequisites:

   ```powershell
   .\scripts\bootstrap-machine.ps1
   .\scripts\launchers\setup-backend.ps1
   ```

3. Start the complete development stack from the repository root:

   ```powershell
   .\scripts\launchers\start-dev.ps1
   ```

   This starts the Laravel backend, Vite frontend, and Cloudflare tunnel in
   managed jobs. The Cloudflare launcher obtains a token for the configured
   tunnel at startup and passes it through `TUNNEL_TOKEN`; it does not use a
   `config.yml` file.

   Wait for `ALL SERVICES RUNNING`. Keep this terminal open; press `Ctrl+C` to
   stop all three services together.

4. Open `http://localhost:5173`, or the Cloudflare hostname when the tunnel is
   running.

## Staging and production deployment

For the full staging provisioning, environment, migration, rollout, smoke-test,
and rollback procedure, see the
[Staging Deployment Setup Guide](docs/deployment/staging-deployment.md).

Before any staging or production rollout, verify the deployment profile:

```powershell
cd backend
php artisan system:verify-config --staging
# or
php artisan system:verify-config --production
```

The public `soc5outboundops.app` tunnel must use the production Docker web
container, not the local Vite server. Deploy the stack with:

```powershell
docker compose up --build -d
```

The frontend image runs `npm ci`, `npm run build`, and then serves the resulting
`frontend/dist` files from NGINX. The named-tunnel helper is available for a
host-managed tunnel:

```powershell
.\scripts\launchers\start-production.ps1
```

The production origin is `127.0.0.1:5173` so the existing named tunnel route
does not need to change. SPA routes fall back to `index.html`, and `/api` is
proxied to Laravel by the frontend NGINX configuration.

Laravel runs on `http://127.0.0.1:8000`; Vite proxies browser `/api` requests to
that address. To validate the local services from another PowerShell window:

```powershell
Test-NetConnection 127.0.0.1 -Port 8000
Test-NetConnection 127.0.0.1 -Port 5173
```

Both checks should report `TcpTestSucceeded: True`.

## Supabase initialization

Run [001_initial_schema.sql](supabase/migrations/001_initial_schema.sql) once in
the Supabase SQL Editor. Then create Auth users and matching `public.profiles`
rows. The profile UUID must equal the corresponding `auth.users.id`.

The publishable key may be used in the browser. Never put the service-role key in
`frontend/.env`, source control, screenshots, or client-side code.

## Validation

Run the repository preflight checks from PowerShell:

```powershell
.\scripts\preflight.ps1
```

```powershell
# Backend
$env:PHPRC = (Resolve-Path .\tools\php.local.ini).Path
cd backend
php artisan test
.\vendor\bin\pint --test

# Frontend
cd ..\frontend
npm run build
```

## Documentation

- [Setup Guide](docs/docs/setup-guide.md)
- [Supabase Auth Setup](docs/docs/supabase-auth-setup.md)
- [Outbound Data Import](docs/outbound/IMPORT.md)
- [Product Requirements](docs/docs/prd.md)
- [System Design](docs/architecture/system-design.md)
- [System Blueprint](docs/docs/system-blueprint.md)

## Cloudflare tunnel

See [Tunnel Setup](docs/docs/tunnel-setup.md) for the token and local tunnel
commands.


#tunnel
cloudflared tunnel token <TUNNEL-ID>
cloudflared tunnel run --token <TOKEN>

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force .\node_modules
Remove-Item -Recurse -Force .\Frontend\node_modules
npm ci
php artisan optimize:clear
netstat -ano | findstr ":3000 :5173 :4173 :8080"

cd frontend
npm run build
npm run preview -- --host 127.0.0.1 --port 5173 --strictPort .

cd /path/to/soc-5-outbound
git pull --ff-only origin staging
docker compose --env-file backend/.env up -d --build
docker compose --env-file backend/.env ps
