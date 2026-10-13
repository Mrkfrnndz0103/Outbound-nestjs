# Linehaul staging runtime verification

Date: 2026-10-13 UTC. This report records read-only checks against the staging Supabase project and staging HTTPS host. No migrations, data writes, provider actions, deployments, or SSH configuration changes were performed.

## Connection resolution

The `soc5-Staging` token initially had no SSH mapping. The user then provided `Host soc5-staging`, `HostName 56.10.132.246`, `User ubuntu`, and identity path `~/.ssh/LightsailDefaultKey-ap-southeast-1.pem`. TCP/22 is reachable. The configured private key is absent from this environment (not found under `/home/ubuntu`, `/tmp`, `/mnt`, or `/workspace`), so SSH authentication could not be attempted. `ssh-keyscan` returned ED25519 fingerprint `SHA256:p9CDYrtDW6ZpuOFF+29KN24MLVFLz7Wk7T+ZCkWkeuo`; this fingerprint is not independently verified against the Lightsail console. The staging app hostname was recovered from the local backend runtime configuration; it resolves through Cloudflare to the protected site. The matching Supabase project is `soc5-outbound-staging` (`otciptffvynzhwzwowzd`, ap-southeast-1, ACTIVE_HEALTHY).

## Validation matrix

| Feature | Current status | Evidence | Gap / result |
| --- | --- | --- | --- |
| SSH staging access | Partially resolved / blocked by missing key | User-provided host mapping; TCP/22 and `ssh-keyscan`; `stat` and filesystem search for the configured identity file | Host is `56.10.132.246`, user `ubuntu`, TCP/22 open. The specified private key is not present, so authentication was not attempted; host key fingerprint still needs verification. |
| Staging web/API access | Blocked | HTTPS GETs to app root, `/api/up`, and `/api/v1/auth/seatalk/config` | All return HTTP 302 to Cloudflare Access login. No Access session or test identity is available in this environment. |
| Supabase project identity | Verified | Supabase project listing and project details | Active staging-named project located in ap-southeast-1. |
| Supabase Realtime connection/publication | Partially verified | Read-only Node 22 subscriptions reported `SUBSCRIBED` for `public.requests` and `public.notifications`; catalog confirms both in `supabase_realtime` | No staging request rows exist, so a database change event was not generated. Role-authenticated end-to-end delivery, browser sound, and cross-user visibility remain unverified. `public.intraday_dispatch` is also in the publication. |
| Staging workflow schema | Incorrect / migration missing | Read-only schema and migration catalog query | `request_status` lacks `REJECTED`; `requests.rejection_return_role` and `requests.cancellation_remarks` are absent. The latest listed approval migrations are dated 2026-10-03; the approved 2026-10-13 rejection-routing migration is not listed. Do not release the new backend against this schema until an approved migration is applied. |
| Staging linehaul data | Empty for request workflow | Supabase table inventory | `requests`, `request_events`, `notifications`, and SeaTalk approval tables currently report zero rows. No workflow sequence could be exercised without creating test data. |
| Supabase RLS on role-facing request tables | Configured | Read-only `pg_policies` and table inventory | `requests`, `notifications`, and `request_events` have RLS and role/owner-scoped SELECT policies. Realtime handshake passed, but actual authenticated event visibility was not tested. |
| SeaTalk Approval Center runtime | Incorrect / incomplete | Secret-free configuration presence check on the staging backend env file; repository provider-contract record | Approval is configured as enabled and credentials plus create/detail paths are present, but update path, app path, and both callback URLs are missing. Repository documentation says the provider create/update and callback acknowledgement contract is not confirmed. No SeaTalk API call or approval item was created. |
| Public-schema Laravel table exposure | Critical security finding | Supabase advisor, `has_table_privilege` SQL, and read-only PostgREST requests | `migrations`, `idempotency_keys`, `user_event_retries`, `cache`, `cache_locks`, `jobs`, `job_batches`, and `failed_jobs` have RLS disabled and grant `anon` and `authenticated` SELECT/INSERT. GETs to `jobs`, `idempotency_keys`, and `requests` using the publishable key return 200 (these tables currently return no rows). |

## RLS finding

Do not expose service keys in clients. The Supabase advisor’s finding is confirmed by database privilege checks. Enable RLS only after choosing the required backend access model and policies; enabling it without policies blocks ordinary role access. The database-side RLS enablement statements are:

```sql
ALTER TABLE public.migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_event_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cache_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failed_jobs ENABLE ROW LEVEL SECURITY;
```

These statements were **not run**. The service’s database role and any required operational policies must be reviewed before applying them.

## Checks performed

- `ssh -o BatchMode=yes -o ConnectTimeout=8 soc5-Staging ...`: before the mapping was supplied, failed because `soc5-staging` could not resolve.
- User-supplied mapping resolves to `56.10.132.246`; TCP/22 is open, but the configured private-key file is missing, so authentication was not attempted. The SSH host fingerprint has not been independently verified.
- HTTPS probes: app root, `/api/up`, and SeaTalk config all redirect to Cloudflare Access.
- Supabase MCP read-only project, table, schema, publication, RLS policy, and privilege queries.
- Realtime websocket subscribe/unsubscribe using the backend environment’s publishable key; requests and notifications both reached `SUBSCRIBED`.
- Read-only PostgREST GETs for `jobs`, `idempotency_keys`, and `requests`; each returned HTTP 200 and zero visible rows.
- Secret-free SeaTalk config presence check; no credential values were printed or sent to SeaTalk.

## Needed to complete the remaining live checks

- Place the approved `LightsailDefaultKey-ap-southeast-1.pem` identity at the supplied path or provide its mounted path so SSH authentication can run. Do not paste private-key contents into chat. Verify the reported ED25519 fingerprint against the Lightsail console before trusting the host.
- Provide a Cloudflare Access session or authorized staging test identity for end-to-end browser/API verification.
- Apply the approved rejection-routing migration to staging through the deployment owner’s migration process before testing the updated backend there.
- Confirm an isolated SeaTalk staging app, current provider contract, callback URLs, update path, app path, and approval test account before creating or deciding any provider approval item.
- Apply the repository remediation described below through the authorized staging migration process, then repeat the read-only grant and PostgREST checks. No staging or production migration has been applied by this audit.

## Repository remediation prepared

The eight exposed Laravel support tables now have a forward-only Laravel migration at `backend/database/migrations/2026_10_13_000002_harden_backend_support_tables.php` and a matching idempotent Supabase migration at `supabase/migrations/20261013040000_harden_backend_support_tables.sql`. The migrations enable RLS without browser policies and revoke table privileges from `PUBLIC`, `anon`, and `authenticated`. They do not change grants for `service_role` or the database owner. The Supabase migration skips tables not created yet; the Laravel migration applies the same hardening after Laravel creates its support tables. Both use Laravel's direct PostgreSQL connection model; these tables are created by that connection, so it remains their owner and can continue to operate under RLS.

The local PostgreSQL 17 migration smoke check and Laravel migration integration test passed. Staging remains exposed until its authorized migration process applies the fix and the access checks are repeated. No live database, data, provider, deployment, or SSH state was modified.

## Follow-up: local Approval Center callback implementation

The repository now includes local HMAC-SHA1 verification for approve/reject
callbacks, a separate SHA-256 event-verification handler, and focused
idempotency/signature tests. Backend tests passed (177 tests, 665 assertions,
18 skipped); the backend image built successfully. The accumulated frontend
suite passed (84 tests), lint passed, and the frontend production build passed
in Node 22. The host's Node 18 could not start the installed Vite/Vitest toolchain;
the checks were rerun successfully in a temporary Node 22 container.

These are repository checks only: the change has not been deployed to staging,
and no SeaTalk callback was sent to the provider. Staging therefore remains
unverified. Its approve/reject callback URLs were absent in the earlier
secret-free runtime inspection, and SeaTalk has not confirmed the canonical
signature delimiters, query/body encodings, or `Authorization` value format.
Confirm those contract details and configure registered callback URLs in an
isolated SeaTalk test tenant before attempting provider callback validation.
