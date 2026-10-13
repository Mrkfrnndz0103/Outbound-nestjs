# Linehaul SeaTalk presence retry — phase 6

## Scope

Retry local pending approvals that did not receive an FTE OPS assignment because no eligible approver was present. Reuse the existing every-minute assignment expiry job and its router; add no new scheduler, provider endpoint, or schema.

## Changes

- `ExpireSeaTalkAssignments` now checks for present FTE OPS users, then scans at most 100 `PENDING`/`REROUTED` requests without a live assignment when Approval Center is enabled.
- The existing router locks and rechecks each request before assigning it, so concurrent job runs or a simultaneous approval cannot create multiple active assignments.
- Recent provider delivery failures are held for five minutes before another attempt. Expired assignments continue to route through the existing expiry path.

## Verification

- The added regression test first failed because the existing job left the request unassigned after the FTE OPS user became present; it now passes and verifies provider delivery targets that assigned employee.
- Full backend suite: **171 tests passed**, 657 assertions; 17 PostgreSQL-only tests skipped and two existing PHPUnit metadata deprecations remain.
- Pint and PHP syntax checks passed for the changed job and test.
- Test execution used a disposable SQLite database and mocked SeaTalk gateway. No external provider, staging, or production system was contacted or changed.

## Remaining limits

- The scan handles 100 eligible rows per minute; larger backlogs drain over subsequent scheduler runs.
- Provider delivery, callback contracts, staging credentials/access, migration deployment, and the existing staging RLS finding remain unverified or unresolved as recorded in [staging-runtime-verification.md](./staging-runtime-verification.md).
