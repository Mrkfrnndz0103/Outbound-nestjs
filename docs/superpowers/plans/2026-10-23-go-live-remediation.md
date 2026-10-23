# Go-live audit remediation implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks and test each behavior before integration.

**Goal:** Apply all twelve required source fixes from the 23 October go-live audit without deploying or altering live data.

**Architecture:** Keep the existing Laravel/React/Supabase workflow. Bind provider deliveries to distinct durable lifecycle identities, isolate browser data at authentication boundaries, make exhausted recovery obey the strict database constraint, and establish one complete dependency-ordered deployment procedure. Preserve actual role/ownership checks and actionable queue semantics.

**Tech Stack:** Laravel 12/PHP 8.3, React 19/TanStack Query, PostgreSQL/Supabase, Linux Docker.

**Spec:** Go-live findings GL-01 through GL-12 in `C:/Users/SPXPH4227/security-audit-skill/soc5-outbound/run-2/go-live-findings.json`; user explicitly authorized implementing all required fixes.

## Global constraints

- No commit, push, deployment, live migration, provider call or credential disclosure.
- Use synthetic identities and local fixtures for verification. Audit-only execution restrictions do not substitute for the implementation task's local regression verification.
- Do not invent a SeaTalk provider endpoint or claim provider interoperability from mocks.
- Keep one owner per file; integration and shared checks run centrally.

## Review focus

- Rejection/resubmission after completed provider work still delivers; repeated delivery of the same event remains deduplicated.
- Rerouted active approvals retain the replacement assignment's token, including reconciliation.
- Logout during in-flight fetch and failed next-account refetch cannot expose previous principal data.
- Abandoned final attempts obey Supabase's attempts cap and dead-letter without handler execution.
- Fresh and existing-schema upgrade procedures respect dependency order and preserve backend-table RLS.

## Task 1: Provider lifecycle and backend identity/recovery flows (GL-01/02/05/09/10)

Files: WorkflowSeaTalkOutbox, ApprovalRouter/Service and callers as necessary, ApprovalItemSynchronizer/Provisioner, ReconcileSeaTalkApprovals, VerifyProductionConfig, AuthenticateSupabase, UserController and focused backend tests.

- [x] Add failing durable lifecycle, active callback-token, required-config, DOC reset and cookie-preview regressions.
- [x] Use stable assignment/event/revision delivery identities; reconcile divergent terminal local items; preserve one-time token validation.
- [x] Reject ineffective required provider settings; align supported auth-mode role preview and DOC password reset.
- [x] Pass focused tests and report interfaces changed for integration review.

## Task 2: Frontend principal isolation and reachable DOC operations (GL-03/08/09)

Files: App/main, query/auth context helpers, protected query consumers, Dashboard/Overview, DockingConfirmation, UserManagement and frontend regression/E2E tests.

- [x] Demonstrate previous-principal cache/preview behavior and missing assigned-DOC lookup/reset UI.
- [x] Isolate protected cache by principal/effective role, synchronously hide old identity data and cancel/remove in-flight work at auth boundaries; use explicit demo-only preview values.
- [x] Provide a bounded assigned-driver lookup independently of the actionable queue, preserving cursor behavior; expose DOC reset.
- [x] Verify account-switch/logout, assigned driver reload/reassign and DOC recovery paths.

## Task 3: Deployment/schema configuration (GL-06/07/12)

Files: migration manifest and validation gate, production fresh/upgrade helper/runbook, obsolete staging helper, Compose overlays/session/cache settings and related verification.

- [x] Fail a manifest completeness regression before fixing omissions.
- [x] Use a history-aware explicit production migration process with correct Supabase/Laravel interleaving and no CI auth stubs.
- [x] Select durable shared session/cache storage in production profile and preflight; document actual worker/scheduler and rollback requirements.
- [x] Coordinate any parent outbox forward migration into manifest and verify local fresh/upgrade paths.

## Task 4: Bounded backend recovery and export (GL-04/11)

Files: WorkflowOutboxRepository/ProcessWorkflowOutbox and recovery tests; GoogleSheetsRequestSync and export tests; any necessary forward constraint alignment migration.

- [x] Reproduce exhausted abandoned lease under strict attempts constraint and export admission/event cardinality gaps.
- [x] Atomically dead-letter exhausted due/stale work without claiming an extra attempt; preserve stale-worker fencing.
- [x] Bound request admission before materialization and retrieve only needed event data in bounded batches; document cap/window behavior.
- [x] Verify focused SQLite and actual disposable PostgreSQL checks.

## Integration

- [x] Independently review all tasks and combined source, resolve meaningful findings.
- [x] Run integrated backend/frontend suites, TypeScript/lint/build and affected browser E2E; run local PostgreSQL migration/recovery/RLS checks.
- [x] Update remediation report mapping every GL ID to code, fresh evidence and remaining live-only gates.
- [x] Keep go-live conditional on actual Linux image, production schema/configuration, isolated SeaTalk acceptance and backup/restore evidence.
