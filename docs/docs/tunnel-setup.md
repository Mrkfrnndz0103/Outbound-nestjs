# Cloudflare Tunnel Setup

This project exposes one public hostname through Cloudflare Tunnel:

```text
https://soc5outboundops.app
```

The tunnel must target **Next.js**, not NestJS. Next.js serves the browser app
and proxies same-origin API, health, and SeaTalk callback requests to the private
NestJS service.

## Current routing

| Environment | Cloudflare service target | Next.js | NestJS |
| --- | --- | --- | --- |
| Local development | `http://localhost:3000` | `localhost:3000` | `localhost:3001` |
| Docker production | `http://127.0.0.1:4173` | container port `3000` | private container port `3001` |

Do not create a second public hostname for NestJS. `frontend/next.config.ts`
forwards these routes internally:

- `/api/:path*`
- `/auth/seatalk/callback`
- `/up`

## Cloudflare dashboard configuration

In **Cloudflare Zero Trust → Networks → Tunnels**, open tunnel
`aebf91e4-acf5-4eb4-aaae-8b56a58e8035` and configure its public hostname:

- **Subdomain:** leave blank for the apex
- **Domain:** `soc5outboundops.app`
- **Path:** leave blank
- **Type:** `HTTP`
- **URL for local development:** `localhost:3000`
- **URL for Docker production:** `127.0.0.1:4173`

Use only the URL matching the launcher running on the connector machine. Save the
hostname after changing it. Cloudflare manages the ingress configuration for
this token-based tunnel; no tracked `config.yml` or credential JSON is required.

## Environment configuration

Create `backend-nest/.env` and `frontend/.env` from their example files. The
relevant values are:

```dotenv
# backend-nest/.env
PORT=3001
CORS_ORIGIN=https://soc5outboundops.app
APP_URL=https://soc5outboundops.app
SEATALK_REDIRECT_URI=https://soc5outboundops.app/auth/seatalk/callback
CLOUDFLARE_TUNNEL_ID=aebf91e4-acf5-4eb4-aaae-8b56a58e8035

# frontend/.env
NEST_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_SAFE_KEY
```

`NEST_API_URL` is evaluated by the Next.js server and is not exposed to the
browser. In Docker, Compose supplies `http://api-nest:3001` through the service
network.

Never place the Cloudflare tunnel token, credential JSON, Supabase service-role
key, or database password in Git.

## Start local development

Authenticate this machine once:

```powershell
cloudflared tunnel login
```

Then start Next.js, NestJS, and the named tunnel together:

```powershell
.\scripts\launchers\start-dev.ps1
```

The Cloudflare dashboard service target must be `http://localhost:3000` for this
mode. The launcher obtains the named-tunnel token without printing or storing it.
Keep the launcher running; stopping it disconnects the connector and Cloudflare
returns Error 1033.

## Start Docker production

Ensure the root `.env` contains the Supabase build variables required by
`docker-compose.yml`, then run:

```powershell
.\scripts\launchers\start-production.ps1
```

The Cloudflare dashboard service target must be `http://127.0.0.1:4173` for this
mode. The Docker web service maps the Next.js container from port `3000` to the
host loopback port `4173`.

## Validate

Before starting the stack:

```powershell
.\scripts\check-local.ps1 -RequireCloudflare
```

After starting it, verify locally before testing Cloudflare:

```powershell
# Development
Invoke-WebRequest http://localhost:3000/
Invoke-WebRequest http://localhost:3000/up

# Docker production
Invoke-WebRequest http://127.0.0.1:4173/
Invoke-WebRequest http://127.0.0.1:4173/up
```

Then verify the public routes:

```powershell
Invoke-WebRequest https://soc5outboundops.app/
Invoke-WebRequest https://soc5outboundops.app/up
```

## Supabase and SeaTalk URLs

Use the public Next.js origin for browser redirects:

- Supabase site URL: `https://soc5outboundops.app`
- Supabase allowed redirect URL: `https://soc5outboundops.app/**`
- SeaTalk callback URL: `https://soc5outboundops.app/auth/seatalk/callback`

The callback reaches Next.js first and is proxied unchanged to NestJS, preserving
the public URL expected by SeaTalk.

## Troubleshooting

### Cloudflare Error 1033

Cloudflare has no healthy connector for the tunnel. Confirm that `cloudflared`
is running on the host and that the launcher window remains open:

```powershell
cloudflared tunnel info aebf91e4-acf5-4eb4-aaae-8b56a58e8035
```

Restart the appropriate launcher. Error 1033 is a connector problem, not a
Next.js or NestJS response.

### Cloudflare Error 502

The connector is online but cannot reach the configured origin. Confirm the
Cloudflare service target matches the running mode and test that origin locally:

- Development: `http://localhost:3000`
- Docker production: `http://127.0.0.1:4173`

### Frontend loads but API calls fail

Confirm NestJS is listening on port `3001` and `NEST_API_URL` points to it. Do
not point browser code directly to port `3001`; API requests should remain on
`https://soc5outboundops.app/api`.

### Login redirects to localhost

Update the Supabase site and redirect URLs, then restart/rebuild Next.js because
public environment variables are embedded during the build.

### `cloudflared tunnel token` fails

Run `cloudflared tunnel login` again and confirm the authenticated Cloudflare
account can read the named tunnel. Do not paste a tunnel token into an env file
or commit it.
