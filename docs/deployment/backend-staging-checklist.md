# Backend Staging Checklist

Use this checklist before merging `v0/nestjs-migration` into `main`.

## 1. Configure environment variables

Set these in the staging deployment environment. Keep secrets out of Git.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SEATALK_APP_ID`
- `SEATALK_APP_SECRET`
- `SEATALK_AUTHORIZE_URL`
- `SEATALK_TOKEN_URL`
- `SEATALK_USER_URL`
- `SEATALK_REDIRECT_URI`
- `SEATALK_SUCCESS_REDIRECT`
- `APP_URL`
- `SEATALK_OUTBOX_WEBHOOK_URL`
- `GOOGLE_SHEETS_OUTBOX_WEBHOOK_URL`

## 2. Register SeaTalk callback

Register this exact URL in SeaTalk:

```text
https://<staging-domain>/auth/seatalk/callback
```

The value must match `SEATALK_REDIRECT_URI` exactly.

## 3. Deploy staging

Deploy branch `v0/nestjs-migration` to staging. Confirm the deployment uses the NestJS backend and does not start a Laravel worker.

## 4. Check readiness

```text
GET https://<staging-domain>/health/ready
```

Expected result: HTTP 200 with `status: "ready"`.

## 5. Test SeaTalk authentication

1. Open `/auth/seatalk/login`.
2. Complete SeaTalk authorization.
3. Confirm the callback succeeds.
4. Confirm an authorized profile is redirected to `SEATALK_SUCCESS_REDIRECT`.
5. Confirm unauthorized profiles are rejected.

## 6. Test outbox processing

Create a staging request that exercises each event type:

- `workflow.notification.created`
- `workflow.seatalk.provisioning.requested`
- `workflow.seatalk.synchronization.requested`
- `workflow.google_sheets.synchronization.requested`

Confirm each event is delivered once, retries on provider failure, and does not remain stuck in a retry loop.

## 7. Review logs and data

Check application logs and the outbox status endpoint for:

- failed provider calls
- missing configuration
- repeated retries
- duplicate deliveries
- permanently failed rows

## 8. Promote to production

Only after staging passes:

1. Open and review the PR from `v0/nestjs-migration` into `main`.
2. Merge the PR.
3. Deploy `main` to production.
4. Repeat readiness and smoke checks against production.

## Completion criteria

- No Laravel runtime or worker is deployed.
- `/health/ready` returns 200.
- SeaTalk login and callback succeed.
- All four outbox event types are delivered successfully.
- No unexpected retries or failed outbox rows remain.
- Production configuration contains real provider values, not placeholders.
