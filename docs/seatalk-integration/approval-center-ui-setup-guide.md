# SeaTalk Approval Center UI setup guide

This guide explains how an application administrator prepares SeaTalk Approval
Center for the Outbound application. It mirrors the setup guide available in
the authenticated application at `/settings/seatalk-approval`.

The UI reports configuration status only. App secrets, callback signing
secrets, and access tokens remain in backend-only secret storage and are never
displayed in the browser.

## What this setup enables

The runtime supports two approval channels:

- Existing web approval
- SeaTalk Approval Center approval

PostgreSQL remains the source of truth. The first valid approval or rejection
transition wins. Duplicate, late, or invalid callbacks must not change the
request state.

## Responsibility split

| Owner | Responsibility |
| --- | --- |
| SeaTalk administrator | Configure the Workspace App, Approval Center permissions, Data Scope, callback URLs, and test users |
| Application administrator | Configure backend secrets, migrations, HTTPS routing, scheduler execution, and staging verification |
| Engineer | Maintain the SeaTalk client, callbacks, migrations, routing, and automated tests |
| Product owner | Confirm approval rules and sign off the staging test results |

## 1. Open the setup page

1. Sign in with an administrator account.
2. Open **Administration > SeaTalk Setup** in the sidebar.
3. Confirm that the **Backend readiness** section loads successfully.
4. Select **Refresh status** after changing backend configuration.

The page displays three safe status values:

- **Workspace app**: the SeaTalk app ID and app secret are configured on the
  backend.
- **Approval callbacks**: callback URLs and the callback signing secret are
  configured.
- **Feature flag**: `SEATALK_APPROVAL_ENABLED` is enabled.

The setup page does not display any secret value.

## 2. Prepare the SeaTalk Workspace App

In SeaTalk Open Platform:

1. Select the Workspace App used by the Outbound application.
2. Enable Approval Center.
3. Request permission to create approval items.
4. Request permission to update approval items if the portal exposes it
   separately.
5. Request the callback or event permission required for approve and reject
   actions.
6. Submit the permission request for organization-admin approval.
7. Record the App ID and App Secret in the backend secret store.

Approval Center items must be usable from the SeaTalk mobile client. Confirm
that the request detail destination opens the correct application request and
still enforces normal application authorization.

Reference: [SeaTalk Approval Center overview](https://open.seatalk.io/docs/overview-of-approval-center).

## 3. Configure Data Scope

Configure the Workspace App Data Scope to include:

- Every applicant or employee represented in an approval item
- Every active FTE OPS approver
- Every employee that can appear in the approval chain
- Employees represented in pending, approved, or rejected lists

An incomplete Data Scope can cause valid approval items or employee details to
fail at the provider boundary.

Save the permission and Data Scope configuration as deployment evidence.

## 4. Register callback URLs in SeaTalk Open Platform

Register both URLs in the SeaTalk Open Platform console:

1. Open the Workspace App used by the Outbound application.
2. Open the **Approval Center** configuration or the app's
   **Callback/Event settings**.
3. Add the approve callback under the callback or event action for approving an
   item.
4. Add the reject callback under the callback or event action for rejecting an
   item.
5. Save or submit the configuration for organization-admin approval if the
   portal requires it.

The exact menu label can vary by SeaTalk tenant and portal version. The
important distinction is that these URLs belong in the SeaTalk app's
server-callback configuration. They are not browser routes, frontend
environment variables, or values entered on the Outbound setup page.

Register both public HTTPS callbacks for the target environment:

```text
https://<api-host>/api/v1/integrations/seatalk/approval/approve
https://<api-host>/api/v1/integrations/seatalk/approval/reject
```

For example:

```text
https://staging.example.com/api/v1/integrations/seatalk/approval/approve
https://staging.example.com/api/v1/integrations/seatalk/approval/reject
```

The callback endpoints must meet all of the following requirements:

- Public DNS resolves to the API host.
- TLS is valid and the URL uses HTTPS.
- Requests reach the NestJS API without frontend routing interference.
- The endpoint responds within the SeaTalk callback timeout.
- The backend verifies the signature against the exact raw request body.
- Callback bodies, authorization headers, and secrets are not written to
  ordinary logs.

Do not register production callbacks until the endpoints exist and signature
verification has passed in staging.

## 5. Configure matching backend environment values

After registering the URLs in SeaTalk, configure the same URLs in the NestJS
backend environment. These values tell the application which public callback
addresses it owns:

Set the following values in the backend deployment environment or secret
store. Do not place these values in frontend variables, commit real values,
or expose them through a public configuration endpoint.

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

Keep `SEATALK_APPROVAL_ENABLED=false` until the staging verification is
complete.

After changing values:

1. Confirm only the backend process can read the secrets.
2. Confirm secrets are redacted from logs and error pages.
3. Restart the backend process.
4. Open the UI setup page and refresh the readiness status.

## 6. Apply database prerequisites

Apply migrations through:

```text
023_seatalk_callback_events.sql
```

The migrations add:

- `profiles.seatalk_employee_code`
- `profiles.last_seen_at`
- Canonical approval fields on `requests`
- Approval Center item and assignment tables
- Callback replay protection

Every enabled FTE OPS approver must have:

- `role = 'fte_ops'`
- `is_active = true`
- A unique `seatalk_employee_code`
- A fresh `last_seen_at` heartbeat

Do not route approvals by display name alone. Use the exact SeaTalk employee
code.

## 7. Verify runtime behavior in staging

Deploy the backend and migrations with the feature disabled. Then verify:

1. The setup page reports the expected Workspace App configuration.
2. The setup page reports callback configuration as ready.
3. Both callback routes are reachable over HTTPS.
4. At least three mapped FTE OPS test users have active presence heartbeats.
5. One OPS PIC test user can create a request.
6. A created request produces one active assignment and one Approval Center
   item.
7. Approving from SeaTalk changes:
   - `requests.approval_status` to `APPROVED`
   - `requests.approval_source` to `SEATALK`
   - One callback event to processed
8. Rejecting from SeaTalk produces the expected rejected state.
9. Duplicate callbacks are acknowledged without a second state transition.
10. Late callbacks, inactive approvers, and expired assignments behave as
    expected.
11. Provider failures remain failed or pending and never approve a request.

Only after these checks pass should the backend be restarted with:

```env
SEATALK_APPROVAL_ENABLED=true
```

## 8. Runtime behavior to expect

- New requests are provisioned after their database insert.
- A periodic scanner recovers requests missed during a restart.
- Expired assignments are rerouted to the next eligible approver.
- The eligible approver with the oldest previous assignment is selected.
- Only users with a heartbeat inside
  `SEATALK_PRESENCE_ACTIVE_SECONDS` are eligible.
- Provider access tokens are cached until shortly before expiry.
- Callback signatures are verified before parsing or database mutation.
- Callback event hashes prevent replay processing.
- The first valid web or SeaTalk transition wins through row locking and
  `approval_status = 'PENDING'` checks.

The built-in interval is suitable for one API instance and staging. In
multi-instance production, run only one scheduler instance or move `tick()` to
a singleton scheduled job or queue worker.

## 9. Operations and troubleshooting

Monitor:

- Failed `seatalk_approval_items`
- Failed assignments
- Stale pending requests
- Callback events that remain in `RECEIVED`
- Scheduler health

### Secret rotation

1. Set `SEATALK_APPROVAL_ENABLED=false`.
2. Rotate the App Secret and callback signing secret in backend-only storage.
3. Update SeaTalk permissions, Data Scope, or callback URLs if required.
4. Restart the backend.
5. Verify a signed callback in staging.
6. Re-enable the feature only after provider create and callback tests pass.

### Callback replay or signature investigation

Search `seatalk_callback_events` by:

- Event ID
- Provider item ID
- Request ID
- Employee code

Duplicate event IDs should be acknowledged without applying a second approval.
Invalid signatures must be rejected before controller handling.

## Related documentation

- [NestJS runtime guide](./approval-center-nestjs-runtime.md)
- [SeaTalk Approval Center setup guide](./approval-center-setup-guide.md)
- [SeaTalk Approval Center runbook](./approval-center-runbook.md)
- [SeaTalk Approval Center implementation](./approval-center-implementation.md)
