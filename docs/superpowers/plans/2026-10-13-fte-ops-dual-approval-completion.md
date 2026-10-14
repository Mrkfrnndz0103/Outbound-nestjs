# FTE OPS Dual Approval Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the FTE OPS dual approval workflow so the acceptance criteria in the referenced implementation plan are met end to end.

**Architecture:** Keep `ApprovalService` as the canonical decision boundary. Extend the existing router, outbox, SeaTalk callback, scheduler, Supabase Realtime, and frontend approval flow instead of creating a second approval path. Add client presence heartbeats, cycle-aware routing, secure assignment tokens, provider message persistence, and PostgreSQL concurrency coverage.

**Tech Stack:** Laravel/PHP, PostgreSQL/Supabase, React/TypeScript/Vite, Supabase Realtime, SeaTalk Approval Center, PHPUnit/Laravel tests, Vitest, and Playwright.

**Spec:** `docs/seatalk-integration/FTE_OPS_Dual_Approval_Implementation_Plan.md` — lines 642-811, especially acceptance criteria at lines 751-768.

## Global constraints

- The backend remains the single source of truth for `approval_status`, `approval_source`, and approval timestamps.
- Assignment expiry is three minutes by default and remains configurable through the existing approval configuration.
- Presence eligibility requires both the configured `is_active` role condition and a recent heartbeat.
- Never store or log a raw approval token; persist only a verifier hash or equivalent one-way representation.
- Enforce one active assignment per request at the database level as well as in application code.
- Provider delivery failure must not lose or approve a local request; outbox/reconciliation must retry safely.
- Callback side effects must run in a transaction while locking the request and assignment rows.
- Preserve the existing WEB checkbox flow and record manual decisions as `approval_source=WEB`.
- Frontend controls may display and request a decision, but may not become the approval source of truth.
- Use forward-only migrations and preserve existing uncommitted user changes.

## Confirmed starting point

The repository already contains the main approval service, approval metadata migration, presence API, router, expiry job, SeaTalk outbox/callback flow, realtime invalidation, and WEB checkbox flow. The remaining implementation work is concentrated in the gaps below:

- FTE OPS frontend heartbeat is missing.
- Routing does not exclude an expired FTE until the current routing cycle is exhausted.
- Assignment token columns exist in schema, but token issuance, callback validation, and production usage are absent.
- Assignment-level SeaTalk message/reference persistence is incomplete.
- Existing tests do not cover token security, frontend heartbeat lifecycle, cycle exhaustion, or real PostgreSQL concurrency.

## Implementation tasks

### 1. Finalize the assignment and callback data contract

**Files:**

- Create `backend/app/Features/Approvals/ApprovalToken.php`.
- Create a forward-only migration under `backend/database/migrations/` for any missing assignment fields, such as `routing_cycle`, `approval_token_used_at`, or required callback-event identifiers. First verify the existing migration chain to avoid duplicate columns.
- Update `backend/config/services.php` and `backend/.env.example` with the token secret/configuration and any provider callback settings.
- Update `backend/tests/Feature/ApprovalSchemaTest.php` and add `backend/tests/Feature/ApprovalTokenTest.php`.

**Steps:**

- [ ] Inspect the current production migration chain and confirm which columns/indexes already exist before writing the migration.
- [ ] Define the token service interface: issue a cryptographically strong token for an assignment, derive/verify its stored hash, and compare with constant-time equality.
- [ ] Decide and document the callback field carrying the token. It must be present in the SeaTalk item/action payload and in the callback payload; do not rely on an undocumented provider field.
- [ ] Add the routing-cycle representation and an index supporting request/cycle/status lookups.
- [ ] Add a one-time-use marker if assignment status alone is insufficient to distinguish a processed token from an unprocessed one.
- [ ] Add tests proving tokens are unpredictable, valid tokens verify, wrong tokens fail, raw tokens are not persisted, and schema constraints are present.

**Acceptance:** A callback can be authenticated against a specific assignment without storing a raw token, and the database can represent routing cycles and one-time processing unambiguously.

### 2. Implement FTE OPS presence heartbeats

**Files:**

- Create `frontend/src/hooks/useApprovalPresence.ts`.
- Mount the hook from the authenticated application shell in `frontend/src/App.tsx` or the existing authenticated dashboard wrapper, using the repository’s current user/session source.
- Add `frontend/src/hooks/useApprovalPresence.test.ts`.

**Steps:**

- [ ] Send an immediate heartbeat for an authenticated FTE OPS user.
- [ ] Repeat the heartbeat at a bounded interval shorter than the backend presence timeout, such as 30 seconds against the current 60-second eligibility window.
- [ ] Prevent overlapping requests and clean up the interval on logout, unmount, role change, or session loss.
- [ ] Do not send heartbeats for non-FTE users.
- [ ] Treat transient heartbeat failure as non-fatal to the UI while allowing the next interval to recover presence.
- [ ] Add fake-timer tests for immediate send, interval send, non-FTE suppression, cleanup, role change, and failure recovery.

**Acceptance:** An FTE OPS user who keeps the application open remains eligible for routing; an inactive or logged-out user naturally becomes ineligible.

### 3. Make routing cycle-aware and concurrency-safe

**Files:**

- Modify `backend/app/Features/Approvals/ApprovalRouter.php`.
- Extend `backend/tests/Feature/ApprovalRoutingTest.php` and `backend/tests/Feature/ExpireSeaTalkAssignmentsTest.php`.
- Extend the PostgreSQL feature-test area for lock and uniqueness behavior.

**Steps:**

- [ ] Keep request locking around candidate selection and assignment creation.
- [ ] Determine the current routing cycle for the request.
- [ ] Exclude FTEs whose assignment expired or failed in the current cycle.
- [ ] Preserve round-robin ordering among remaining eligible FTEs.
- [ ] When every currently eligible FTE has been attempted in the cycle, increment the cycle and allow the next pass; do not permanently exclude an FTE.
- [ ] Persist the cycle on every assignment and keep the active-assignment uniqueness guard.
- [ ] Verify that no eligible FTE leaves the request stuck when a cycle is exhausted.

**Tests:**

- [ ] Two FTEs: first assignment expires, second FTE receives the next assignment.
- [ ] Two FTEs: both expire, then the next cycle may select the first FTE again.
- [ ] One FTE: expiry advances the cycle and safely retries that FTE without creating two active assignments.
- [ ] No active FTE: request remains pending and is recoverable later.
- [ ] Concurrent assignment attempts: exactly one active assignment is created.

### 4. Persist provider delivery state and send secure actionable messages

**Files:**

- Modify `backend/app/Features/Approvals/ApprovalItemProvisioner.php`.
- Modify the SeaTalk gateway/transport and payload classes used by the provisioner.
- Modify `backend/app/Features/Approvals/ApprovalRouter.php` or the outbox handoff so the selected assignment identity is preserved through delivery.
- Extend `backend/tests/Feature/SeaTalkApprovalCycleDeliveryTest.php` and `backend/tests/Feature/SeaTalkOutboxDeliveryTest.php`.

**Steps:**

- [ ] Generate or derive the assignment token through `ApprovalToken` and place only the actionable token-bearing payload in the provider message.
- [ ] Keep the raw token in memory or derive it from the assignment identifier and server secret; do not add a raw-token database column.
- [ ] Persist the provider’s assignment/message/reference identifier on the exact assignment row, not only on the request-level item.
- [ ] Make delivery idempotent: retries must update/reuse the existing provider reference rather than create uncontrolled duplicates.
- [ ] On provider failure, retain the local pending request and mark the delivery attempt for retry/reconciliation without approving or dropping the request.
- [ ] Redact tokens, callback payload secrets, and authorization headers from logs.

**Tests:**

- [ ] Successful provisioning stores the assignment-level provider reference.
- [ ] Retry after a transient provider failure is safe and eventually delivers.
- [ ] Permanent provider failure leaves the request pending and visible to reconciliation.
- [ ] Generated payload contains the token needed by the documented callback contract, while database/log assertions show no raw-token leakage.

### 5. Enforce token, expiry, and first-valid-wins callback behavior

**Files:**

- Modify `backend/app/Features/Approvals/SeaTalkApprovalCallbackController.php`.
- Use `backend/app/Features/Approvals/ApprovalToken.php` from the callback path.
- Extend `backend/tests/Feature/SeaTalkApprovalCallbackTest.php` and add PostgreSQL concurrency tests.

**Steps:**

- [ ] Keep existing provider authenticity/signature validation as the first gate.
- [ ] Resolve the assignment by provider reference/request context and verify the supplied token against that assignment.
- [ ] Reject unknown, wrong, already-used, closed, expired, or superseded assignment actions without changing the request decision.
- [ ] Lock the request and assignment rows before invoking the canonical `ApprovalService` decision.
- [ ] Preserve idempotent callback-event handling and return an explicit safe response for duplicates.
- [ ] When a valid SeaTalk approval succeeds, close remaining active assignments and let realtime/frontend synchronization update the checkbox.
- [ ] When WEB approval wins first, invalidate all active SeaTalk assignments and reject later callbacks.

**Tests:**

- [ ] Valid token approves the correct request.
- [ ] Wrong token cannot approve another assignment/request.
- [ ] Expired token cannot approve.
- [ ] Replayed token/callback is harmless and does not create a second decision.
- [ ] Simultaneous WEB and SeaTalk decisions result in exactly one final decision.
- [ ] Changed payload with the same callback event identifier is rejected or safely ignored.

### 6. Complete frontend backend-state synchronization

**Files:**

- Modify `frontend/src/pages/OutboundRequests.tsx` and existing approval hooks only where needed.
- Modify `frontend/src/hooks/useOutboundRequests.ts` and `frontend/src/hooks/useRequestRealtime.ts` only where needed.
- Add or extend frontend integration tests for approval-state updates.

**Steps:**

- [ ] Ensure the checkbox is derived from the backend `approval_status` after initial load, mutation response, and realtime invalidation.
- [ ] Remove any local optimistic approval state that can contradict the backend decision.
- [ ] Keep WEB approval calls routed through the existing backend approval endpoint.
- [ ] Verify SeaTalk approval updates the request row through backend persistence and realtime/query refresh rather than direct browser mutation.
- [ ] Verify a rejected or expired SeaTalk action leaves the checkbox unchanged and shows the backend state after refresh.

**Acceptance:** The UI reflects the canonical request row after both WEB and SeaTalk decisions, including refresh and realtime update paths.

### 7. Add complete end-to-end and PostgreSQL verification

**Files:**

- Extend the existing backend feature tests under `backend/tests/Feature/`.
- Add or extend browser tests under the repository’s existing Playwright test location.
- Keep PostgreSQL-only tests explicitly grouped and runnable in CI.

**Steps:**

- [ ] Add migration/schema tests for active-assignment uniqueness, foreign keys, cycle fields, and callback-event idempotency.
- [ ] Add provider outage and reconciliation tests.
- [ ] Add concurrent PostgreSQL tests for two callbacks, callback versus WEB approval, and concurrent router assignment.
- [ ] Add browser coverage for FTE presence heartbeat, request visibility, checkbox approval, SeaTalk-to-backend state propagation, timeout handoff, and no-active-FTE recovery.
- [ ] Run the browser suite with Laravel and frontend services actually running; do not treat connection-refused results as passing evidence.

**Required verification commands:**

- [ ] `php artisan test --fail-on-skipped` for the non-PostgreSQL suite.
- [ ] The repository’s PostgreSQL CI/test command with `--fail-on-skipped` in a real PostgreSQL environment.
- [ ] Frontend unit tests, lint, and production build.
- [ ] `vendor/bin/pint --test`.
- [ ] `scripts/preflight.ps1 -Fix -All` followed by the preflight test suite.
- [ ] Playwright end-to-end suite against running services.

### 8. Finish observability, configuration, and controlled rollout

**Files:**

- Update `docs/seatalk-integration/approval-center-setup-guide.md`.
- Update relevant configuration documentation and `.env.example` files.
- Add structured metrics/log fields in the existing approval/outbox paths.

**Steps:**

- [ ] Document callback URL, provider action payload, token handling, scheduler/queue requirements, heartbeat interval, and reconciliation procedure.
- [ ] Add redacted correlation fields for request ID, assignment ID, routing cycle, provider reference, delivery attempt, callback outcome, and expiry reason.
- [ ] Monitor pending requests, active assignments, expired assignments, delivery failures, callback rejects, and heartbeat staleness.
- [ ] Deploy with SeaTalk approval disabled, migrate and verify schema, then enable for one FTE OPS user.
- [ ] Expand to two-to-five FTEs, observe routing and expiry metrics, then stage and production-roll out.
- [ ] Define rollback as disabling new SeaTalk assignments while preserving local WEB approval and pending requests; do not delete assignment history.

**Acceptance:** Operators can determine why a request is pending, expired, rejected, delivered, or awaiting an FTE without exposing secrets or losing audit history.

## Definition of done

- [ ] Every acceptance criterion in the referenced implementation plan is backed by an automated test or an explicit operational verification.
- [ ] Focused tests pass without PostgreSQL skips in the non-PostgreSQL run; PostgreSQL tests pass in the PostgreSQL environment.
- [ ] Frontend heartbeat is active only for eligible FTE OPS sessions and is cleaned up correctly.
- [ ] Routing is round-robin, cycle-aware, expiry-aware, and protected against duplicate active assignments.
- [ ] SeaTalk actions are cryptographically bound to the intended assignment, expire safely, and are idempotent.
- [ ] Provider outages do not lose requests and are visible to reconciliation.
- [ ] WEB and SeaTalk decisions converge on the same backend approval service and first-valid-wins behavior.
- [ ] Realtime/browser verification confirms the checkbox mirrors backend state.
- [ ] Rollout and rollback procedures are documented and tested.

## Suggested implementation order

Implement tasks 1-3 first because the schema, token contract, presence, and routing rules are prerequisites. Then implement tasks 4-6 as one vertical delivery slice, followed by task 7’s PostgreSQL/browser verification and task 8’s rollout hardening. Do not enable production SeaTalk approval before task 7 is green in a real PostgreSQL environment.
