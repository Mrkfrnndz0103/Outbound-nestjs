# k6 load testing

This repository uses k6 to measure the local or staging frontend and Laravel API without changing application data. k6 is already installed for this project (`k6.exe v2.3.0`).

## Prerequisites

- Start the frontend and Laravel backend. The normal local URLs are `http://localhost:5173` and `http://127.0.0.1:8000`.
- Confirm the services first:

```powershell
Invoke-WebRequest http://localhost:5173/
Invoke-WebRequest http://127.0.0.1:8000/up
```

- Keep the test target local or staging. The scripts refuse production-looking URLs unless `-AllowProduction` is explicitly supplied.
- For protected API tests, use a reusable bearer token or a dedicated non-production Backroom account.

## How the tests work

`smoke.js` runs one user once. It checks the frontend, Laravel health endpoint, public authentication configuration, and, when authentication is supplied, `/auth/me`, `/requests`, and `/requests/summary`.

`load.js` gradually ramps through 10, 25, 50, 100, 200, and 300 VUs. Each VU pauses between browser/API-style actions. It performs only GET requests and does not create, update, approve, reject, assign, or delete requests.

`api-load.js` runs a constant-arrival, read-only API workload. It rotates through authentication status, the paginated requests list, the bounded role-scoped request queue, the combined dashboard summary, intraday dispatch, notifications, and cluster lookup. It requires authentication because these Laravel routes are protected by `supabase.auth`.

The tests never automate Google OAuth, SeaTalk OAuth, or Supabase OTP. If Backroom credentials are supplied, k6 performs exactly one login in `setup()` and reuses the returned access token for the run.

## What k6 does not replace

k6 is now the repository's load/performance test tool, but it does not replace the other testing layers:

- Vitest checks React utilities and components in isolation.
- PHPUnit checks Laravel behavior, authorization, database interactions, and integrations.
- Playwright checks real browser rendering and user workflows.
- Deno checks Supabase Edge Functions.

Those suites remain because converting them to k6 would remove coverage rather than consolidate equivalent tests. The unused Playwright starter demos that targeted `playwright.dev` were removed; application-specific browser tests remain under `frontend/e2e/`.

## Environment variables

The defaults are safe local targets:

```powershell
$env:K6_BASE_URL = 'http://localhost:5173'
$env:K6_BACKEND_BASE_URL = 'http://127.0.0.1:8000'
$env:K6_API_BASE_URL = 'http://127.0.0.1:8000/api/v1'
```

Use one of these authentication options for protected API tests. Do not put secrets in scripts or commit them:

```powershell
$env:K6_AUTH_TOKEN = $env:MY_NON_PRODUCTION_K6_TOKEN
```

or:

```powershell
$env:K6_BACKROOM_OPS_ID = $env:MY_NON_PRODUCTION_OPS_ID
$env:K6_BACKROOM_PASSWORD = $env:MY_NON_PRODUCTION_OPS_PASSWORD
```

Optional API workload controls are `K6_API_RATE` (default 5 requests/second), `K6_API_DURATION` (default `2m`), `K6_API_PREALLOCATED_VUS` (default 10), `K6_API_MAX_VUS` (default 100), and `K6_CLUSTER_SEARCH` (default `hub`).

## Run smoke testing

From the repository root:

```powershell
.\tests\load\Invoke-K6Smoke.ps1
```

Direct invocation is also possible:

```powershell
k6 run .\tests\load\smoke.js
```

## Run the staged load test

By default, the staged scenario progresses through all six requested levels and then ramps down:

```powershell
.\tests\load\Invoke-K6Load.ps1 -Users 10
```

The `-Users` value caps the staged scenario at that level, always ramping from 10 users. The default `load.js` scenario reaches 10, 25, 50, 100, 200, and 300 users in order. Run each requested level with:

```powershell
.\tests\load\Invoke-K6Load.ps1 -Users 10
.\tests\load\Invoke-K6Load.ps1 -Users 50
.\tests\load\Invoke-K6Load.ps1 -Users 100
.\tests\load\Invoke-K6Load.ps1 -Users 200
.\tests\load\Invoke-K6Load.ps1 -Users 300
```

For a short verification run, use a small stage duration before any longer test:

```powershell
$env:K6_STAGE_DURATION = '2s'
.\tests\load\Invoke-K6Load.ps1 -Users 10
Remove-Item Env:K6_STAGE_DURATION
```

For the read-only API workload:

```powershell
.\tests\load\Invoke-K6Load.ps1 -ApiOnly
```

Run a small API trial before increasing the rate:

```powershell
$env:K6_API_RATE = '1'
$env:K6_API_DURATION = '20s'
.\tests\load\Invoke-K6Load.ps1 -ApiOnly
```

## Interpreting k6 results

- `http_reqs` is the total request count; divide by test duration for approximate requests per second.
- `http_req_duration` is overall request latency. The suite requires p95 under 1 second and p99 under 2 seconds.
- `endpoint_duration` breaks latency down by the route tag, which helps identify slow Laravel endpoints.
- `http_req_failed` and `endpoint_failures` show failed request rates. `checks` shows whether status/body assertions passed.
- A rising p95/p99 with increasing VUs suggests saturation, slow database queries, Supabase dependency latency, or exhausted PHP/NGINX workers. Compare endpoint tags and Laravel/database logs before changing application code.

## Finding failures

Look for the first endpoint whose status check fails, then inspect its tagged latency and response status. Common causes are a service not running, a missing bearer token, a token for the wrong environment, route authorization (403), throttling (429), or a backend dependency failure (5xx). For authenticated failures, stop the test, verify the token belongs to the same target environment, and do not retry login repeatedly.

## Safety precautions

- Prefer local or staging and use a dedicated test account/token.
- Never run the 300-VU scenario against production without explicit capacity approval, an agreed test window, monitoring, and a rollback/stop plan.
- Do not supply Google, SeaTalk, or Supabase OTP credentials. These tests intentionally do not drive those providers.
- Do not add POST/PUT/PATCH/DELETE requests unless a separate safe test-data operation is designed and approved.
- Start with smoke, then a 1 request/second API trial, then increase gradually.
- Watch Laravel logs, NGINX/PHP worker utilization, database connection counts/slow queries, Supabase quotas, and error monitoring while the test runs.
- Stop with `Ctrl+C` if error rate, latency, database load, or authentication-provider traffic becomes unsafe.
