# SOC 5 Outbound Staging Setup

> Historical infrastructure reference. Its migration order, `supabase db push`,
> base-only Compose commands and deploy automation are superseded by
> [production-migrations.md](production-migrations.md) and the current
> [staging deployment guide](staging-deployment.md). Do not execute the historical
> migration/deploy command blocks below; use the reviewed A / Laravel B / C
> procedure and both Compose files, including the async overlay.


Complete staging setup for SOC 5 Outbound using:

- Akamai Cloud / Linode or Alibaba Cloud ECS for the Docker host
- Supabase for PostgreSQL, Auth, and Realtime
- Cloudflare Zero Trust Tunnel and Access for HTTPS ingress and staging access control
- Travis CI for continuous integration and optional deployment

This guide is for a dedicated, non-production staging environment. It must not
reuse production database credentials, Supabase projects, Cloudflare tunnels,
application keys, or integration secrets.

## 1. Target architecture

```text
Developer workstation
        |
        v
     Git repository
        |
        v
    Travis CI
    - frontend build
    - tests
    - Docker validation
    - optional SSH deployment
        |
        v
Akamai Linode or Alibaba ECS staging VM
    Docker Compose
    ├── api        Laravel + PHP-FPM + Nginx
    ├── scheduler  Laravel schedule:work
    ├── web        React build + frontend Nginx
    └── redis      Internal cache/queue service
        |
        v
Cloudflare Zero Trust
    ├── Cloudflare Tunnel
    ├── DNS hostname
    └── Access policy
        |
        v
https://staging.example.com

Supabase staging project
    ├── PostgreSQL
    ├── Auth
    └── Realtime
```

The Compose stack publishes only the frontend origin locally:

```text
127.0.0.1:4173 -> web:80
```

The frontend Nginx container proxies:

```text
/api/* -> api:8000/api/*
/up    -> api:8000/up
```

The API and Redis ports must not be exposed publicly.

## 2. Cost and account assumptions

This architecture uses the requested providers, but the complete stack is not
guaranteed to be permanently free:

- Akamai Linode commonly provides trial credits, but should not be treated as
  a permanent always-free compute service.
- Alibaba Cloud ECS free trials are intended for new computing-product users,
  require account verification and a supported payment method, and are not a
  permanent always-free ECS entitlement.
- Alibaba Cloud VPCs and vSwitches are listed as free network resources, but
  ECS, public IPs, NAT gateways, load balancers, storage, and data transfer may
  still be billable.
- Travis CI may require a paid plan, an open-source allowance, or other account
  eligibility. Confirm the current Travis plan before relying on it for CI.
- Supabase Free has quotas and is suitable only for small staging data and
  test traffic.
- Cloudflare Zero Trust Tunnel and Access require a Cloudflare account. A
  stable custom hostname requires a domain managed in Cloudflare DNS. Domain
  registration may have a separate cost.

Do not enter production payment details or enable automatic overage spending
without approval from the platform owner.

## 3. Repository prerequisites

Use an approved, clean commit.

```powershell
git status --short
git rev-parse HEAD
```

The staging checkout should have no uncommitted changes. Record the commit SHA
used for each deployment.

Important repository files:

- [`docker-compose.yml`](../../docker-compose.yml)
- [`docker-compose.async.yml`](../../docker-compose.async.yml)
- [`frontend/Dockerfile`](../../frontend/Dockerfile)
- [`frontend/nginx.conf`](../../frontend/nginx.conf)
- [`backend/Dockerfile`](../../backend/Dockerfile)
- [`supabase/migrations/`](../../supabase/migrations/)
- [`backend/database/migrations/`](../../backend/database/migrations/)

## 4. Provision the Docker host

Choose one of the following host providers. The application deployment steps
from Section 5 onward are the same once SSH access and Docker are available.

## 4A. Option A: Akamai Linode

### 4.1 Create the VM

In Akamai Cloud Manager:

1. Create a new Compute Instance.
2. Select Ubuntu 24.04 LTS.
3. Select a region close to the staging users and Supabase project.
4. Add an administrator SSH public key.
5. Use a label such as `soc5-outbound-staging`.
6. Record the public IP address.

Recommended minimum for this repository:

```text
2 vCPU
4 GB RAM
80 GB disk
```

The Docker image builds use Node, PHP, Composer, and Nginx. A smaller VM may
run the containers but can run out of memory while building images.

### 4.2 Connect with SSH

From the administrator workstation:

```sh
ssh root@<STAGING_HOST_IP>
```

Immediately update the system:

```sh
apt update
apt upgrade -y
```

### 4.3 Create the deployment user

```sh
adduser deploy
usermod -aG sudo deploy
```

Copy the administrator's authorized key to the deployment user:

```sh
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Verify a second SSH session before disabling root access:

```sh
ssh deploy@<STAGING_HOST_IP>
```

### 4.4 Harden SSH

Edit `/etc/ssh/sshd_config`:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Validate and restart SSH:

```sh
sshd -t
systemctl restart ssh
```

Keep the existing SSH session open until a new session using `deploy` is
confirmed.

### 4.5 Configure the firewall

Cloudflare Tunnel does not require public inbound ports 80 or 443. Permit SSH
only from approved administrator addresses.

```sh
apt install -y ufw fail2ban git curl ca-certificates

ufw default deny incoming
ufw default allow outgoing
ufw allow from <ADMIN_PUBLIC_IP>/32 to any port 22 proto tcp
ufw enable
ufw status verbose
```

Do not expose these ports to the Internet:

```text
4173
8000
6379
```

Cloudflare Tunnel requires outbound connectivity to Cloudflare. Do not block
the outbound traffic needed for HTTPS, DNS, package installation, Supabase,
and the tunnel.

## 4B. Option B: Alibaba Cloud ECS free trial

Alibaba Cloud's current ECS offer is a product free trial, not a permanent
always-free tier. Eligibility requires a registered account with complete
information, a verified phone number, a supported payment method, no overdue
payments, and no previous qualifying ECS or Simple Application Server purchase.
Alibaba states that ECS instances may be stopped and locked if trial
eligibility is revoked. Review the current offer shown in the Alibaba Cloud
console before provisioning. [Alibaba Cloud free trials](https://www.alibabacloud.com/help/en/user-center/product-overview/learn-about-free-trials)

### 4B.1 Create the Alibaba VPC and vSwitch

Create the network before creating the ECS instance.

In the Alibaba Cloud console:

1. Open Virtual Private Cloud.
2. Select Create VPC.
3. Use the same region that will contain the ECS instance.
4. Set the VPC IPv4 CIDR block to:

```text
10.20.0.0/16
```

5. Create a vSwitch in the selected availability zone with:

```text
vSwitch CIDR: 10.20.1.0/24
```

6. Name them:

```text
VPC:     soc5-outbound-staging-vpc
vSwitch: soc5-outbound-staging-switch-a
```

Keep the CIDR ranges private and non-overlapping with any corporate VPN or
other cloud network that may later connect to this environment. Alibaba
recommends using RFC 1918 private address space for VPC CIDRs. [Alibaba VPC and
vSwitch setup](https://www.alibabacloud.com/help/en/vpc/vpc-and-vswitch)

For this single-VM staging environment, one VPC and one vSwitch are enough.
Create additional subnets only when the application is split into separate
tiers or availability zones.

### 4B.2 Create the ECS instance

In the Alibaba Cloud ECS console:

1. Open Elastic Compute Service.
2. Start the Create Instance flow.
3. Select the same region as the VPC and vSwitch.
4. Choose Ubuntu 24.04 LTS 64-bit if available.
5. Choose an instance with at least 2 vCPU and 4 GiB RAM for Docker builds.
6. Select the custom VPC `soc5-outbound-staging-vpc`.
7. Select the vSwitch `soc5-outbound-staging-switch-a`.
8. Choose pay-as-you-go only if the account owner has approved the billing
   risk; otherwise select the displayed eligible free-trial option.
9. Use a system disk of at least 80 GiB.
10. Create or select an SSH key pair.
11. Do not enable paid add-ons unless explicitly approved.
12. Record the instance public IP address, region, VPC, vSwitch, and security
    group.

Alibaba ECS instances consist of compute, image, storage, networking, and
security-group resources. Stopping an instance may not stop charges for every
attached resource, so release trial resources when the trial is finished.
[Alibaba ECS getting started](https://www.alibabacloud.com/help/en/ecs/quick-start)

### 4B.3 Configure the ECS security group

Allow only:

```text
Inbound TCP 22    from your administrator IP range
Outbound TCP 443
Outbound DNS
```

Do not allow public inbound access to:

```text
4173
8000
6379
80
443
```

Cloudflare Tunnel connects outbound from the ECS instance, so public inbound
HTTP/HTTPS is not required.

### 4B.4 Connect to ECS

Alibaba Cloud may provide an SSH command similar to:

```sh
ssh -i <ECS_PRIVATE_KEY> root@<ECS_PUBLIC_IP>
```

Use the image's documented default username if it is not `root`. Keep the
private key outside the repository and restrict its permissions:

```sh
chmod 600 <ECS_PRIVATE_KEY>
```

### 4B.5 Harden the ECS host

Run the same host preparation as the Linode path:

```sh
apt update
apt upgrade -y
apt install -y ufw fail2ban git curl ca-certificates

adduser deploy
usermod -aG sudo deploy
```

Copy the SSH key to `/home/deploy/.ssh/authorized_keys`, verify a second SSH
session, then disable root and password login in `/etc/ssh/sshd_config`:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Validate and restart SSH:

```sh
sshd -t
systemctl restart ssh
```

Configure UFW after confirming SSH access:

```sh
ufw default deny incoming
ufw default allow outgoing
ufw allow from <ADMIN_PUBLIC_IP>/32 to any port 22 proto tcp
ufw enable
ufw status verbose
```

If ECS trial capacity, eligibility, or region selection is unavailable, use
the Akamai Linode path instead. Do not create a pay-as-you-go instance without
an approved billing limit.

### 4B.6 VPC routing for Cloudflare Tunnel

The staging VM needs outbound Internet access for:

- Docker image pulls
- Ubuntu package updates
- Supabase PostgreSQL and HTTPS APIs
- Cloudflare Tunnel
- Travis deployment callbacks, if used

For a single ECS instance, use the default VPC route table and the instance's
approved public connectivity or EIP. Do not create a NAT Gateway solely for
this one-VM staging setup unless private-only outbound networking is required;
NAT Gateways add cost.

Cloudflare Tunnel makes an outbound connection from the VM to Cloudflare. The
VPC does not need inbound HTTP or HTTPS routes. Keep the security group closed
to ports 80, 443, 4173, 8000, and 6379.

Verify the ECS host has outbound connectivity before installing Docker:

```sh
curl -I https://registry-1.docker.io
curl -I https://api.supabase.com
```

### 4B.7 Alibaba network cleanup

When the staging trial ends, release resources in this order:

1. Stop the Docker stack.
2. Remove the Cloudflare Tunnel route if no longer needed.
3. Release the ECS instance.
4. Release any EIP or public bandwidth resource.
5. Delete the security group if unused.
6. Delete the vSwitch.
7. Delete the VPC.

Alibaba will not allow deletion of a VPC while dependent resources remain.

## 5. Install Docker

Log in as `deploy` on either the Linode or Alibaba ECS host:

```sh
ssh deploy@<STAGING_HOST_IP>
```

Install Docker Engine:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

Log out and back in so the group membership is refreshed:

```sh
exit
ssh deploy@<STAGING_HOST_IP>
```

Verify:

```sh
docker --version
docker compose version
docker run --rm hello-world
```

Compose v2 is required.

## 6. Create the Supabase staging project

### 6.1 Create an isolated project

In the Supabase Dashboard:

1. Create a new project named `soc5-outbound-staging`.
2. Choose a region close to the staging host.
3. Generate a unique database password.
4. Do not use the production project.

Record securely:

- Project URL
- Project reference ID
- Publishable key
- Service-role key
- Pooler hostname
- Pooler username
- Pooler password

The service-role key is backend-only.

### 6.2 Configure Auth

Set the staging Site URL:

```text
https://staging.example.com
```

Add only the staging redirect URLs required by the application.

For Email OTP:

1. Enable the Email provider.
2. Configure SMTP.
3. Use an OTP template containing `{{ .Token }}`.
4. Create staging test accounts.
5. Ensure each test account has the expected `public.profiles` row.

For Google OAuth, register the staging callback URLs in both Google and
Supabase.

For SeaTalk login, register:

```text
https://staging.example.com/auth/seatalk/callback
```

Keep Approval Center disabled until the staging SeaTalk application,
permissions, callback signing secret, and employee mappings are ready:

```dotenv
SEATALK_APPROVAL_ENABLED=false
```

### 6.3 Configure Realtime

The repository includes Realtime migration files. Apply them before testing
live request updates. The application currently uses the `requests` and
`intraday_dispatch` Realtime publication changes from:

```text
supabase/migrations/20261004000000_enable_request_realtime.sql
```

## 7. Apply Supabase migrations

Install and authenticate the Supabase CLI on the deployment workstation or CI
runner:

```sh
supabase login
```

Link the repository to the staging project:

```sh
supabase link --project-ref <STAGING_PROJECT_REF>
```

Inspect the migration state:

```sh
supabase migration list
```

Apply pending migrations:

```sh
supabase db push
```

The latest repository migration is:

```text
supabase/migrations/20261009000000_normalize_legacy_request_statuses.sql
```

It normalizes legacy request statuses:

```text
APPROVED       -> REQUESTED
REJECTED_BY_MM -> CANCELLED
FOR_DOCKING    -> DOCKING
CONFIRMED      -> DOCKED
```

The repository contains historical migrations with duplicate numeric prefixes.
Do not rename or reorder migrations that may already have been applied. Review
the migration history and apply each pending migration once.

For a non-empty staging project, take a recoverable database export before
schema changes:

```sh
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --dbname="postgresql://<USER>:<PASSWORD>@<POOLER_HOST>:6543/postgres" \
  --file=staging-before-migrations.dump
```

Do not commit the dump or put the password in shell history.

## 8. Clone the application on the staging host

```sh
sudo mkdir -p /opt/soc5-outbound-staging
sudo chown deploy:deploy /opt/soc5-outbound-staging

git clone <REPOSITORY_URL> /opt/soc5-outbound-staging
cd /opt/soc5-outbound-staging
git checkout <APPROVED_COMMIT>

git status --short
git rev-parse HEAD
```

The checkout must be clean.

## 9. Configure Docker environment files

Compose uses two environment files:

1. Root `.env` for frontend build arguments.
2. `backend/.env` for Laravel runtime configuration.

### 9.1 Root `.env`

Create `/opt/soc5-outbound-staging/.env`:

```dotenv
SUPABASE_URL=https://<STAGING_PROJECT_REF>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<STAGING_PUBLISHABLE_KEY>
```

These values are browser-visible. Do not put server secrets in this file.

### 9.2 Backend `.env`

Create the file:

```sh
cd /opt/soc5-outbound-staging
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

Set at least:

```dotenv
APP_NAME="SOC 5 Outbound API"
APP_ENV=staging
APP_DEBUG=false
APP_KEY=<UNIQUE_STABLE_STAGING_KEY>

APP_URL=https://staging.example.com
FRONTEND_URL=https://staging.example.com

LOG_CHANNEL=stack

DB_CONNECTION=pgsql
DB_HOST=<STAGING_POOLER_HOST>
DB_PORT=6543
DB_DATABASE=postgres
DB_USERNAME=<STAGING_DB_USERNAME>
DB_PASSWORD=<STAGING_DB_PASSWORD>
DB_SSLMODE=require

SUPABASE_URL=https://<STAGING_PROJECT_REF>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<STAGING_PUBLISHABLE_KEY>
SUPABASE_SERVICE_ROLE_KEY=<STAGING_SERVICE_ROLE_KEY>

ADMIN_EMAILS=<STAGING_ADMIN_EMAILS>

SEATALK_REDIRECT_URI=https://staging.example.com/auth/seatalk/callback
SEATALK_APPROVAL_ENABLED=false

GOOGLE_SHEETS_SYNC_ENABLED=false

SENTRY_ENVIRONMENT=staging
SENTRY_RELEASE=<APPROVED_COMMIT_SHA>

CACHE_STORE=file
QUEUE_CONNECTION=sync

SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

Never put these values into frontend variables:

```text
APP_KEY
DB_PASSWORD
SUPABASE_SERVICE_ROLE_KEY
SEATALK_APP_SECRET
GOOGLE_SHEETS_CREDENTIALS_JSON
```

Generate the Laravel key using the API image after the first build:

```sh
docker compose --env-file backend/.env run --rm api php artisan key:generate --show
```

Store the generated value in `backend/.env`. Generate it once and preserve it
between deployments.

## 10. Validate and build the Docker stack

Validate Compose interpolation:

```sh
docker compose --env-file backend/.env config --quiet
```

Build:

```sh
docker compose --env-file backend/.env build
```

The frontend build performs:

```text
npm ci
npm run build
```

The backend image installs PHP-FPM, Nginx, Supervisor, Composer production
dependencies, PostgreSQL support, cURL, DOM, mbstring, and OPcache.

## 11. Apply Laravel migrations

Supabase SQL migrations and Laravel migrations are separate.

Apply Laravel migrations:

```sh
docker compose --env-file backend/.env run --rm api php artisan migrate --force
```

Inspect their state:

```sh
docker compose --env-file backend/.env run --rm api php artisan migrate:status
```

Verify the staging configuration:

```sh
docker compose --env-file backend/.env run --rm api php artisan system:verify-config --staging
```

Stop if the verification command fails.

## 12. Start the staging stack

```sh
docker compose --env-file backend/.env up --build -d
```

Check status:

```sh
docker compose --env-file backend/.env ps
```

Expected services:

```text
api
scheduler
web
redis
```

Check logs:

```sh
docker compose --env-file backend/.env logs --tail 200 api
docker compose --env-file backend/.env logs --tail 200 scheduler
docker compose --env-file backend/.env logs --tail 200 web
```

Check the frontend and API health endpoint locally:

```sh
curl --fail http://127.0.0.1:4173/
curl --fail http://127.0.0.1:4173/up
```

Confirm that the frontend is a production build and not a Vite development
server. The HTML should not contain:

```text
/@vite/client
/src/main.tsx
```

## 13. Configure Cloudflare Zero Trust

### 13.1 Domain and hostname

Cloudflare Zero Trust is the access and network layer. It does not itself
replace domain registration. Use a domain managed in Cloudflare DNS.

Example staging hostname:

```text
staging.example.com
```

### 13.2 Create the tunnel

In Cloudflare Dashboard:

1. Open Zero Trust.
2. Open Networks -> Tunnels.
3. Select Create Tunnel.
4. Name it `soc5-outbound-staging`.
5. Choose `cloudflared`.
6. Copy the tunnel token securely.

Install `cloudflared` on the Linode or Alibaba ECS host using Cloudflare's official installation
instructions, then verify:

```sh
cloudflared --version
```

### 13.3 Publish the application

Create a Published Application route:

```text
Hostname: staging.example.com
Service URL: http://127.0.0.1:4173
```

Do not point the tunnel to the API port. The frontend Nginx container already
proxies `/api` and `/up` internally.

### 13.4 Add Cloudflare Access

Create a Self-hosted Access application:

```text
Application domain: staging.example.com
```

Add an Allow policy for the staging team, for example:

```text
Allow users whose email ends with @example.com
```

or:

```text
Allow specific staging email addresses
```

Optionally require MFA, a one-time PIN, or an approved identity provider.

This creates two security layers:

1. Cloudflare Access controls who may reach staging.
2. Supabase and Laravel control application login and authorization.

### 13.5 Run the tunnel as a service

Install the connector using the staging tunnel token:

```sh
sudo cloudflared service install <STAGING_TUNNEL_TOKEN>
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

Check the service:

```sh
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 200 --no-pager
```

Test the hostname:

```sh
curl -I https://staging.example.com
```

## 14. Configure Travis CI

Connect the repository to Travis CI at `travis-ci.com` and enable builds for
the repository.

Create `.travis.yml` at the repository root:

```yaml
language: generic

services:
  - docker

branches:
  only:
    - main
    - develop

env:
  global:
    - COMPOSE_DOCKER_CLI_BUILD=1
    - DOCKER_BUILDKIT=1

before_install:
  - docker --version
  - docker compose version
  - node --version
  - npm --version

install:
  - cp backend/.env.example backend/.env
  - |
    cat > .env <<EOF
    SUPABASE_URL=${CI_SUPABASE_URL}
    SUPABASE_PUBLISHABLE_KEY=${CI_SUPABASE_PUBLISHABLE_KEY}
    EOF

script:
  - cd frontend
  - npm ci
  - npm run build
  - npm test
  - cd ..
  - docker compose --env-file backend/.env config --quiet
  - docker compose --env-file backend/.env build
```

Configure Travis repository variables:

```text
CI_SUPABASE_URL
CI_SUPABASE_PUBLISHABLE_KEY
```

These may use a staging publishable key or safe CI-only values. Do not expose
backend secrets in CI.

Never put these in `.travis.yml` as plaintext:

```text
SUPABASE_SERVICE_ROLE_KEY
DB_PASSWORD
APP_KEY
SEATALK_APP_SECRET
GOOGLE_SHEETS_CREDENTIALS_JSON
```

Use Travis repository settings or encrypted values for secrets.

## 15. Optional Travis deployment stage

CI should pass before deployment. Deployment should run only from an approved
branch, normally `main`.

Store these as secure Travis variables:

```text
STAGING_HOST
STAGING_USER
STAGING_SSH_PRIVATE_KEY
STAGING_KNOWN_HOSTS
STAGING_DEPLOY_PATH
```

Example deployment stage:

```yaml
after_success:
  - |
    if [ "$TRAVIS_BRANCH" = "main" ] && [ "$TRAVIS_PULL_REQUEST" = "false" ]; then
      printf '%s\n' "$STAGING_SSH_PRIVATE_KEY" > /tmp/staging_deploy_key
      chmod 600 /tmp/staging_deploy_key

      ssh -i /tmp/staging_deploy_key \
        -o StrictHostKeyChecking=yes \
        "$STAGING_USER@$STAGING_HOST" \
        "cd $STAGING_DEPLOY_PATH && \
         git fetch --all && \
         git checkout $TRAVIS_COMMIT && \
         docker compose --env-file backend/.env build && \
         docker compose --env-file backend/.env run --rm api php artisan migrate --force && \
         docker compose --env-file backend/.env up -d && \
         docker compose --env-file backend/.env ps"

      rm -f /tmp/staging_deploy_key
    fi
```

Pin the staging host key in `STAGING_KNOWN_HOSTS`. Do not use
`StrictHostKeyChecking=no`.

Do not have Travis generate or transfer the backend `.env`. Keep the staging
environment file on the staging host in protected storage.

## 16. Staging release procedure

On every release:

1. Merge or approve the target commit.
2. Wait for Travis CI to pass.
3. Record the commit SHA.
4. Apply Supabase migrations.
5. Deploy the application commit to the staging host.
6. Apply Laravel migrations.
7. Run configuration verification.
8. Start or restart the Compose stack.
9. Run health and browser acceptance checks.

Manual deployment commands:

```sh
cd /opt/soc5-outbound-staging

git fetch --all
git checkout <APPROVED_COMMIT>
git status --short

docker compose --env-file backend/.env config --quiet
docker compose --env-file backend/.env build

docker compose --env-file backend/.env run --rm api php artisan migrate --force
docker compose --env-file backend/.env run --rm api php artisan system:verify-config --staging

docker compose --env-file backend/.env up -d
docker compose --env-file backend/.env ps
```

## 17. Acceptance testing

Test through:

```text
https://staging.example.com
```

### Availability

- Cloudflare Access blocks an unauthorised user.
- An authorised staging user can reach the application.
- The TLS certificate is valid.
- The frontend loads.
- `/up` returns HTTP 200.
- Browser assets load without errors.
- API calls use the same-origin `/api` path.

### Authentication

- Email OTP login works.
- Google OAuth works if enabled.
- SeaTalk login works if enabled.
- Logout works.
- Redirects remain on the staging hostname.

### Authorization

Verify the expected roles and permissions for:

- FTE operations
- FTE midmile
- Backroom operations
- Doc Officers
- Administrators

Confirm that unauthorized users cannot read or mutate protected resources.

### Request workflow

Test:

- Create an outbound request.
- Edit a pending request.
- Approve or reject a request.
- Assign a truck.
- Record driver assignment.
- Confirm docking.
- Verify milestone timestamps.
- Verify request events and audit history.
- Test validation failures.
- Test idempotency behavior.

### Realtime

Open two browser sessions:

1. Change a request in session A.
2. Confirm session B receives the update.
3. Confirm notifications and read receipts behave correctly.

### Operations

```sh
docker compose --env-file backend/.env ps
docker compose --env-file backend/.env logs --tail 200 api
docker compose --env-file backend/.env logs --tail 200 scheduler
docker compose --env-file backend/.env logs --tail 200 web
```

Confirm there are no repeated restarts, scheduler failures, database errors, or
unexpected production integration calls.

## 18. Optional asynchronous queue mode

The default stack uses:

```dotenv
CACHE_STORE=file
QUEUE_CONNECTION=sync
```

Enable the optional database-backed queue only after the queue support
migrations have been applied and a worker is required:

```sh
docker compose \
  --env-file backend/.env \
  -f docker-compose.yml \
  -f docker-compose.async.yml \
  up --build -d
```

Check the worker:

```sh
docker compose \
  --env-file backend/.env \
  -f docker-compose.yml \
  -f docker-compose.async.yml \
  logs --tail 200 worker
```

Do not enable async mode without confirming the `jobs`, `job_batches`, and
`failed_jobs` tables exist.

## 19. Routine operations

View logs:

```sh
docker compose --env-file backend/.env logs -f api
docker compose --env-file backend/.env logs -f scheduler
docker compose --env-file backend/.env logs -f web
```

Restart services:

```sh
docker compose --env-file backend/.env restart api scheduler web
```

Stop staging without deleting named volumes:

```sh
docker compose --env-file backend/.env down
```

Do not routinely use:

```sh
docker compose down --volumes
```

That deletes named volumes.

## 20. Rollback

Application rollback:

```sh
cd /opt/soc5-outbound-staging
git fetch --all
git checkout <PREVIOUS_APPROVED_COMMIT>

docker compose --env-file backend/.env build
docker compose --env-file backend/.env up -d
docker compose --env-file backend/.env ps

curl --fail https://staging.example.com/up
```

Reverting application code does not reverse database migrations. For a schema
rollback:

1. Stop and assess the affected migration.
2. Confirm a recoverable database export exists.
3. Review whether the migration is safely reversible.
4. Obtain approval before restoring or modifying data.
5. Re-run configuration and acceptance checks.

## 21. Final checklist

### Docker host: Linode or Alibaba ECS

- [ ] Ubuntu 24.04 VM provisioned
- [ ] Adequate CPU and memory available
- [ ] SSH key access works
- [ ] Non-root deployment user created
- [ ] Root/password SSH disabled
- [ ] Firewall restricts SSH
- [ ] Docker Engine installed
- [ ] Docker Compose v2 available
- [ ] Ports 4173, 8000, and 6379 are not public

### Supabase

- [ ] Separate staging project exists
- [ ] Supabase migrations applied once
- [ ] Laravel migrations applied separately
- [ ] Auth Site URL configured
- [ ] Redirect URLs configured
- [ ] Staging test users created
- [ ] Profiles and roles verified
- [ ] RLS policies verified
- [ ] Realtime publication verified

### Cloudflare Zero Trust

- [ ] Domain is managed in Cloudflare DNS
- [ ] Dedicated staging tunnel exists
- [ ] Published hostname points to `http://127.0.0.1:4173`
- [ ] Cloudflare Access application exists
- [ ] Access policy is limited to staging users
- [ ] `cloudflared` runs as a service
- [ ] Production tunnel is not reused

### Travis CI

- [ ] Repository connected to Travis CI
- [ ] `.travis.yml` committed
- [ ] Docker service enabled
- [ ] Frontend build passes
- [ ] Frontend tests pass
- [ ] Compose config validation passes
- [ ] Docker build passes
- [ ] Deployment credentials stored securely
- [ ] Deployment is restricted to approved branches
- [ ] No backend secrets appear in logs

### Release

- [ ] Approved commit SHA recorded
- [ ] Supabase migration result recorded
- [ ] Laravel migration result recorded
- [ ] `system:verify-config --staging` passes
- [ ] `/up` returns HTTP 200
- [ ] Login tested
- [ ] Role permissions tested
- [ ] Request workflow tested
- [ ] Realtime tested
- [ ] Scheduler logs checked
- [ ] Rollback commit recorded
- [ ] Database recovery path known
