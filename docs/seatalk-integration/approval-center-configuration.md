# SeaTalk Approval Center Configuration

This document records the backend-only configuration and the provider contract
that must be confirmed before Approval Center traffic is enabled. The existing
FTE OPS web-checkbox workflow remains the authoritative approval path until the
SeaTalk app, permissions, Data Scope, callbacks, and employee mappings are
verified in a test environment.

## Rollout gate

Approval Center is disabled unless all of the following are true:

- `SEATALK_APPROVAL_ENABLED=true` is deliberately set in the backend runtime;
- `SEATALK_APP_ID` is present;
- `SEATALK_APP_SECRET` is present;
- `SEATALK_CALLBACK_SIGNING_SECRET` is present;
- `SEATALK_APPROVAL_TOKEN_SECRET` is present;
- `SEATALK_APPROVE_CALLBACK_URL` is present; and
- `SEATALK_REJECT_CALLBACK_URL` is present.

The configuration gate is server-side. Secrets and callback URLs must never be
copied into frontend environment variables, public configuration responses,
source control, screenshots, or ordinary request logs.

## Backend environment

The names below are defined in `backend/.env.example`. Empty values are
intentional placeholders; no real credential belongs in that file.

| Environment variable | Purpose | Default |
| --- | --- | --- |
| `SEATALK_APPROVAL_ENABLED` | Explicit rollout gate | `false` |
| `SEATALK_APPROVAL_TOKEN_SECRET` | Server-only secret used to bind callbacks to assignments; never expose or log it | unset |
| `SEATALK_APP_ID` | SeaTalk Workspace App ID | empty |
| `SEATALK_APP_SECRET` | Workspace App secret | empty |
| `SEATALK_CALLBACK_SIGNING_SECRET` | Secret used for event callback SHA-256 verification | empty |
| `SEATALK_APPROVAL_BASE_URL` | SeaTalk Approval Center API host | `https://openapi.seatalk.io` |
| `SEATALK_APPROVE_CALLBACK_URL` | Backend approve callback URL | empty |
| `SEATALK_REJECT_CALLBACK_URL` | Backend reject callback URL | empty |
| `SEATALK_APPROVAL_ASSIGNMENT_SECONDS` | Sequential assignment window | `180` |
| `SEATALK_PRESENCE_ACTIVE_SECONDS` | Heartbeat freshness threshold | `60` |
| `SEATALK_HTTP_CONNECT_TIMEOUT` | Provider connection timeout | `5` seconds |
| `SEATALK_HTTP_TIMEOUT` | Provider request timeout | `10` seconds |

The corresponding runtime values are under `services.seatalk.approval` in
`backend/config/services.php`. The `app_secret`, callback signing secret, and
callback URLs are server-only values; the existing SeaTalk login endpoint must
continue to return only its established OAuth fields.

## External provider-contract prerequisite

The exact current provider contract is an external prerequisite before
`SEATALK_APPROVAL_ENABLED=true` may be used. Create/get request shapes follow
SeaTalk's documented APIs. The deployment owner must obtain and retain current
SeaTalk provider or administrator confirmation for all remaining items:

| Operation | Must be externally confirmed before activation | Repository status |
| --- | --- | --- |
| Create approval item | Permissions, Data Scope, and retry behavior | Path and documented request shape implemented; validate against the tenant. |
| Get approval item | Permissions and returned response variants | Path and typed response wrapper implemented; validate against the tenant. |
| Update approval item | Exact HTTP method, endpoint path, request/response schema, permissions, and retry behavior | Contract-dependent; empty path is never called. |
| App path | Whether action button mode 2 and app path are needed | Contract-dependent; empty path is omitted and mode 2 is rejected without it. |
| Approve/reject callbacks | Registered callback URLs, exact signature canonicalization/header format, acknowledgement and retry behavior | Signature assumptions are documented in `approval-center-implementation.md`; confirm with SeaTalk before enabling. |

The existing SeaTalk login token endpoint is configured separately under
`SEATALK_TOKEN_URL`. Keep provider traffic disabled until permissions, Data
Scope, callback signature details, and tenant-specific behavior are confirmed.

## Create-item payload limits

These limits are provider limits, not local database limits. Validate or trim
local values before a future provider adapter sends them.

| Field | Limit |
| --- | --- |
| `item_id` | 30 characters |
| `applicant_name` | 50 characters |
| `item_name` | 50 characters per language |
| `item_state` | 20 characters per language |
| `title` | 100 characters per language |
| `subtitle` | 100 characters per language |
| `description` | 500 characters |
| `approval_chain` | 65,535 bytes; `approvers` maximum 100 |
| `status.text` | 50 characters per language |
| `app_path` | 500 characters; required when `action_button` is `2` |
| `approve_url` / `reject_url` | 500 characters each |
| `pending_list` / `approved_list` / `rejected_list` | Empty or maximum 100 users each |
| Approver `name` | 50 characters |
| Approver `avatar` | 200 characters |
| Approver `comment` | 500 characters |
| `TextStructure` languages | `en`, `vi`, `zh-hans`, `zh-hant`, `th`, `id`; 50 characters per language |

The provider requires `item_id`, `created_at`, `updated_at`, `applicant_name`,
`title`, `status`, `approve_url`, `reject_url`, and all three approval lists.
Timestamps are GMT+0 Unix timestamps. `employee_code` is the stable identity
for approver routing and must not be replaced by a display name or email.

## Callback signature verification

Approval decision callbacks and generic SeaTalk event callbacks have separate
signature contracts. Approve/reject uses app-secret HMAC-SHA1 and the
`Authorization` header. Its delimiter and encoding assumptions are listed in
[`approval-center-implementation.md`](approval-center-implementation.md) and
must be confirmed with SeaTalk. Generic event callbacks use the documented
`lowercase_hex_sha256(raw_request_body + callback_signing_secret)` in the
`Signature` header. Both verifiers compare in constant time and reject missing
or malformed signatures. Approval callback state processing is idempotent.

The generic event URL verification handler returns the `seatalk_challenge`
within the five-second provider deadline. The approve/reject response is
`{"code":0}` as requested by this integration contract; confirm SeaTalk's
callback-specific acknowledgement and retry behavior before enabling it.

## Permissions, Data Scope, and identity mapping

Before setting `SEATALK_APPROVAL_ENABLED=true`, the SeaTalk administrator must
confirm and retain deployment evidence for:

- Workspace App capability enabled;
- Approval Center Create Approval Item permission;
- Approval Center update permission, if the portal exposes it separately;
- the callback/event permission required for approve and reject actions;
- Data Scope covering every employee in `approval_chain`, `pending_list`,
  `approved_list`, and `rejected_list`; and
- the mobile detail-page `app_path` format and final item-ID convention.

Every active FTE OPS approver must have an exact SeaTalk `employee_code` mapped
to the local profile. Inactive profiles, missing mappings, and stale heartbeats
must not receive new assignments.

## Operator confirmation record

Complete these items before enabling provider traffic:

- [ ] SeaTalk administrator confirmed the Workspace App and App ID.
- [ ] App Secret and callback signing secret are stored only in backend secret storage.
- [ ] Approval Center permissions and Data Scope were approved.
- [ ] Staging approve and reject callback URLs were registered and verified.
- [ ] Production callback URLs were registered only after staging verification.
- [ ] The update-item endpoint and callback acknowledgement contract were confirmed.
- [ ] Mobile detail-page path and item-ID convention were confirmed.
- [ ] Employee-code mappings for eligible FTE OPS users were audited.
- [ ] Callback signature, duplicate callback, late callback, and web-wins behavior passed staging tests.

## Sources

- [SeaTalk Create Approval Item](https://open.seatalk.io/docs/create-approval-item)
- [SeaTalk Approval Center definitions](https://open.seatalk.io/docs/approval-center-definition-explanations)
- [SeaTalk Server API Event Callback](https://open.seatalk.io/docs/server-apis-event-callback)
- [`approval-center-setup-guide.md`](./approval-center-setup-guide.md)
