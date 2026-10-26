# Production deployment setup: AWS backend + Firebase Hosting

This guide prepares SOC 5 Outbound for a production deployment with the API
and background processes on AWS, the static React frontend on Firebase Hosting,
and the existing Supabase services retained. It is a setup plan, not evidence
that production resources, migrations, or provider integrations have been
deployed or verified.

## Recommended architecture

```text
Users
  |
  +-- https://app.example.com  Firebase Hosting (React static build)
  |                              |
  |                              +-- HTTPS API requests
  |                                      |
  +-- https://api.example.com  AWS Application Load Balancer
                                  |
                             ECS Fargate
                             +-- API service (Laravel)
                             +-- Worker service (Laravel queue:work)
                             +-- Scheduler service (schedule:work)
                                  |
                 +----------------+------------------+
                 |                                   |
          Supabase production                 AWS Secrets Manager
          PostgreSQL/Auth/Realtime             CloudWatch / Sentry
```

Use custom HTTPS hostnames on the same registrable domain (`app.example.com`
and `api.example.com`). Firebase's default `*.web.app` hostname and an
unrelated API hostname are cross-site and are unsuitable for the current
SeaTalk session-cookie flow.

### Required frontend/API integration work

The current production Docker setup serves the frontend and proxies `/api` to
Laravel on one origin. Firebase Hosting does not provide that generic proxy to
an AWS load balancer. Before using Firebase Hosting, make a reviewed frontend
change to:

- configure the API base URL as `https://api.example.com/api/v1`;
- use `credentials: "include"` for API calls and the SeaTalk config request;
- call SeaTalk login config and logout through the configured API base instead
  of hardcoded same-origin paths; and
- keep the API origin fixed to the production value at build time.

Then configure Laravel CORS for the exact Firebase custom origin, with
credentials enabled, and allow the `X-XSRF-TOKEN` request header. Configure
secure session cookies for the shared parent domain so the frontend can use
the SeaTalk session and XSRF cookie.
Suggested production values are `FRONTEND_URL=https://app.example.com`,
`APP_URL=https://api.example.com`, `SESSION_DOMAIN=.example.com`,
`SESSION_SECURE_COOKIE=true`, and `SESSION_SAME_SITE=lax`. Verify login,
logout, CSRF protection, cookie scope, and CORS in staging before production.
Do not use wildcard CORS origins with credentialed requests.

An alternative is to put a same-origin reverse proxy in front of Firebase and
AWS and route API, health, and SeaTalk callback paths to AWS. This requires
additional proxy and DNS configuration; it is not provided by this repository.

## Services to provision

| Service | Responsibility | Required? |
| --- | --- | --- |
| Firebase Hosting | React production build and custom domain/TLS | Yes |
| AWS ECR | Private Docker image registry | Yes for the recommended ECS deployment |
| AWS ECS Fargate | Laravel API, queue worker, scheduler | Yes |
| AWS Application Load Balancer | Public HTTPS ingress to API tasks | Yes |
| AWS ACM | TLS certificate for `api.example.com` | Yes |
| AWS Secrets Manager | Laravel, database, Supabase, SeaTalk, and monitoring secrets | Yes |
| AWS CloudWatch Logs/Alarms | Container logs, task health, ALB errors/latency, alarms | Yes |
| Supabase production project | PostgreSQL, Auth, Realtime, project API | Yes; this app depends on it |
| DNS/domain management | Firebase and API hostnames, verification records | Yes |
| Sentry | Application error reporting (and frontend DSN if enabled) | Recommended |
| Travis CI | Existing CI validation; current pipeline does not deploy | Existing, optional to retain |
| Google Sheets | Request export and/or user imports | Optional; keep disabled unless configured |
| SeaTalk Open Platform | Login and Approval Center provider APIs | Optional; login and approvals have separate settings |
| Redis/ElastiCache | Cache/queue/session backend if deliberately selected | Optional; current async profile uses PostgreSQL-backed queue/cache/session |

The repository's `docker-compose.yml` is a single-origin Compose deployment,
not an ECS task definition. Build the existing `backend-nest/Dockerfile` for ECS,
then add reviewed ECS task definitions and release automation. Do not deploy
the compose `web` service to Firebase.

## AWS account setup

Use the Singapore AWS region (`ap-southeast-1`) unless the production owner
chooses another region. Keep AWS and Supabase close together to reduce database
latency. Use separate AWS accounts or at least isolated resource names and
secrets for staging and production.

Create:

1. A VPC with public subnets for the ALB and private subnets for ECS tasks.
2. An ALB security group that accepts HTTPS only; ECS task security groups
   accept API traffic only from the ALB. Do not give ECS tasks public IPs.
3. A NAT gateway or approved egress route so private tasks can reach Supabase,
   SeaTalk, Sentry, and other required HTTPS APIs.
4. An ECR repository for the API image, with image scanning and lifecycle
   retention enabled.
5. An ECS cluster using Fargate, with separate task definitions/services for
   API, worker, and scheduler. Start with one task each, then set API minimum
   healthy capacity and autoscaling based on measured load. Run exactly one
   scheduler task unless scheduler locking has been intentionally configured.
6. An ALB target group and `/up` health check for API tasks. Terminate TLS at
   the ALB using an ACM certificate for `api.example.com`.
7. Task execution and task roles. The execution role pulls ECR images and
   writes logs; the task role reads only the required Secrets Manager entries.
8. Secrets Manager entries for the production Laravel environment. Restrict
   secret read access to the ECS task role and deployment operators.
9. CloudWatch log groups, retention, alarms for unhealthy targets, task
   restarts, elevated 5xx, queue backlog, and scheduler/worker failures.
10. AWS Budgets and billing alerts before enabling NAT gateways, ALB, Fargate,
    or other billable services.

Restrict database network access using TLS and a dedicated production Supabase
database credential. If Supabase network restrictions are enabled, account for
the AWS egress IP/NAT design before turning them on.

## Firebase Hosting setup

1. Create or select the production Firebase project and enable Hosting.
2. Add `app.example.com` as a custom domain and publish Firebase's DNS
   verification and hosting records with the DNS owner.
3. Keep Supabase's production Auth Site URL and allowed redirect URLs aligned
   with `https://app.example.com` and the enabled identity providers.
   Configure production SMTP/email delivery if email OTP is enabled.
4. Configure Firebase build-time variables. Only browser-safe values belong in
   frontend build variables:

   ```dotenv
   VITE_API_URL=https://api.example.com/api/v1
   VITE_SUPABASE_URL=https://<production-project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<production-publishable-key>
   VITE_SENTRY_DSN=<public-frontend-dsn-or-empty>
   VITE_SENTRY_ENVIRONMENT=production
   ```

   Never add the database password, Supabase service-role key, Laravel
   `APP_KEY`, SeaTalk app secret, callback signing secret, or AWS credentials to
   Firebase build variables.
5. Deploy only the reviewed frontend build. Add SPA fallback routing to
   `index.html`; ensure Firebase does not rewrite `/api` to the static app if
   the separate API hostname is used.
6. Set Firebase preview channels or a separate Firebase staging project for
   staging. Do not use production Auth or API variables in previews.

## Backend image and ECS processes

Build the backend image from the approved source commit, tag it with the full
commit SHA, scan it, and push it to ECR. Do not deploy mutable `latest` tags.
Configure the ECS service to run the image with distinct commands:

- API: the image's normal command, listening on port 8000 behind the ALB.
- Worker: `php artisan queue:work database --sleep=3 --tries=3 --backoff=5 --timeout=90`.
- Scheduler: `php artisan schedule:work`.

Use the async deployment profile equivalent to
`docker-compose.async.yml`: database-backed queue, cache, locks, and sessions.
Run one scheduler service. The worker and scheduler must use the same approved
release image and environment as the API. Set ECS stop grace period longer than
the worker timeout. Add autoscaling only after measuring queue depth and task
resource use.

## Production configuration

Store these as protected backend runtime secrets/settings, not source files.
The list is a template; values must come from the production owners:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_KEY=<stable-unique-production-key>
APP_URL=https://api.example.com
FRONTEND_URL=https://app.example.com
LOG_CHANNEL=stack
LOG_STACK=stderr,sentry_logs

DB_CONNECTION=pgsql
DB_HOST=<production-supabase-pooler-host>
DB_PORT=6543
DB_DATABASE=postgres
DB_USERNAME=<production-database-user>
DB_PASSWORD=<production-database-password>
DB_SSLMODE=require

SUPABASE_URL=https://<production-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<production-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>

SESSION_DRIVER=database
SESSION_CONNECTION=pgsql
SESSION_DOMAIN=.example.com
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
CACHE_STORE=database
QUEUE_CONNECTION=database

SEATALK_REDIRECT_URI=https://api.example.com/auth/seatalk/callback
SEATALK_APPROVAL_ENABLED=false
GOOGLE_SHEETS_SYNC_ENABLED=false
GOOGLE_USER_IMPORTS_SYNC_ENABLED=false
SENTRY_ENVIRONMENT=production
```

`APP_KEY` must remain stable across releases and API tasks. Store it in
Secrets Manager and never print it in deployment logs. Set exact allowed
origins, secure cookie settings, and trusted proxy configuration for the ALB.
Set `ADMIN_EMAILS`, Sentry DSN, and any enabled integration values from the
backend `.env.example` as required by the chosen features.

### SeaTalk Approval Center production gate

Leave Approval Center disabled until an isolated SeaTalk staging app has
completed a full create, approve, reject, synchronization, retry, expiry, and
duplicate/late callback cycle. Production additionally requires:

- production App ID/secret and callback signing secret in Secrets Manager;
- a unique high-entropy `SEATALK_APPROVAL_TOKEN_SECRET`;
- exact public approve/reject callback URLs on the production API hostname;
- SeaTalk-confirmed update endpoint, method, schema, `app_path`, signature,
  authorization header, and callback acknowledgement contract;
- SeaTalk permissions/Data Scope and employee-code mappings audited; and
- production schema migrations applied and verified before enabling.

The callback URLs are:

```text
https://api.example.com/api/v1/integrations/seatalk/approval/approve
https://api.example.com/api/v1/integrations/seatalk/approval/reject
```

Register the exact URLs in the production SeaTalk app and make them reachable
without an interactive Cloudflare Access login. Enable the flag only as a
separate reviewed production change after every prerequisite is evidenced.

## Database and release process

1. Create an isolated staging deployment first and verify it against the same
   region/provider architecture. Record the commit SHA and test evidence.
2. For production, review the migration ledger, exact manifest, backup/PITR
   status, and the generated plan from
   [`production-migrations.md`](production-migrations.md).
3. Apply the documented phase A Supabase SQL, then the Laravel migrations from
   the approved application image, then phase C Supabase SQL. Do not run the
   Supabase auth stub installer against production and do not blindly replay
   migrations.
4. Before routing users, run:

   ```sh
   php artisan system:verify-config --production
   php artisan migrate:status
   ```

   The config verification connects to production services. Run it through a
   protected one-off task using the exact production task definition/secrets.
5. Deploy API tasks first with backward-compatible schema. Wait for healthy ALB
   targets, then deploy worker and scheduler tasks. Deploy the Firebase build
   for the same release only after API health and staging acceptance pass.
6. Verify HTTPS site/API health, authentication, authorization by role,
   create/edit/approval flows, realtime updates, and SeaTalk login if enabled.
   Confirm CloudWatch/Sentry errors and queue backlog are normal.
7. Record deployed image digest, frontend commit, migration plan, health
   results, operator, and rollback image. Keep schema rollback separate from
   application rollback; migrations may not be safely reversible.

Travis now has an optional tag-gated AWS ECR/ECS backend deployment stage; see
[`aws-console-setup-simplified.md`](aws-console-setup-simplified.md) and
[`ci-cd-audit-2026-10-23.md`](ci-cd-audit-2026-10-23.md). It requires protected
Travis variables and AWS resources/permissions before it can run. It does not
deploy the Firebase frontend or apply production database migrations. Configure
Firebase deployment separately, and require protected branches, an approved
release tag, human release approval, and production secrets unavailable to
pull-request jobs.

## Go-live checklist

- [ ] Production AWS account, region, VPC, egress, security groups, ECR, ECS,
      ALB/ACM, Secrets Manager, logs, alarms, and budgets are ready.
- [ ] Firebase Hosting custom domain is verified; production Auth redirect
      settings are correct.
- [ ] Frontend supports the separate API origin and SeaTalk cookie flow; exact
      CORS and cookie settings pass staging verification.
- [ ] Production Supabase backup/PITR, Auth, Realtime, database connection,
      privileges/RLS, and migration ledger are verified.
- [ ] Laravel API, queue worker, and one scheduler task are healthy.
- [ ] Production migrations follow the approved phase A / Laravel / phase C
      procedure.
- [ ] Sentry/CloudWatch monitoring and restore/rollback procedures are ready.
- [ ] Optional Sheets and SeaTalk integrations are either correctly configured
      or remain disabled.
- [ ] Staging acceptance is green for the release SHA; production owner records
      release approval before any user traffic is routed.

Production status remains **not ready** until the environment-specific checks
above are completed. The go-live audit at
[`go-live-remediation-status-2026-10-23.md`](go-live-remediation-status-2026-10-23.md)
records open production and provider verification gates.
