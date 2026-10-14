# Cloudflare Tunnel Setup

This guide shows how to expose the SOC 5 Outbound frontend and backend through
a single Cloudflare-managed domain.

Use this setup when you want:

- a public frontend URL for browser access
- backend API requests routed under `/api`
- clean Supabase auth redirects that point to the right origin

## Local ports

The project runs these services locally:

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:8000`

For production, use the Docker web container on `http://127.0.0.1:4173`. It
serves the built frontend through NGINX and proxies `/api` to Laravel. The
Vite server is for local development only.

## What you need

- `backend/.env` and `frontend/.env` already created
- Supabase URL and publishable key configured
- Cloudflare Tunnel installed through `cloudflared`
- A Cloudflare origin certificate created by `cloudflared tunnel login`
- The domain `soc5outboundops.app` is added to Cloudflare and points to the
  tunnel

## Local env values before tunneling

Start with these values:

```dotenv
# backend/.env
APP_URL=http://127.0.0.1:8000
FRONTEND_URL=http://127.0.0.1:4173

# frontend/.env
VITE_API_URL=/api
```

After tunneling, the browser will use `https://soc5outboundops.app` and the API
will remain under `/api`.

## Step 1: Start the backend

From the repository root:

```powershell
.\scripts\launchers\start-backend.ps1
```

Confirm Laravel is running on `http://127.0.0.1:8000`.

## Step 2: Start the frontend (local development only)

Open a second terminal in `frontend/`:

```powershell
npm install
npm run dev
```

Confirm Vite is running on `http://localhost:5173`.

For the production tunnel, build and start the Docker stack instead:

```powershell
docker compose up --build -d
```

This runs `npm ci`, `npm run build`, and serves `frontend/dist` from NGINX.

## Step 3: Validate the remote-managed tunnel

Authenticate this machine once, then validate that the configured tunnel can
return a token:

```powershell
cloudflared tunnel login
.\scripts\check-local.ps1 -RequireCloudflare
```

The checker runs `cloudflared tunnel token aebf91e4-acf5-4eb4-aaae-8b56a58e8035`
without printing the returned token.

## Step 4: Start the token-based tunnel

Start the complete local stack:

```powershell
.\scripts\launchers\start-dev.ps1
```

For production, use the production launcher instead:

```powershell
.\scripts\launchers\start-production.ps1
```

The script obtains the token for tunnel `aebf91e4-acf5-4eb4-aaae-8b56a58e8035`
and supplies it through `TUNNEL_TOKEN` to
`cloudflared tunnel --no-autoupdate run`. No tunnel credential file or tracked
token is required.

Vite must allow the Cloudflare frontend hostname. This repo already does that
through `frontend/vite.config.ts` with `server.allowedHosts:
['soc5outboundops.app', '.trycloudflare.com']`.

## Step 5: Update the frontend environment

Edit `frontend/.env` and keep the API path on the same origin:

```dotenv
VITE_API_URL=/api
```

This makes the browser call Laravel through the same public domain.

## Step 6: Update the backend environment

Edit `backend/.env` and point `FRONTEND_URL` to the public frontend URL:

```dotenv
APP_URL=http://127.0.0.1:8000
FRONTEND_URL=https://soc5outboundops.app
```

Keep `APP_URL` on the local Laravel address unless you are also deploying the
backend behind a different public origin.

## Step 7: Restart both services

Restart Laravel and the frontend so the new env values take effect:

```powershell
# backend terminal
.\scripts\launchers\start-backend.ps1

# frontend terminal
npm run dev
```

For production, restart the Docker stack instead:

```powershell
docker compose up --build -d
```

If you already had the tunnels open, you do not need to recreate them unless
their URLs changed.

## Step 8: Update Supabase settings

If login or session redirects are part of your flow, update Supabase with the
new public frontend URL:

- Authentication site URL
- Allowed redirect URLs
- Any provider callback URLs that use the frontend origin

Use the public frontend URL, not the backend URL, for browser auth redirects.

For SeaTalk, register this exact callback URL in SeaTalk Open Platform:

```text
https://soc5outboundops.app/auth/seatalk/callback
```

The local Cloudflare validation checks that `backend/.env` uses this same
`SEATALK_REDIRECT_URI` value.

## Step 9: Test the split setup

Open the public frontend URL in a browser:

```text
https://soc5outboundops.app
```

Then confirm:

- the app loads
- login works
- API requests go to `https://soc5outboundops.app/api`
- redirects return to `https://soc5outboundops.app`

## Troubleshooting

### Frontend loads but API calls fail

Make sure `frontend/.env` keeps the same-origin API path:

```dotenv
VITE_API_URL=/api
```

### Login redirects to localhost

Update Supabase and `FRONTEND_URL` to `https://soc5outboundops.app`.

### CORS or origin errors appear

Make sure `FRONTEND_URL` in `backend/.env` matches the exact Cloudflare
frontend URL, including `https://`.

### The backend URL opens but the app is blank

That usually means the frontend is still pointing at `/api` or an old local
value. Recheck `frontend/.env` and restart Vite.

### Tunnel only works on the host machine

Confirm each tunnel points to the correct local port:

- `4173` for the production NGINX frontend origin; use `5173` for Vite development
- `8000` for the backend

### `cloudflared tunnel token` fails

Run `cloudflared tunnel login` again and confirm the authenticated account has
permission to read the configured tunnel. Do not copy a token into the
repository or commit a credentials file.

### I only have `trycloudflare.com` URLs

That means you are using quick tunnels. Quick tunnels are fine for temporary
testing, but they are not the right input for a named tunnel `config.yml`.
For this project, use the managed domain `soc5outboundops.app` and route the API
under `/api`.

## Recommended order

When setting this up from scratch, follow this sequence:

1. Start the backend.
2. Start the frontend.
3. Authenticate `cloudflared tunnel login`.
4. Validate with `scripts/check-local.ps1 -RequireCloudflare`.
5. Start the stack with `scripts/launchers/start-dev.ps1`.
6. Update `frontend/.env` and `backend/.env`.
7. Restart both apps if their env values changed.
8. Update Supabase URLs.
9. Test login and API requests from the public frontend URL.
