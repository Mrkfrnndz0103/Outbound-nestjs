# SeaTalk Approval Center integration

## Existing implementation

The backend reuses these typed integration models and clients:

- `backend/app/Integrations/SeaTalk/ApprovalItemPayload.php` validates and
  serializes a create/update item payload.
- `backend/app/Integrations/SeaTalk/ProviderItemResult.php` wraps a provider
  response and exposes its item and response ID.
- `backend/app/Integrations/SeaTalk/SeaTalkApprovalCenterAdapter.php` posts
  creates to `SEATALK_APPROVAL_CREATE_PATH` and gets items from
  `SEATALK_APPROVAL_DETAIL_PATH`.
- `backend/app/Integrations/SeaTalk/SeaTalkTokenProvider.php` caches app access
  tokens by app ID until shortly before expiry.
- `backend/config/services.php` keeps assignment/presence values and explicit
  connect/request timeouts configurable. Defaults are 5 and 10 seconds.

An empty update path causes an explicit contract error before any HTTP call. An
empty app path is omitted; it is only required when `action_button` is `2`.
Neither empty path is replaced with an inferred URL.

## Callback contracts and assumptions

Approve and reject callbacks use app-secret HMAC-SHA1 verification. The input
string implemented here is seven UTF-8 fields joined with LF (`\n`):

```text
UPPERCASE_METHOD
PATH_ONLY
CONTENT_TYPE
LOWERCASE_HEX_MD5_OF_RAW_BODY
DATE_HEADER_VALUE
X-TOKEN_HEADER_VALUE
RFC3986_QUERY_WITH_KEYS_SORTED
```

Query pairs are decoded and re-encoded using RFC 3986, then the encoded
`key=value` pairs are sorted lexically; duplicate parameters are preserved.
The query is empty when no parameters are present. The
signature is `base64(HMAC-SHA1(app_secret, canonical_string))` and the
`Authorization` header is expected to contain that base64 value by itself.
When there is no query, the final empty query field leaves a trailing LF.
Signature comparison is constant-time. These separators, encodings, and
header-value format are explicit implementation assumptions because the
available SeaTalk callback material does not fully specify them. Confirm the
format with SeaTalk and adjust the canonicalizer if their contract differs
before enabling Approval Center callback traffic.

The existing approval callback endpoints are:

- `POST /api/v1/integrations/seatalk/approval/approve`
- `POST /api/v1/integrations/seatalk/approval/reject`

Valid callbacks are processed synchronously and return exactly `{"code":0}`.
The event callback endpoint is separate:

- `POST /api/v1/integrations/seatalk/events`

It authenticates the exact raw body with lowercase hexadecimal
`SHA-256(body + SEATALK_CALLBACK_SIGNING_SECRET)`. For
`event_type=event_verification`, it responds with
`{"seatalk_challenge":"<the exact challenge>"}`. It performs no provider or
database calls and is designed to return well within SeaTalk's five-second
verification window.

## Setup

Copy `backend/.env.example` to a private runtime `.env` and set credentials
there, outside version control. Configure the documented create and get paths
from that example. Leave `SEATALK_APPROVAL_UPDATE_PATH` and
`SEATALK_APPROVAL_APP_PATH` empty until SeaTalk confirms their contracts.
Keep `SEATALK_APPROVAL_ENABLED=false` until the tenant's permissions, Data
Scope, callback registration, employee mapping, and signature canonicalization
are confirmed. The app secret and event signing secret are separate settings;
neither belongs in frontend configuration.

## cURL examples

The following requests use environment placeholders and must be sent only to a
SeaTalk test app. Do not put secrets in shell history or logs.

Get an app access token (credentials and response fields match the backend's
existing token provider):

```sh
curl --fail-with-body --connect-timeout 5 --max-time 10 \
  -H 'Content-Type: application/json' \
  -d '{"app_id":"'"$SEATALK_APP_ID"'","app_secret":"'"$SEATALK_APP_SECRET"'"}' \
  'https://openapi.seatalk.io/auth/app_access_token'
```

Exchange a SeaTalk login code for an employee:

```sh
curl --fail-with-body --connect-timeout 5 --max-time 10 \
  -H "Authorization: Bearer $SEATALK_APP_ACCESS_TOKEN" \
  'https://openapi.seatalk.io/open_login/code2employee?code=URL_ENCODED_LOGIN_CODE'
```

Create an approval item. The shown fields follow the repository's copy of the
SeaTalk create-item example; replace the callback URLs with registered test
URLs and supply the real item data:

```sh
curl --fail-with-body --connect-timeout 5 --max-time 10 -X POST \
  -H "Authorization: Bearer $SEATALK_APP_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"item_id":"test_item_id","applicant_name":"Test","action_button":1,"created_at":1632912334,"updated_at":1632912334,"title":{"en":"Test Title"},"approval_chain":{"approvers":[]},"status":{"state":0,"text":{"en":"Pending"}},"approve_url":"https://YOUR_TEST_HOST/api/v1/integrations/seatalk/approval/approve","reject_url":"https://YOUR_TEST_HOST/api/v1/integrations/seatalk/approval/reject","pending_list":[],"approved_list":[],"rejected_list":[]}' \
  'https://openapi.seatalk.io/approval_center/v2/create'
```

Get an approval item:

```sh
curl --fail-with-body --connect-timeout 5 --max-time 10 \
  -H "Authorization: Bearer $SEATALK_APP_ACCESS_TOKEN" \
  'https://openapi.seatalk.io/approval_center/v2/get?item_id=test_item_id'
```

Test approve/reject callbacks against a local or staging test instance. Generate
the signature over the exact body bytes, method, path, content type, date,
x-token, and sorted query under the canonical format above. This shell example
uses an injected app secret and posts an **example test payload**; it does not
contact SeaTalk:

```sh
BODY='{"item_id":"test_item_id","employee":{"employee_code":"test_employee"}}'
DATE='Tue, 13 Oct 2026 12:00:00 GMT'
TOKEN='test-callback-token'
PATH_ONLY='/api/v1/integrations/seatalk/approval/approve'
BODY_MD5=$(printf '%s' "$BODY" | openssl dgst -md5 | awk '{print $NF}')
CANONICAL=$(printf 'POST\n%s\napplication/json\n%s\n%s\n%s\n' \
  "$PATH_ONLY" "$BODY_MD5" "$DATE" "$TOKEN")
SIGNATURE=$(printf '%s' "$CANONICAL" | openssl dgst -sha1 -hmac "$SEATALK_APP_SECRET" -binary | openssl base64 -A)
curl --fail-with-body --max-time 10 -X POST "http://127.0.0.1:8000$PATH_ONLY" \
  -H 'Content-Type: application/json' -H "Date: $DATE" -H "x-token: $TOKEN" \
  -H "Authorization: $SIGNATURE" --data-binary "$BODY"
```

For rejection, use `/api/v1/integrations/seatalk/approval/reject` and add a
non-empty `reason` to the JSON before calculating its signature. The callback
must refer to a valid item and active approval assignment to change workflow
state; a cryptographically valid but inapplicable event is safely acknowledged
by the existing idempotent callback processor.

## Contract-dependent paths and examples

SeaTalk's local documentation covers create and get, but this repository has
no confirmed update operation schema or path. Therefore no update payload or
cURL example is provided, and the adapter will not call an empty update path.
The app path is optional for the documented action button mode `1`; it is
required for mode `2`. With an empty configured app path, the adapter omits the
field, and the existing payload validation rejects mode `2` rather than
inventing an app URL.

Assignment timeout and presence freshness are independently configurable with
`SEATALK_APPROVAL_ASSIGNMENT_SECONDS` and `SEATALK_PRESENCE_ACTIVE_SECONDS`.
Provider HTTP uses explicit 5-second connect and 10-second request timeouts.
The current client does not retry; therefore it cannot replay a non-transient
provider response. If retry is added later, restrict it to transient failures
and preserve request idempotency.

## Security checklist

- Store the app secret and callback signing secret in backend-only secret
  storage; never put them in frontend environment or logs.
- Keep Approval Center disabled until callback signature canonicalization,
  callback URLs, tenant permissions, and Data Scope are confirmed.
- Serve registered callback URLs over HTTPS and keep the existing callback
  rate limit enabled.
- Verify signatures over raw request bytes before parsing or changing state.
- Preserve transactional/idempotent approval event processing and constant-
  time signature comparison.
- Use only configured provider paths; keep update/app paths empty until their
  contracts are confirmed.
