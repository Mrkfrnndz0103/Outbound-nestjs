# Linehaul workflow — realtime UI and request actions phase

Scope: role-specific queue data, actionable request selection, alert acknowledgment and presentation, OPS FTE bulk approval, and retry protection. The DOC Officer assignment and canonical backend transition work are covered in the previous phase reports.

## Implemented behavior

- Queue queries use the canonical backend status and fetch each actionable status for the signed-in role: OPS FTE gets pending and returned requests, FTE MM gets requested requests, DOC Officer gets docking requests without a Driver ID, and OPS PIC gets docking/docked requests plus PIC-returned rejections.
- Queue rows are deduplicated across status queries. The same queue snapshot drives actionable count and red row/card blinking. Opening or selecting an actionable item acknowledges its current version; a backend update changes the version and makes it actionable again.
- New persisted notifications arriving through the existing Supabase Realtime subscription produce a two-tone alert and toast. Initial notification loading is silent, and marking an item read does not replay an older notification. Browser audio is unlocked on first user interaction.
- Request tables show the role-specific display status. OPS FTE checkbox selection and Select All include only eligible pending approvals on the current page. Bulk approval is enabled only for selected eligible rows; the existing bulk API is used for selections of more than two.
- Bulk approval now uses the existing idempotency middleware and a stable request fingerprint, preventing an HTTP retry from processing the same batch twice.
- Updated row/card alerts use a transparent red pulse and respect the existing reduced-motion rule.

## Changed files

- `frontend/src/hooks/useQueueNotifications.ts` and `useQueueNotifications.test.ts`: role/status selection, actionable filters, versioned acknowledgment.
- `frontend/src/components/AppHeader.tsx`: realtime notification sound and first-load/replay handling.
- `frontend/src/pages/OutboundRequests.tsx`: eligible checkboxes, Select All, returned-request edit action, red alert treatment, role display status.
- `frontend/src/pages/MidmileRequests.tsx`, `frontend/src/pages/DockingConfirmation.tsx`, and `frontend/src/components/RequestTable.tsx`: queue alerts, acknowledgment, and role display status.
- `frontend/src/components/StatusBadge.tsx`, `frontend/src/components/RequestFilters.tsx`, `frontend/src/types.ts`, and `frontend/src/styles/tailwind.css`: REJECTED presentation and blink treatment.
- `frontend/src/hooks/useOutboundRequests.ts`, `backend/routes/api.php`, and `backend/tests/Feature/IdempotencyTest.php`: retry-safe bulk approval.
- Related request table, docking page, and outbound E2E tests were updated; `frontend/e2e/outbound-requests.spec.ts` covers current-page Select All and `frontend/e2e/docking-driver-assignment.spec.ts` covers the DOC flow from Phase 2.

## Verification

- Frontend unit tests: **81 passed** across 22 files.
- Backend suite: **169 passed**, 646 assertions, 17 PostgreSQL-only tests skipped.
- Production frontend build: passed with Node 22.23.3.
- Targeted Chromium browser tests: **12 passed**, including >2-item bulk approval, Select All eligibility, alert acknowledgment, and the DOC saved-assignment label path.
- Tests used local test fixtures and mocked API calls. No staging or production database was accessed or changed. No deployment, push, or commit was performed.

## Staging runtime follow-up

Follow-up read-only staging checks are recorded in [staging-runtime-verification.md](./staging-runtime-verification.md). The realtime transport accepts subscriptions, but actual role-authenticated row events remain unverified. Staging schema is missing the approved rejection-routing migration, the web app is behind Cloudflare Access, and the SeaTalk provider configuration is incomplete. That report also records a critical public-schema RLS exposure; no migration, data write, provider action, or security change was made.

## Remaining gaps and limits

- A live Supabase Realtime transport subscription passed, but role-authenticated row delivery and sound are unverified. The tested browser suite uses mocked APIs and does not prove the deployed user experience.
- Queue counts and alerts now load every page for each actionable status. Large role queues therefore require multiple API reads at initial load and on realtime invalidation.
- The user reports that Driver ID must be digits only, maximum 10 characters; backend and UI validation from Phase 2 implement that interpretation.
- This phase does not deploy or apply migrations. Continue with further workflow behavior only after the user authorizes the next phase.
