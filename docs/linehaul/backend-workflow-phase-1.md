# Linehaul workflow — approved backend phase

Scope: state transitions, rejection routing, cancellation permissions, and audit consistency. Frontend changes, DOC driver validation/printing, bulk-selection controls, and full SeaTalk assignment delivery are separate phases. Existing uncommitted frontend and workflow-attribution changes are preserved.

## Backend contract

| Action | Actor and source state | Saved state | Next actor |
| --- | --- | --- | --- |
| Create | Existing OPS PIC / OPS FTE submission permissions | PENDING | OPS FTE |
| Approve | OPS FTE, PENDING / historical REROUTED | REQUESTED | FTE MM |
| Reject OPS | OPS FTE, PENDING / historical REROUTED; mandatory reason | REJECTED | Owning OPS PIC |
| Reject MM | FTE MM, REQUESTED; mandatory reason | REJECTED | OPS FTE |
| Correct rejection | Returned role only; PIC must own request | PENDING | OPS FTE for fresh approval |
| Edit pending details | OPS FTE | Existing PENDING / historical REROUTED | OPS FTE; editing is not approval |
| Cancel | OPS FTE at review stage; FTE MM at REQUESTED stage; existing owning PIC cancellation preserved | CANCELLED | None |
| Edit Docked details | Owning OPS PIC only | DOCKED | None; notify OPS FTE, FTE MM, DOC Officer |

Cancellation uses `cancellation_remarks`, required for FTE MM, trimmed, maximum 2000 characters. Rejection uses `rejection_remarks`, required on both Web endpoints. Request-detail edits are limited to existing request-form fields; they cannot alter driver, trip, or workflow state through extra payload fields.

`status` remains the canonical saved state in GET, list, create, edit, and action responses. `display_status` is separate: FTE MM sees DOCKING as ASSIGNED; other roles retain DOCKING. Historical REROUTED retains the earlier MM/DOC display of PENDING, without overwriting canonical status. `next_action_role` is derived from state, driver presence, and `rejection_return_role`; terminal states have no next actor. Metrics count canonical states, including REJECTED as awaiting action. The legacy MM/DOC PENDING filter expansion is retained for historical REROUTED compatibility.

Rejections share ApprovalService across Web and SeaTalk. Row locks and transactions protect state, event, notification, and assignment writes. Replay checks preserve the original rejecting actor and reason. Existing HTTP idempotency remains in place. Editing a rejected request preserves rejection history and requires a fresh approval. Edit events include previous values and saved changes; resubmission events also preserve previous rejection metadata. Cancellation records its own remarks, actor, version, source, and correlation ID; it does not masquerade as rejection.

## Changed files

- `backend/app/Features/Approvals/ApprovalService.php`: shared rejection state, routing, notification, replay validation.
- `backend/app/Features/Requests/RequestService.php`: edit/resubmit/cancel behavior, transactional audit and notifications.
- `backend/app/Features/Requests/RequestAuthorizer.php`: role/stage/ownership checks.
- `backend/app/Features/Requests/RequestController.php`: mandatory remarks, response presentation, actionable metrics.
- `backend/app/Features/Requests/RequestStatus.php`: REJECTED, role display and next actor derivation.
- `backend/app/Features/Requests/RequestRepository.php`: canonical reads/metrics, workflow metadata, versioned column cache. Existing actor-attribution additions are preserved.
- `backend/database/migrations/2026_10_13_000001_add_rejection_routing_to_requests.php` and `supabase/migrations/20261013032010_linehaul_rejection_routing.sql`: matching additive schema changes.
- Existing tests: ApprovalServiceTest, RequestWorkflowTest, RequestAuthorizationMatrixTest, IdempotencyTest, SeaTalkApprovalCallbackTest.
- New test: RequestWorkflowMigrationTest, exercising both migration paths against PostgreSQL.

## Migration requirements

Apply the additive migration through the environment's approved migration process **before releasing the backend**. It adds REJECTED to the request/event status enum plus nullable `rejection_return_role` and `cancellation_remarks` columns, with a check restricting return roles to OPS PIC or OPS FTE. Both migration paths are repeatable. The Laravel down migration refuses to discard workflow ownership or remarks.

No historical statuses, events, or production records are rewritten. In particular, previously cancelled MM rejections are not automatically restored. That requires a separately approved, evidence-based recovery plan. Neither migration was applied to staging or production in this phase. Existing RLS is preserved.

## Verification

Tests run in the existing local `soc5-attribution-tests:local` Docker image, PHP 8.3.35, whose Composer lock hash matches this checkout. Source is copied into disposable containers; no .env or production credentials are copied. SQLite suites run with networking disabled. PostgreSQL tests use a disposable PostgreSQL 17 container with no external networking or published ports. SESSION_SECURE_COOKIE=true supplies the existing secure-session fixture assumption; no application configuration was changed.

Commands inside the isolated test environment:

```sh
vendor/bin/phpunit
vendor/bin/phpunit --group postgres
vendor/bin/pint --test <changed PHP files>
php artisan route:list --path=requests --except-vendor
php -l <changed PHP file>
```

Regression coverage includes both rejection destinations, mandatory reasons, exact replay and changed-reason conflicts, correction and fresh approval, preserved canonical/read/mutation statuses, MM cancellation remarks and idempotency, unauthorized DOC HTTP actions, non-owner edits, Docked state retention and before/after audit values, notification failure rollback, actionable rejection counts, warm previous-release schema cache, valid/invalid callback signatures, duplicate rejection callbacks, and ignored late approvals against closed assignments. PostgreSQL checks cover both migration paths, repeated application, preserved historical states/events/RLS, and invalid return-role constraints.

Final results: the full backend run passed 147 tests (603 assertions), with 17 PostgreSQL-only tests skipped. The separate PostgreSQL run passed all 17 tests (49 assertions). Targeted Pint checks passed for 13 PHP files; syntax checks passed for all six changed production classes and the new Laravel migration. Existing versioned/legacy request routes boot successfully, and `git diff --check` passes. Independent source review reported no unresolved issue in the approved phase after the metric/cache fixes.

Initial regression tests failed for the audited defects before the fixes. Two existing PHPUnit doc-comment metadata deprecations in PostgresReportingTest and PostgresSchemaHardeningTest remain outside this scope. The disposable database container was removed after verification.

## Remaining gaps

| Feature | Phase-1 status | Remaining work |
| --- | --- | --- |
| Rejection versus cancellation | Implemented and tested | Frontend REJECTED status/filter/correction controls |
| Cancellation roles and remarks | Implemented and tested in API | Role-specific cancel dialog and visible remarks |
| Post-Docked edits | Backend implemented and tested | PIC edit controls; realtime sound/blinking |
| Canonical/display status contract | Backend implemented and tested | Frontend types, badges, filters and action eligibility consume new fields |
| DOC driver assignment and print | Deferred | Digits only, 1–10 characters, trim, duplicate IDs allowed; reassignment protection; saved-response label popup and print gate |
| SeaTalk rejection synchronization | Shared local decision/callback tests pass | Verify actual provider contract; wire fresh assignments on resubmission and initial delivery; validate old/new approval-cycle callback identity |
| Realtime UI / bulk controls | Deferred | Correct role queues, update-aware alerts/acknowledgment, transparent-red blinking, Select All and bulk request retry protection |
| Live staging / Supabase | Unverified | Resolve soc5-Staging to actual host and path; inspect deployed schema, RLS, publication, worker configuration and provider delivery |
| Frontend build / browser validation | Not rerun for backend-only changes | Host Node 18 remains incompatible with installed Vite/Playwright; use supported Node before frontend phase |

This patch is a backend phase deliverable, not a complete integrated release. No commit, push, deployment, or live data change was performed.
