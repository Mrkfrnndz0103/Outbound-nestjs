# Linehaul workflow validation — 22 October 2026

This supersedes the earlier feature matrix for the repository implementation.
Verification below is local. Staging and live SeaTalk configuration/provider E2E
remain deferred at the user's request.

| Feature | Current status | Evidence | Remaining gap |
| --- | --- | --- | --- |
| OPS PIC request submission | Implemented and browser verified | `frontend/src/pages/OutboundRequests.tsx`, `frontend/src/components/OutboundRequestForms.tsx`, `frontend/e2e/workflow-completion.spec.ts` | None in the tested local flow. |
| Automatic OPS FTE routing | Implemented; local tests pass | `backend/app/Features/Approvals/ApprovalRouter.php`, `backend/tests/Feature/ApprovalRoutingTest.php` | Live provider delivery deferred. |
| OPS FTE approve | Implemented and browser verified | `frontend/src/pages/OutboundRequests.tsx`, `frontend/e2e/outbound-requests.spec.ts` | None in the tested local flow. |
| OPS FTE edit/reject/cancel | Implemented with mandatory remarks | `frontend/src/components/request/OutboundEditDialog.tsx`, `frontend/src/components/request/OutboundRequestOverlays.tsx`, `backend/app/Features/Requests/RequestService.php` | None in the tested local flow. |
| Bulk approval / Select All | Implemented and browser verified | `frontend/src/hooks/useOutboundRequests.ts`, `frontend/e2e/outbound-requests.spec.ts` | Two or more selections use the atomic bulk endpoint; a single selection uses the single-approval endpoint. |
| FTE MM assignment | Active page wired; local tests pass | `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/MidmileRequests.tsx`, `backend/tests/Feature/RequestWorkflowTest.php` | Live environment verification deferred. |
| FTE MM reject/cancel | Implemented; cancellation browser verified | `frontend/src/components/request/MidmileActionDialog.tsx`, `frontend/src/pages/MidmileRequests.tsx`, `frontend/e2e/workflow-completion.spec.ts` | Cancellation requires nonblank remarks and preserves the dialog on API failure. |
| DOC Officer driver assignment | Active route and browser flow verified | `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/DockingConfirmation.tsx`, `frontend/e2e/docking-driver-assignment.spec.ts` | None in the tested local flow. |
| Printable Truck Label | Active assignment-to-label flow browser verified | `frontend/src/components/PrintableTruckLabel.tsx`, `frontend/e2e/docking-driver-assignment.spec.ts` | Physical printer output is outside local browser verification. |
| Driver ID / LH Trip sequencing | Implemented; backend tests pass | `backend/app/Features/Requests/RequestService.php`, `backend/tests/Feature/RequestWorkflowTest.php` | None in the tested local flow. |
| Post-DOCKED OPS PIC edits | Real form/mutation connected and browser verified | `frontend/src/pages/OutboundRequests.tsx`, `frontend/e2e/outbound-requests.spec.ts` | Owner-only editing remains enforced. |
| Authoritative status model | Implemented; role display kept separate | `backend/app/Features/Requests/RequestStatus.php`, `frontend/src/components/RequestTable.tsx`, `frontend/src/components/request/OutboundRequestOverlays.tsx` | None in the tested local flow. |
| Rejection versus cancellation | Separate states and saved reasons surfaced | `frontend/src/components/request/RequestDecisionRemarks.tsx`, `frontend/e2e/workflow-completion.spec.ts` | None in the tested local flow. |
| Realtime request synchronization | Active pages browser verified with simulated Supabase events | `frontend/src/hooks/useRequestRealtime.ts`, `frontend/e2e/realtime-workflow.spec.ts` | Hosted delivery and authenticated RLS/event delivery remain deferred. |
| Alert sound / acknowledgment | Implemented and browser verified | `frontend/src/lib/notificationSound.ts`, `frontend/src/hooks/useQueueNotifications.ts`, `backend/app/Features/Notifications/NotificationController.php` | Audio requires browser user activation. Row acknowledgment is version-local; notification read receipts persist per user on the server. |
| Transparent-red blinking rows | Active OPS FTE, FTE MM, and DOC pages verified | `frontend/src/styles/tailwind.css`, `frontend/e2e/realtime-workflow.spec.ts` | New request versions re-alert; receipt failures restore the alert for retry. |
| SeaTalk synchronization | Local adapter/callback tests pass | `backend/tests/Unit/SeaTalkApprovalCenterAdapterTest.php`, `backend/tests/Feature/SeaTalkApprovalCallbackTest.php` | Provider contract, isolated app configuration, and live E2E deferred. |
| Supabase schema/RLS/realtime | Repository migrations verified locally | `backend/tests/Feature/RequestWorkflowMigrationTest.php`, `backend/tests/Feature/BackendSupportTablesSecurityMigrationTest.php`, `scripts/ci/apply-postgres-migration-chain.sh` | No staging deployment or verification performed. Local PostgreSQL was 18.6, not hosted PostgreSQL 17. |

## Fresh verification

- Frontend: 125 tests passed across 36 files.
- Backend non-PostgreSQL suite: 192 tests passed, 753 assertions; `--fail-on-skipped` passed.
- Browser regression: 29 tests passed, including OPS PIC creation, cancellation retry, rejection remarks, request-scoped read receipts, and realtime acknowledgment failure/recovery.
- TypeScript, Biome lint, Oxlint, targeted Pint checks, source/API checks, and Vite production build passed.
- Earlier in this session, all 21 previously skipped PostgreSQL tests passed with 141 assertions. The complete migration chain and post-migration rejection-routing/RLS checks passed in separate temporary local databases. The temporary PostgreSQL server was shut down afterward.

The new `PATCH /api/v1/notifications/read-request` route (also available under
the existing legacy API prefix) validates `request_id`, marks only notifications
visible to the authenticated user for that request, and uses per-user receipts
for role notifications. A 55-notification regression test proves acknowledgment
does not depend on the 50-item notification list limit or mark colleagues' work
read.
