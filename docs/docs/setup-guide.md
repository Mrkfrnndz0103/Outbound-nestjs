# Setup Guide

This guide covers local development on the current restricted Windows machine.
It does not require administrator privileges.

## 1. Requirements

- PHP 8.4.1 or newer (required by the committed Composer lock file)
- Composer 2
- Node.js 22 and npm 10
- A Supabase project

This machine uses Scoop-installed PHP and Composer. The compatible Visual C++
runtime DLLs are stored beside the user-local PHP executable; no files under
`C:\Windows\System32` are modified. `tools/php.ini` is the tracked template;
the setup script generates `tools/php.local.ini` with the active PHP extension
directory and CA bundle. The generated configuration enables OpenSSL, cURL,
mbstring, ZIP, sodium, and PostgreSQL extensions for this project.

Verify the frontend tools:

```powershell
node --version
npm --version
```

The backend scripts verify PHP and Composer automatically.

## 2. Configure Supabase

For the complete current Dashboard walkthrough, including Email OTP, SMTP,
templates, rate limits, verification queries, and troubleshooting, use
[`docs/supabase-auth-setup.md`](supabase-auth-setup.md).

For the current Google Auth Platform setup, including the exact callback URI
for this project, follow [`docs/google-login-setup.md`](google-login-setup.md).

In the Supabase dashboard, open the SQL Editor and execute:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_cluster_import_compatibility.sql
supabase/migrations/003_auth_flows.sql
supabase/migrations/004_google_fte_auth.sql
...
supabase/migrations/018_notification_read_receipts.sql
```

Run every migration in repository order. This creates profiles, clusters, requests,
events, notifications, per-user notification read receipts, indexes, RLS policies,
and the Realtime notification publication.

### Configure email OTP authentication

In the Supabase dashboard, configure the following before testing FTE login:

1. Open **Authentication > Providers > Email**.
2. Enable the Email provider and enable new-user signup. First-time signup is
   required because imported FTE records are an allowlist, not Auth accounts.
   Migration 003 rejects FTE emails that are not active in that allowlist.
3. Open **Authentication > Email Templates > Magic Link** and replace the
   template with an OTP template containing `{{ .Token }}`. Do not use
   `{{ .ConfirmationURL }}` because that sends a magic link instead of a code.

Example template:

```html
<h2>SOC 5 Outbound verification code</h2>
<p>Enter this code on the login page:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
<p>This code is single-use. Do not share it.</p>
```

4. Open **Authentication > URL Configuration**. Set the Site URL to
   `http://localhost:5173` for local development and add the deployed HTTPS URL
   before production use.
5. Open **Authentication > SMTP Settings** and configure a custom SMTP service
   for real SPX addresses. Supabase's built-in test mailer only delivers to
   pre-authorized project-team addresses and is not suitable for production.
6. Review **Authentication > Rate Limits**. Supabase normally enforces a delay
   between OTP requests; the UI should not be used to repeatedly resend codes.

Run `docs/outbound/users-seed.sql` after migration 003 and before the first FTE
login. The OTP request can create an Auth account only when its normalized email
is present as an active `fte_ops` or `fte_mm` row in `public.user_imports`.

Verify an FTE is staged:

```sql
select name, role, email, is_active, auth_user_id
from public.user_imports
where lower(email) = lower('name@spxexpress.com');
```

To import the supplied cluster and user reference files, follow
[`docs/outbound/IMPORT.md`](outbound/IMPORT.md) and execute the revised seed files
in the documented order.

Obtain these values from Supabase project settings:

- Project URL
- Publishable key
- PostgreSQL pooler host, username, and password
- Service-role key, for the Laravel server only

Do not use the service-role key in the frontend.

## 3. Backend environment

Create the environment file if it does not exist:

```powershell
Copy-Item backend\.env.example backend\.env
```

Set the following values in `backend/.env`:

```dotenv
APP_URL=http://127.0.0.1:8000
FRONTEND_URL=http://localhost:5173

DB_HOST=your-pooler-host.supabase.com
DB_PORT=6543
DB_DATABASE=postgres
DB_USERNAME=your-pooler-username
DB_PASSWORD=your-database-password

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_ANON_KEY` remains supported as a fallback for projects that still use
the legacy JWT-based anon key.

`SUPABASE_SERVICE_ROLE_KEY` is a secret. Keep `backend/.env` untracked.

Initialize Laravel from the repository root:

```powershell
.\scripts\launchers\setup-backend.ps1
```

The script installs Composer packages, creates `backend/.env` when necessary,
generates `APP_KEY`, and verifies Laravel can boot.

## 4. Frontend environment

Create `frontend/.env`:

```dotenv
VITE_API_URL=/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Only variables prefixed with `VITE_` are exposed to browser code. Never add the
service-role key to a `VITE_` variable.

Install frontend dependencies:

```powershell
cd frontend
npm install
```

`@supabase/ssr` and Next.js middleware are not used because this frontend is a
Vite single-page application. Supabase JS handles session persistence and token
refresh in the browser.

## 5. Start development

Terminal 1, from the repository root:

```powershell
.\scripts\launchers\start-backend.ps1
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` to Laravel at
`http://127.0.0.1:8000`.

## 6. First FTE login

After running the user seed, enter one of its `@spxexpress.com` FTE addresses on
the login page. Supabase sends the configured numeric OTP, creates the Auth identity on
first use, and migration 003 creates the matching profile. Subsequent OTP logins
reuse that Auth identity.

## 7. Troubleshooting

### Composer or PHP is not recognized

Restart PowerShell after the Scoop installation and run:

```powershell
php --version
composer --version
```

### VCRUNTIME140 version warning

Use the configured user-local PHP runtime. Do not replace the DLL under
`System32`. Run backend commands through
`scripts/launchers/setup-backend.ps1` or
`scripts/launchers/start-backend.ps1`, which activate `tools/php.local.ini`.

### OpenSSL extension missing

Confirm the project configuration is active:

```powershell
$env:PHPRC = (Resolve-Path .\tools\php.local.ini).Path
php --ini
php -m
```

The loaded configuration should be `tools/php.local.ini`, and the module list
should contain `openssl`.

### API returns database connection errors

Check the Supabase pooler host, port, username, and password in `backend/.env`.
The pooler username commonly includes the project reference.

### Login succeeds in Supabase but API returns 403

Ensure `public.profiles` contains an active row whose `id` exactly matches the
authenticated user's UUID.

### OTP email is not received

- Confirm the Magic Link template contains `{{ .Token }}`.
- Confirm custom SMTP is configured, or that the recipient is an authorized
  project-team address while using Supabase's test mailer.
- Check Authentication logs and rate limits in the Supabase dashboard.
- Wait at least 60 seconds before requesting another code for the same address.

### Signups not allowed for OTP

Enable new-user signup under **Authentication > Providers > Email**, rerun
migration 003, run the user seed, and confirm the email is active in
`public.user_imports` using the verification query above.
