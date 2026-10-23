# Go-live remediation status — 23 October 2026

This records source remediation and local evidence for findings GL-01–GL-12.
It does not record a deployment or approval to release.

| Finding | Fix and evidence | Local result |
|---|---|---|
| GL-01 SeaTalk lifecycle delivery | `WorkflowSeaTalkOutbox`, `ApprovalRouter`, `ApprovalService`, `ReconcileSeaTalkApprovals`; assignment/event/revision delivery keys and terminal divergence reconciliation. `SeaTalkApprovalCycleDeliveryTest`, `ApprovalItemSynchronizationTest`. | Covered by backend suite. Provider interoperability remains unverified. |
| GL-02 Active callback tokens | `ApprovalItemProvisioner`, `ApprovalItemSynchronizer`; active assignment tokens are included when synchronizing and reconciling approval lists. | Callback replacement/replay and sync tests pass. |
| GL-03 Principal cache leakage | `App`, `Dashboard`, `PrincipalQueryScope`, `api`; protected page/query state is scoped to identity and effective role, old state is retired at account changes, same-user token refresh preserves current form state. | 139 Vitest tests and account-switch, refresh, logout, and DOC workflow browser cases pass. |
| GL-04 Abandoned final outbox attempt | `WorkflowOutboxRepository`; exhausted stale work is dead-lettered without increasing attempts. SQLite and PostgreSQL regressions cover the strict attempts constraint. | Non-PostgreSQL and disposable PostgreSQL tests pass. |
| GL-05 SeaTalk preflight | `VerifyProductionConfig`; required enablement, credentials, signing/token secrets, operation paths and callback URLs are checked. | Missing-setting matrix and valid configuration tests pass. Real provider values are not available here. |
| GL-06 Incomplete migration manifest | `supabase-migration-manifest.txt`, `validate-migration-manifest.mjs`, `verify-release-static.sh`; exact forward SQL coverage is enforced. | All 43 SQL migrations validate; omission/duplicate/gap regressions pass. |
| GL-07 Migration ordering ambiguity | `production-migrations.md`, `plan-production-migrations.mjs`; owner-reviewed history is checked offline and plans preserve phase A → Laravel → phase C. | Four planner regression tests pass. No staging/production migration was run. |
| GL-08 DOC reassignment unavailable after assignment | `DockingConfirmation`; bounded assigned-driver lookup is independent from actionable queue and supports explicit reassign/save/label flow. | Reload, reassignment, form preservation and label browser test passes. |
| GL-09 DOC recovery | `UserController`, `UserManagement`; FTE can issue an audited one-time DOC recovery password with mandatory change on next login. | Backend and browser recovery cases pass. |
| GL-10 Cookie role preview mismatch | `AuthenticateSupabase`; administrator role preview uses the effective role for cookie sessions while preserving the stored role. | Cookie and bearer parity tests pass. |
| GL-11 Unbounded Sheets export | `GoogleSheetsRequestSync`; row admission is capped before materialization, event reads are batched and limited to relevant/latest events, optional lookback window is configurable. | Limit, bounded batches, event attribution and lookback tests pass. |
| GL-12 Replica session/cache loss | `docker-compose.async.yml`, forward-only sessions migration, `VerifyProductionConfig`; async profile selects shared database sessions/cache/locks and validates required tables. | PostgreSQL migration test verifies RLS hardening and session persistence across connections. Docker/Linux profile could not be run on this workstation. |

## Verification run

- Frontend: 139 tests across 40 files pass; lint and production build pass. Twelve Playwright cases pass for DOC flows, account isolation and login entry.
- Backend: SQLite suite passes (249 tests, 894 assertions); isolated PostgreSQL group passes (23 tests, 162 assertions). Pint passes.
- Deployment tooling: exact migration manifest validation passes for 43 files; four migration planner tests pass; `git diff --check` passes.
- `npm run format:check` still reports 49 formatting errors across the repository. Biome reports line-ending differences on Windows (`core.autocrlf=true`); the check makes no changes. The lint gate passes.
- Docker/Compose is unavailable on this machine (`docker` command is not installed), so Linux image, NGINX/HTTPS and async profile startup were not validated.

## Go-live gates still open

- SeaTalk has not supplied/confirmed the actual callback and update contract in an isolated test tenant. Local HMAC/token/replay tests do not prove provider compatibility.
- No staging or production Supabase migration/RLS verification was run. This follows the instruction to skip staging; the checked-in migration plan is offline-only.
- Linux Docker build/startup, authenticated HTTPS/role/realtime/reset acceptance, production configuration, backup/restore rehearsal, and operational worker/scheduler checks remain outstanding.

**Release status: NO-GO until the open environment/provider gates have recorded passing evidence.**
