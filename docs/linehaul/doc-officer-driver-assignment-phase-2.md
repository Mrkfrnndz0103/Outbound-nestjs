# Linehaul workflow — DOC Officer assignment and label phase

Scope: DOC Officer Driver ID assignment, explicit reassignment, OPS PIC notification, and the existing printable label. The canonical request status stays `DOCKING` until OPS PIC enters the LH Trip Number. Realtime sound/blinking, other role controls, SeaTalk delivery, and live staging remain separate phases.

## Implemented behavior

- DOC Officers can assign a Driver ID only while the request is `DOCKING`. The server trims it and accepts 1–10 ASCII digits. Empty, alphanumeric, and longer values fail validation. Duplicate IDs across different requests remain allowed.
- The assignment runs in a database transaction with a row lock. It saves the ID and timestamp, records `DRIVER_ASSIGNED`, and notifies the owning OPS PIC. The request remains `DOCKING`.
- Assignment cannot overwrite an existing ID. DOC Officers must select the explicit **Reassign Driver ID** action; the dialog shows the current ID, and the server records `DRIVER_REASSIGNED` with the previous value. Both actions are restricted to DOC Officer and `DOCKING` requests.
- The web form enables **Assigned** only for a trimmed 1–10 digit value, trims before submission, and uses an operation-specific idempotency key that remains stable across a retry but differs for a new assignment attempt.
- After a successful API response, the existing `PrintableTruckLabel` opens using the saved response, including its plate, Driver ID, and dock. Print stays disabled when no Driver ID is saved. The existing label component is reused.
- SeaTalk has no DOC assignment action. OPS PIC trip entry and the `DOCKED` transition continue to require a saved Driver ID.

## Changed files

- `backend/app/Features/Requests/RequestAuthorizer.php`: DOC assignment and reassignment role/state checks.
- `backend/app/Features/Requests/RequestController.php`: HTTP validation for numeric Driver IDs and reassignment action.
- `backend/app/Features/Requests/RequestService.php`: locked assignment/reassignment, overwrite guard, audit events, and OPS PIC notification.
- `backend/routes/api.php`: exposes the explicit reassignment action through both existing API route prefixes.
- `frontend/src/pages/DockingConfirmation.tsx`: checkbox-gated assignment, validation, explicit reassignment, retry-safe idempotency, and saved-response label popup.
- `frontend/src/components/PrintableTruckLabel.tsx`: blocks printing without a saved Driver ID.
- `backend/tests/Feature/IdempotencyTest.php`, `RequestWorkflowTest.php`, and `RequestAuthorizationMatrixTest.php`: HTTP, validation, authorization, replay, state, audit, notification, trim, and overwrite coverage.
- `frontend/e2e/docking-driver-assignment.spec.ts`: checkbox-to-save-to-popup-to-print browser path.
- `frontend/e2e/printable-label.spec.ts`: prevents opening/printing an unassigned label and preserves assigned label coverage.

## Verification

- Full Laravel suite: **168 tests passed**, 638 assertions, 17 PostgreSQL-only tests skipped. The separate DOC/API regression selection passed 45 tests and 277 assertions.
- Frontend unit suite: **77 tests passed**.
- Production frontend build: passed with Node 22.23.3.
- Targeted Playwright: **13 Chromium tests passed**, including the full Driver ID save-to-print path and existing label layouts/QR behavior.
- Targeted Pint check passed for six backend PHP files. Route listing confirms the request action endpoint is registered for both versioned and legacy API prefixes. Changed-file `git diff --check` passed.
- An independent read-only review found and helped close three issues before final verification: missing reassignment route registration, raw-input HTML validation conflicting with trimming, and stale reassignment replay keys.

Tests use local disposable containers and mocked browser API calls. No staging or production database was accessed or changed. No deployment, push, or commit was made. The `soc5-Staging` SSH alias remains unresolved, so live provider behavior and staging schema are unverified.

## Remaining gaps for later phases

Realtime alerts, transparent-red blinking, notification acknowledgment, request table checkboxes and bulk approval behavior, status display updates across every role, SeaTalk assignment-cycle delivery, and live staging validation remain outstanding. The owning OPS PIC notification is persisted through the existing notifications table; its audible/realtime presentation belongs to the realtime UI phase.
