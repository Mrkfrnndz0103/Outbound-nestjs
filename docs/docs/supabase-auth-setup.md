# Supabase Auth Setup — SOC 5 Outbound

This guide configures the hosted Supabase Auth service used by this repository.
It was written for the current Supabase Dashboard navigation as of June 2026.
Supabase sometimes moves settings within the **Authentication** section; when a
named page is not directly visible, expand **Authentication > Configuration**.

The application supports two authentication paths:

- **FTE:** an allowlisted `@spxexpress.com` email uses Google or receives a
  configurable 6-to-10-digit email OTP.
- **Backroom:** an FTE-created account signs in with an OPS ID and password. The
  initial password must be replaced immediately after the first login.

## 1. Prerequisites

You need:

- Owner or Administrator access to the Supabase project.
- Access to the project's SQL Editor.
- An SMTP provider that is permitted to deliver to `@spxexpress.com`.
- The project URL, publishable key, secret/service-role key, and PostgreSQL
  connection details.

The secret/service-role key belongs only in `backend-nest/.env`. Never place it
in a frontend environment variable, browser code, screenshot, ticket, or commit.

## 2. Create or select the Supabase project

1. Sign in at the [Supabase Dashboard](https://supabase.com/dashboard).
2. Open the organization and select the intended project.
3. Wait until the database and API services report healthy.
4. Open **Project Settings > API Keys** (in some projects this is displayed as
   **Settings > API Keys**) and record:
   - Project URL
   - Publishable key (`sb_publishable_...`) or legacy `anon` key
   - Secret key (`sb_secret_...`) or legacy `service_role` key
5. Open **Connect** or **Project Settings > Database** and copy the transaction
   pooler URI used as the NestJS `DATABASE_URL`.

## 3. Apply the database files

Apply **every** SQL file under `supabase/migrations/` in ascending filename
order. Do not stop at migrations 001–005: later migrations contain current RLS,
auth hardening, request workflow, SeaTalk Approval Center, callback-event,
presence, Realtime, and reporting support required by the NestJS runtime.

For a fresh project:

1. Apply `001_initial_schema.sql` through `004_google_fte_auth.sql` in filename
   order.
2. Apply `docs/outbound/users-seed.sql` so eligible FTE emails exist before their
   first OTP request.
3. Continue with every remaining migration in filename order, including files
   with timestamp prefixes.
4. Apply `docs/outbound/clusters-seed.sql` after the schema migrations complete.

Migration 003 creates the FTE provisioning trigger. Keep each migration atomic
and stop on the first SQL error; do not skip a failed file and continue.

Verify the installation:

```sql
select to_regclass('public.profiles') as profiles,
       to_regclass('public.user_imports') as user_imports;

select trigger_name, event_object_schema, event_object_table
from information_schema.triggers
where trigger_name = 'provision_staged_fte_after_auth_insert';

select role, count(*)
from public.user_imports
where is_active
group by role
order by role;
```

Expected results:

- `profiles` and `user_imports` are not null.
- The provisioning trigger is attached to `auth.users`.
- Active `fte_ops` rows are present in `user_imports`.

## 4. Enable the Email provider and first-time signup

1. Open **Authentication > Providers**.
2. Select **Email**.
3. Turn on **Enable Email provider**.
4. Turn on **Allow new users to sign up**.
5. Leave **Confirm email** enabled if it is shown.
6. Save the settings.

First-time signup must be enabled because a seeded FTE is initially an
allowlist record, not an `auth.users` record. `signInWithOtp` creates the Auth
identity on the first request. Migration 003 allows an application profile only
when the normalized email is an active `fte_ops` or `fte_mm` allowlist entry.

Do not disable signup after the first FTE logs in: every other staged FTE still
needs to create an Auth identity on first use.

## 5. Configure URL settings

1. Open **Authentication > URL Configuration**.
2. Set **Site URL**:
   - Local: `http://localhost:5173`
   - Production: `https://soc5outboundops.app`
3. Under **Redirect URLs**, add the URLs used by each environment, for example:
   - `http://localhost:5173/**`
   - `https://soc5outboundops.app/**`
4. Save.

The current UI verifies a typed OTP and does not depend on an email redirect.
Correct URL configuration is still required for future recovery emails, invite
links, or magic-link fallback behavior. Use exact production URLs instead of a
broad wildcard.

## 5A. Configure Google login for FTE users

For the complete current Google Console walkthrough, exact project values,
production checklist, and troubleshooting, follow
[`docs/google-login-setup.md`](google-login-setup.md). The summary below is kept
for quick reference.

Google login still uses the `user_imports` allowlist. Selecting an
`@spxexpress.com` Google account is not sufficient by itself: migration 004
rejects new Google identities unless the email belongs to an active `fte_ops`
or `fte_mm` row. The NestJS API performs the same effective check on every
request by requiring an active profile. Backroom users continue to use OPS ID and
password; the Google button is shown only on the FTE tab.

### Google Auth Platform

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview)
   and select or create the project that will own the OAuth application.
2. Under **Branding**, configure the application name, support email, authorized
   domains, and contact email.
3. Under **Audience**, choose the audience permitted by your Google Workspace
   policy. Prefer **Internal** when the Cloud project belongs to the same
   Workspace organization as `spxexpress.com`; otherwise use **External** and
   complete the required testing/publishing process.
4. Under **Data Access**, retain only the scopes Supabase requires: `openid`,
   email, and profile.
5. Under **Clients**, create an **OAuth client ID** with application type
   **Web application**.
6. Add the application origins, without a trailing path:
   - `http://localhost:5173`
   - `https://soc5outboundops.app`
7. In Supabase, open **Authentication > Sign In / Providers > Google** and copy
   the callback URL shown there. Add that exact value under Google's
   **Authorized redirect URIs**. For hosted Supabase it normally has this form:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

8. Create the client and securely copy its Client ID and Client Secret.

### Supabase Dashboard

1. Open **Authentication > Sign In / Providers > Google**.
2. Enable Google, paste the Web client ID and client secret, and save.
3. Confirm **Authentication > URL Configuration** contains the local and
   production URLs from section 5. The frontend sends its current origin as
   `redirectTo`, and Supabase accepts only configured redirect URLs.
4. Do not add the Google client secret to either application `.env` file. It is
   stored only in the Supabase provider configuration.

The frontend passes Google's `hd=spxexpress.com` parameter to make the account
chooser favor the company domain. This is a user-interface hint, not an access
control. The database allowlist and backend profile check enforce access.

## 6. Configure Cloudflare Email Service SMTP

Supabase's built-in mailer is only suitable for initial testing. Configure
Cloudflare Email Service before editing the Magic Link template; the Supabase
Dashboard may keep custom email-template controls unavailable until custom SMTP
is enabled.

Cloudflare Email Sending and authenticated SMTP are currently beta features.
Sending to arbitrary FTE addresses requires the **Workers Paid** plan. The plan
includes 3,000 outbound emails per Cloudflare account per month; review current
pricing and quotas before production rollout. Sending only to destination
addresses verified in the Cloudflare account can be tested without enabling
arbitrary-recipient sending.

### 6.1 Enable Email Sending and onboard the domain

The following navigation matches the Cloudflare Dashboard as of June 2026:

1. Sign in to Cloudflare and select the account that owns
   `soc5outboundops.app`.
2. Open **Compute > Email Service > Email Sending**.
3. If arbitrary-recipient sending is unavailable, upgrade the account to
   **Workers Paid** and return to **Email Sending**.
4. Select **Onboard Domain**.
5. Choose `soc5outboundops.app` and review the DNS records Cloudflare proposes.
6. Confirm the onboarding. Because Cloudflare is authoritative for this zone,
   Email Service can create the required records automatically.
7. Open **Compute > Email Service > Email Sending > Settings**.
8. Confirm that the sending DNS section lists valid records for:
   - bounce handling at `cf-bounce.soc5outboundops.app`
   - SPF at `cf-bounce.soc5outboundops.app`
   - DKIM at `cf-bounce._domainkey.soc5outboundops.app`
   - DMARC at `_dmarc.soc5outboundops.app`

A DNS record shown as **Locked** or **Unlocked** is valid; the label indicates
whether Email Service manages the record. Do not proxy mail-related DNS records.
Do not manually create guessed SPF or DKIM values when Cloudflare has already
created them.

This guide uses `no-reply@soc5outboundops.app`. A subdomain sender such as
`no-reply@auth.soc5outboundops.app` must itself be available for onboarding in
Email Sending before Supabase can use it.

### 6.2 Create the SMTP API token

Use an account-owned token when possible because it is not tied to an employee's
Cloudflare user account. Creating one requires Cloudflare Super Administrator
access.

1. Open **Manage Account > Account API Tokens**.
2. Select **Create Token**.
3. Name it `Supabase Auth SMTP`.
4. Add the account permission **Email Sending: Edit**.
5. Restrict the token to the account that owns `soc5outboundops.app`.
6. Optionally set an expiration date and record a rotation reminder.
7. Select **Continue to summary**, verify the scope, and select
   **Create Token**.
8. Copy the token immediately. Cloudflare shows the secret only once.

If account-owned tokens are unavailable, create a user token under **My Profile
> API Tokens > Create Token > Custom token** with the same **Email Sending:
Edit** permission and account restriction.

Treat this token as the SMTP password. Do not use the Global API Key, place the
token in this repository, add it to NestJS or Vite environment files, or retain
it in screenshots. Supabase stores it in the project's Auth SMTP configuration.

### 6.3 Enter the Cloudflare SMTP settings in Supabase

1. Open the Supabase project.
2. Go to **Authentication > SMTP Settings**. In some Dashboard revisions this
   is under **Authentication > Settings**.
3. Enable **Custom SMTP**.
4. Enter these exact values:

| Supabase field | Value |
|---|---|
| Sender email | `no-reply@soc5outboundops.app` |
| Sender name | `SOC 5 Outbound` |
| Host or Host URL | `smtp.mx.cloudflare.net` |
| Port | `465` |
| Username | `api_token` |
| Password | the Cloudflare API token created above |

The host field contains only `smtp.mx.cloudflare.net`: do not add `https://`,
`smtps://`, a path, or the application domain. Cloudflare requires implicit TLS
(SMTPS) from connection start on port 465. It does not support SMTP submission
with STARTTLS on port 587, plaintext SMTP, or outbound relay on port 25.

5. Save the SMTP settings.
6. Use Supabase's test-email action if it is present. Otherwise complete the OTP
   test in section 10 after saving the template.
7. Confirm delivery to an approved SPX mailbox and inspect both Supabase Auth
   logs and **Cloudflare > Compute > Email Service > Email Sending** metrics and
   logs.

Do not continue until Supabase accepts the settings. A connection or TLS error
usually means port 465 is not being treated as implicit TLS. An authentication
error usually means the username is not exactly `api_token`, the token lacks
**Email Sending: Edit**, or the token belongs to another Cloudflare account. A
`Sender denied` response means the domain in the Sender email was not onboarded
for Email Sending under the token's account.

## 7. Change the Magic Link template into an OTP template

Supabase uses the same API and template slot for magic links and email OTPs. The
template variable determines which experience the user receives:

- `{{ .Token }}` sends the configured numeric OTP code.
- `{{ .ConfirmationURL }}` sends a clickable magic link.

1. Open **Authentication > Email Templates**.
2. Under authentication templates, select **Magic Link**.
3. Set the subject to `SOC 5 Outbound verification code`.
4. Replace the body with:

```html
<!doctype html>
<html lang="en">
  <body style="font-family: Arial, sans-serif; color: #172033;">
    <h2>SOC 5 Outbound verification code</h2>
    <p>Enter this code on the SOC 5 Outbound login page:</p>
    <p style="font-size: 30px; font-weight: 700; letter-spacing: 6px;">
      {{ .Token }}
    </p>
    <p>This code is single-use. Do not share it with anyone.</p>
    <p>If you did not request this code, ignore this email.</p>
  </body>
</html>
```

5. Confirm that the template does not contain `{{ .ConfirmationURL }}`.
6. Save the template.

The application calls `verifyOtp` with the email, token, and `type: 'email'`.
Set the email OTP length to 6 digits in the Supabase Auth provider settings.
The application accepts exactly six numeric digits.

## 8. Configure OTP expiry and rate limits

1. Open **Authentication > Providers > Email**.
2. Review **Email OTP Expiration**. Keep the expiry short enough for security;
   Supabase's default is one hour. A shorter operational value such as 10–15
   minutes can be used after confirming company email delivery latency.
3. Open **Authentication > Rate Limits**.
4. Review:
   - OTP emails sent per hour
   - Minimum interval between requests to the same address
   - Verification attempts
5. Keep the per-address resend interval at least 60 seconds unless there is a
   measured reason to change it.

The default project-wide OTP allowance is limited. Increase it only after custom
SMTP is working and based on expected user volume. A `429` response indicates a
rate limit, not an invalid email address.

## 9. Configure application environment variables

Create `frontend/.env`:

```dotenv
VITE_API_URL=/api
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

Create `backend-nest/.env` from `backend-nest/.env.example` and configure at
least:

```dotenv
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://POOLER_USER:POOLER_PASSWORD@POOLER_HOST:6543/postgres
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_REPLACE_ME
CORS_ORIGIN=http://localhost:5173
APP_URL=http://localhost:3001
```

`DATABASE_URL` must be the transaction-pooler URI for the same Supabase project.
The service-role key is server-only and must never use a `VITE_` prefix. Legacy
projects can place the legacy `service_role` value in
`SUPABASE_SERVICE_ROLE_KEY`.

The SeaTalk runtime variables in `backend-nest/.env.example` are optional for
Supabase Auth itself. Configure them only when enabling SeaTalk login or Approval
Center. Keep `SEATALK_APPROVAL_ENABLED=false` until the callback URLs, signing
secret, application credentials, and required migrations are ready.

Install dependencies, then start the two application processes from their
respective directories:

```bash
# backend-nest
npm install
npm run start:dev

# frontend
npm install
npm run dev
```

The NestJS API listens on port 3001 by default and permits the origin declared by
`CORS_ORIGIN`. Restart both Vite and NestJS after changing environment files.

## 10. Test FTE login

First verify the chosen email is eligible:

```sql
select source_id, name, role, email, is_active, auth_user_id
from public.user_imports
where lower(email) = lower('jetricks.cantonjos@spxexpress.com');
```

The row must have:

- `role` equal to `fte_ops` or `fte_mm`
- `is_active = true`
- `auth_user_id` either null before first login or populated afterward

Then test:

1. Start NestJS (`backend-nest`) and Vite (`frontend`).
2. Open `http://localhost:5173`.
3. Select **FTE**.
4. Choose **Continue with Google**, select the matching company account, and
   confirm the dashboard loads.
5. Sign out, request an email verification code for the same address, and
   confirm the OTP path also loads the dashboard.

Test the authorization boundary as well: select a Google account that is not an
active `fte_ops` or `fte_mm` entry. Supabase must reject identity creation and
`/api/auth/me` must never return a profile for that account.

After the first request, verify account linking:

```sql
select u.id, u.email, u.email_confirmed_at,
       p.name, p.role, p.is_active,
       i.auth_user_id
from auth.users u
join public.profiles p on p.id = u.id
join public.user_imports i on i.auth_user_id = u.id
where lower(u.email) = lower('jetricks.cantonjos@spxexpress.com');
```

All three records must reference the same UUID.

## 11. Backroom account setup

Backroom users do not use email OTP. An authenticated FTE creates a Backroom
account through `POST /api/users` with a name and OPS ID. NestJS uses the
Supabase Admin API to create an internal identity:

```text
ops71783@backroom.soc5.internal
```

The initial password is `soc5-outbound2026`. Supabase Auth stores the password;
it is never written to `profiles` or `user_imports`. The profile is created with
`must_change_password = true`, and the UI blocks access until the user sets a
different password of at least 12 characters.

Backroom provisioning requires a valid `SUPABASE_SERVICE_ROLE_KEY` in the
NestJS environment. Never create these internal email identities manually
unless repairing a failed provisioning operation and you understand the profile
UUID requirement.

## 12. Dashboard verification and logs

Use these Dashboard pages during testing:

- **Authentication > Users:** confirms an Auth identity exists.
- **Authentication > Logs** or **Logs > Auth:** shows signup, OTP, verification,
  SMTP, and rate-limit failures.
- **Table Editor > profiles:** confirms the application profile exists.
- **Table Editor > user_imports:** confirms the seeded identity was linked.

An Auth user without a same-ID active profile cannot use the NestJS API. This
is intentional authorization behavior.

## 13. Troubleshooting

### `Signups not allowed for otp`

- Enable **Allow new users to sign up** in the Email provider.
- Confirm the frontend uses `shouldCreateUser: true`.
- Rerun migration 003 and the user seed.
- Confirm the exact email is active in `user_imports`.

### `Database error saving new user`

The migration 003 trigger rejected or failed to provision the signup.

```sql
select name, role, email, is_active
from public.user_imports
where lower(email) = lower('name@spxexpress.com');
```

Confirm the role is FTE, the account is active, and migration 003 completed.
Inspect Auth logs for the underlying PostgreSQL error.

### The email contains a link instead of a code

Edit the **Magic Link** template. Include `{{ .Token }}` and remove
`{{ .ConfirmationURL }}`.

### No email arrives

- Check spam/quarantine and company mail-gateway logs.
- Confirm custom SMTP is enabled and its credentials are current.
- Confirm SPF, DKIM, and DMARC alignment.
- Check Supabase Auth logs for SMTP or rate-limit errors.
- Do not repeatedly click send; wait at least 60 seconds.
- The built-in Supabase mailer cannot deliver broadly to arbitrary FTE emails.

### `Token has expired or is invalid`

- Request a new code after the resend interval.
- Enter only the newest code; requesting another code can invalidate an older
  one.
- Confirm the browser uses the same normalized email that requested the code.
- Check the configured OTP expiry.

### OTP verifies but the app returns to login or reports 403

Verify the Auth UUID and profile UUID match and the profile is active:

```sql
select u.id, u.email, p.id as profile_id, p.role, p.is_active
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('name@spxexpress.com');
```

Also confirm NestJS has the correct Supabase URL, pooled `DATABASE_URL`, and
service-role key for the same project.

### `Email rate limit exceeded` or HTTP 429

Wait for the limit window, then inspect **Authentication > Rate Limits**. For
production, configure custom SMTP before raising project-wide send limits.

## 14. Production readiness checklist

- [ ] Every file in `supabase/migrations/` was applied in filename order.
- [ ] User and cluster seeds ran successfully; only approved FTEs are active.
- [ ] NestJS starts with the production `DATABASE_URL`, `SUPABASE_URL`, and
      server-only `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] `CORS_ORIGIN` and `APP_URL` match the deployed frontend and API origins.
- [ ] Email provider and first-time signup are enabled.
- [ ] Magic Link template sends `{{ .Token }}`.
- [ ] Production Site URL uses HTTPS.
- [ ] Redirect allowlist contains only required URLs.
- [ ] Cloudflare Email Sending is enabled and the sending domain is onboarded.
- [ ] Custom SMTP is enabled and tested with an SPX mailbox.
- [ ] The SMTP token has only the required **Email Sending: Edit** permission.
- [ ] SPF, DKIM, and DMARC pass.
- [ ] OTP expiry and rate limits match expected operational volume.
- [ ] Secret/service-role key exists only on the backend.
- [ ] RLS remains enabled on `profiles` and `user_imports`.
- [ ] FTE first login and repeat login both pass.
- [ ] Unauthorized SPX email signup is rejected.
- [ ] Disabled profile access is rejected.
- [ ] Backroom first login forces a password change.
- [ ] Auth logs are included in the support runbook.

## Domain and Cloudflare DNS plan

The registered domain is `soc5outboundops.app`. Name.com remains the registrar,
and Cloudflare is the authoritative DNS provider. Confirm the nameservers shown
at Name.com exactly match the two nameservers assigned to the zone by
Cloudflare. Once delegated, create and edit DNS records in Cloudflare rather
than Name.com.

Reserve these hostnames:

| Purpose | Hostname | Required now |
|---|---|---:|
| React application | `soc5outboundops.app` | Yes |
| Optional `www` alias | `www.soc5outboundops.app` | Recommended |
| NestJS API | `api.soc5outboundops.app` | Yes for separate hosting |
| Supabase custom domain | `auth.soc5outboundops.app` | No; paid add-on |
| Authentication sender | `no-reply@soc5outboundops.app` | When SMTP is configured |

Do not create guessed A or CNAME targets. The frontend and backend hosting
providers supply their required targets. Add those records in Cloudflare after
choosing the deployment platform.

Recommended behavior:

- Redirect `www.soc5outboundops.app` to `https://soc5outboundops.app`.
- Force HTTPS on the production application.
- Keep mail-verification records such as SPF, DKIM, DMARC, and SMTP-provider
  CNAME records set to **DNS only**.
- If the Supabase custom-domain add-on is later enabled, use the CNAME and TXT
  values generated by Supabase and keep them **DNS only** during validation.
- Continue using `https://PROJECT_REF.supabase.co` as `VITE_SUPABASE_URL` unless
  the optional Supabase custom domain is activated.

## Official references

- [Passwordless email login and OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Auth users](https://supabase.com/docs/guides/auth/users)
- [Cloudflare Email Sending setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [Cloudflare SMTP reference](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)
- [Cloudflare Email Service domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Create a Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
