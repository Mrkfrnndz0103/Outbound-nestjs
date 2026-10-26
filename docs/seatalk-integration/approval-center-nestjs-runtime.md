# SeaTalk Approval Center NestJS runtime setup

The NestJS runtime now provisions Approval Center items, assigns active FTE OPS users, processes signed approve/reject callbacks idempotently, and reroutes expired assignments. PostgreSQL remains the source of truth.

## 1. SeaTalk Open Platform

1. Select the Workspace App used by this system.
2. Enable Approval Center and obtain approval to create approval items and receive action callbacks.
3. Include every applicant and FTE OPS approver in the app Data Scope.
4. Register public HTTPS callbacks:
   - `https://<api-host>/api/v1/integrations/seatalk/approval/approve`
   - `https://<api-host>/api/v1/integrations/seatalk/approval/reject`
5. Retain the App ID, App Secret, and callback/event signing secret in backend-only secret storage.

## 2. Database prerequisites

Apply migrations through `023_seatalk_callback_events.sql`. They add:

- `profiles.seatalk_employee_code` and `profiles.last_seen_at`;
- canonical approval fields on `requests`;
- Approval Center item and assignment tables;
- callback replay protection.

Every enabled FTE OPS approver must have:

- `role = 'fte_ops'`;
- `is_active = true`;
- a unique `seatalk_employee_code`;
- a fresh `last_seen_at` heartbeat.

## 3. Backend environment

```env
SEATALK_APPROVAL_ENABLED=false
SEATALK_BASE_URL=https://openapi.seatalk.io
SEATALK_APP_ID=<workspace-app-id>
SEATALK_APP_SECRET=<workspace-app-secret>
SEATALK_CALLBACK_SIGNING_SECRET=<event-callback-secret>
SEATALK_TOKEN_URL=https://openapi.seatalk.io/auth/app_access_token
SEATALK_APPROVAL_CREATE_PATH=/approval_center/v2/create
SEATALK_APPROVE_CALLBACK_URL=https://<api-host>/api/v1/integrations/seatalk/approval/approve
SEATALK_REJECT_CALLBACK_URL=https://<api-host>/api/v1/integrations/seatalk/approval/reject
SEATALK_APPROVAL_ASSIGNMENT_SECONDS=180
SEATALK_PRESENCE_ACTIVE_SECONDS=60
SEATALK_RUNTIME_INTERVAL_MS=60000
SEATALK_HTTP_TIMEOUT_MS=10000
```

Keep `SEATALK_APPROVAL_ENABLED=false` until callbacks, permissions, Data Scope, and signatures pass staging verification. Secrets must never use a frontend/public environment prefix.

## 4. Runtime behavior

- New requests call the runtime provisioner after their database insert.
- A periodic in-process scanner recovers requests missed during restarts and reroutes expired assignments.
- The eligible approver with the oldest previous assignment is selected, providing sequential round-robin behavior.
- Only users with a heartbeat inside `SEATALK_PRESENCE_ACTIVE_SECONDS` are eligible.
- Provider access tokens are cached until shortly before expiry.
- Callback signatures are verified against the exact raw body before parsing or database mutation.
- Callback event hashes provide replay protection; late or duplicate actions are acknowledged without changing the request.
- The first valid web or SeaTalk transition wins through row locking and `approval_status = 'PENDING'` checks.

The built-in interval is suitable for one API instance and staging. In a multi-instance production deployment, run only one scheduler instance or move `tick()` to the platform's singleton scheduled job/queue worker. Database row locks and uniqueness constraints remain the final concurrency safeguards.

## 5. Deploy and verify

1. Deploy the migrations and backend with the feature disabled.
2. Confirm `/api/v1/integrations/seatalk/config` reports approval configuration as ready for an authenticated administrator.
3. Confirm callback routes are externally reachable over HTTPS.
4. Add three mapped test FTE OPS users and keep their presence heartbeats active.
5. Enable `SEATALK_APPROVAL_ENABLED=true` and restart the backend.
6. Create a request and verify one active assignment and one Approval Center item.
7. Approve from SeaTalk and confirm `requests.approval_status = 'APPROVED'`, `approval_source = 'SEATALK'`, and one processed callback event.
8. Repeat with reject, duplicate callbacks, a late callback, an inactive approver, and a three-minute timeout.
9. Verify provider failures remain failed/pending and never mutate a request to approved.

## 6. Operations

Monitor failed `seatalk_approval_items`, failed assignments, stale pending requests, callback events that remain `RECEIVED`, and scheduler health. Rotate secrets through backend secret storage, restart the process, and re-run signature verification before restoring the feature flag.
