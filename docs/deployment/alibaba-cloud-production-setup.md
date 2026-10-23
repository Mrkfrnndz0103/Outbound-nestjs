# Alibaba Cloud setup guide (simplified, production-oriented)

This guide deploys SOC 5 Outbound's Laravel backend to Alibaba Cloud ECS using
Docker Compose. Firebase Hosting serves the React frontend, and the existing
Supabase production project continues to provide PostgreSQL, Auth, and
Realtime.

This is a setup guide only. It does not create cloud resources or deploy the
application. Start in an isolated staging environment. ECS, public IPs, cloud
disks, outbound traffic, snapshots, and optional load balancing are billable;
set a budget and review pricing in the selected Alibaba Cloud region first.

## Target architecture

```text
Browser
  +-- https://app.example.com  Firebase Hosting (React)
  |
  +-- https://api.example.com  Alibaba Cloud DNS
                                  |
                              Security Group
                                  |
                              ECS instance
                              +-- Nginx HTTPS ingress
                              +-- Docker Compose
                                  +-- Laravel API
                                  +-- Laravel queue worker
                                  +-- Laravel scheduler
                                  |
                                  +-- Supabase production
                                      PostgreSQL/Auth/Realtime
```

Cloudflare is not required. Use Alibaba Cloud DNS, your current domain DNS
provider, or another approved DNS service. Firebase manages the frontend's
HTTPS certificate; the API certificate is configured on the ECS Nginx ingress
in this single-instance design.

The repository also has a historical Alibaba ECS staging guide, but that
document is explicitly staging-only. Use this production guide and the
canonical migration procedure; do not copy old migration/deployment commands.

## Chosen deployment shape

### Simple single-instance setup

Use one ECS instance with Docker Engine and Compose. It runs the API, worker,
and scheduler containers; host Nginx terminates HTTPS and forwards requests to
the API on loopback. This is simpler and matches the repository's Compose
stack, but has one server failure domain and requires planned maintenance.

### Higher-availability setup

For higher availability, use at least two ECS instances in separate zones,
place an Alibaba Cloud Server Load Balancer (SLB/ALB) in front, deploy the API
on each instance, and run the scheduler on only one instance (or use a
distributed lock). Run workers on one or more instances. Use private ECS
instances with a NAT Gateway for outbound access. This costs more and requires
centralized logs, automated image rollout, and a coordinated release process.

The steps below describe the single-instance path and mark the HA additions.

## Required and optional services

| Service | Purpose | Required? |
| --- | --- | --- |
| ECS | Linux virtual machine for Docker Compose | Yes |
| VPC and vSwitch | Isolated network and subnet for the ECS instance | Yes |
| Security Group | Firewall rules for SSH and HTTPS ingress | Yes |
| System disk and optional data disk | OS, images, logs, and container data | Yes |
| Elastic IP or public IPv4 | Stable public reachability for API DNS | Yes for simple path |
| Alibaba Cloud DNS or existing DNS provider | Maps `api.example.com` to ECS public IP | Yes |
| SSL Certificates service or Let's Encrypt | HTTPS certificate for API hostname | Yes |
| Container Registry (ACR) | Private storage for immutable backend images | Recommended |
| Resource Access Management (RAM) | Named restricted operator/deploy access | Yes |
| CloudMonitor | CPU, disk, memory, and instance alerts | Yes |
| Alibaba Cloud Secrets Manager | Backend secrets, if available in the selected account/region | Recommended |
| Cloud Firewall/Security Center | Additional threat monitoring and security controls | Recommended by security owner |
| NAT Gateway | Outbound internet for private ECS instances | Required for private-subnet HA shape |
| SLB/ALB | Stable HTTPS endpoint and multi-instance traffic distribution | HA path only |
| Supabase | PostgreSQL, Auth, Realtime | Yes; external to Alibaba Cloud |
| Firebase Hosting | Static frontend | Yes; external to Alibaba Cloud |
| SeaTalk / Google / Sentry | Optional integrations | Only if enabled |

## Before creating resources

Prepare these items:

- Alibaba Cloud account and billing owner; select the region nearest the
  production Supabase project and users (Singapore is a likely choice if the
  Supabase project is in Singapore).
- Custom domain and DNS administrator access for `app.example.com` and
  `api.example.com`.
- Approved production application commit, repository access, and a release
  procedure.
- Production Supabase URL, database pooler host, TLS port, database
  credentials, publishable key, and service-role key. Keep these in an
  approved secrets vault.
- Approved administrator public IP/CIDR for SSH access.
- Staging resources or permission to establish them before production.

Do not paste secret values into chat, commit them, or add backend secrets to
Firebase build variables.

## Phase 1: account, billing, and access

1. Sign in to the Alibaba Cloud account and enable MFA for the account owner.
2. Create a named RAM user or role for each operator. Avoid routine use of the
   account owner/root identity. Use least-privilege access and key rotation.
3. Turn on billing notifications and create a budget/spending alert supported
   by the account. The alert may notify without automatically stopping
   resources.
4. Choose the region and keep ECS, VPC, disk, ACR, and monitoring resources in
   that region unless the architecture requires otherwise.
5. Create separate resource naming and secrets for staging and production.

## Phase 2: create VPC, vSwitch, and firewall

1. Open **VPC → VPCs → Create VPC**.
2. Name it `soc5-outbound-production-vpc` and use an approved private CIDR
   range that does not overlap the office, VPN, or connected cloud networks.
3. Create a vSwitch in an Availability Zone in the selected region. For the
   single-instance setup, use the approved subnet design. For HA, create
   subnets across at least two zones.
4. Create a Security Group named `soc5-outbound-production-sg`.
5. Add inbound rules:
   - TCP 22 only from the approved administrator IP/CIDR.
   - TCP 443 from the internet for the public API.
   - TCP 80 only if required for certificate issuance/renewal; redirect it to
     HTTPS and remove it if the certificate method does not need it.
6. Do not allow inbound TCP 8000 (Laravel), 5432 (PostgreSQL), or 6379
   (Redis). The API container must only be reachable through host Nginx.
7. Limit outbound access according to the security policy. The instance needs
   DNS and outbound HTTPS to reach package/image registries, Supabase, SeaTalk,
   Sentry, and other enabled providers. If using a private network for HA,
   configure the approved NAT Gateway and routes.

The simple instance has a public IP, but the firewall must keep SSH restricted
and application traffic limited to HTTPS. For the HA design, keep ECS instances
private and expose only the load balancer.

## Phase 3: create the ECS instance

1. Open **Elastic Compute Service (ECS) → Instances → Create Instance**.
2. Select the production region and an Alibaba-supported Ubuntu LTS image (for
   example Ubuntu 24.04 if available in that region).
3. For a small first deployment, start by pricing a general-purpose instance
   around 2 vCPU and 4–8 GiB memory with an ESSD system disk. Increase the size
   if image builds, worker load, or memory monitoring requires it. Confirm
   sizing with staging load and budget before production.
4. Select the production VPC, vSwitch, and `soc5-outbound-production-sg`.
5. Attach an SSH key pair. Do not enable password login for SSH.
6. Assign a public IP or associate an Elastic IP for the simple design. A
   stable Elastic IP makes DNS and recovery easier; check its regional cost.
7. Add tags such as `Environment=production`, `Application=soc5-outbound`, and
   an owner/contact tag.
8. Review the price and create the instance. Record the instance ID, region,
   private IP, public/Elastic IP, and key pair name in the deployment record.

For high availability, create two or more ECS instances in different zones,
omit public IPs, and use an SLB plus NAT egress instead of this single-instance
public-IP layout.

## Phase 4: harden the operating system

Connect from an approved administrator machine:

```sh
ssh ubuntu@<ECS_PUBLIC_OR_ELASTIC_IP>
```

Then:

1. Update the OS packages and reboot if required by kernel updates.
2. Create a non-root `deploy` user and install the approved SSH public key.
3. Confirm a second SSH session as `deploy` works before disabling root SSH.
4. Disable password authentication and root login; keep key-based SSH only.
5. Install Docker Engine, Docker Compose v2, Git, Nginx, Certbot (if using
   Let's Encrypt), and required security updates using the official vendor
   instructions for the selected OS.
6. Enable the OS firewall as an additional layer: deny inbound by default and
   allow SSH from the approved admin CIDR plus HTTP/HTTPS as required.
7. Configure time sync, log rotation, automatic security patch policy, and
   CloudMonitor agent if required by operations.
8. Keep the SSH session open until a new connection and firewall rules are
   verified.

Do not copy a private SSH key to the server. Do not share private key contents.

## Phase 5: configure stable storage and snapshots

1. Use ESSD storage with sufficient space for Docker images, container logs,
   and temporary release files. Monitor disk use.
2. Keep the operating system, Docker data, and application checkout organized
   under standard paths such as `/opt/soc5-outbound` and `/var/lib/docker`.
3. Enable scheduled disk snapshots according to the recovery-point policy.
   A disk snapshot is not a substitute for Supabase database backups.
4. Set Docker log rotation so container logs cannot fill the system disk.
5. Do not treat the ECS disk as the source of truth for requests or user data;
   that data remains in Supabase.

## Phase 6: prepare the backend container image

### Recommended: use ACR and CI

1. Open **Container Registry (ACR)** and create a private enterprise/basic
   repository as supported by the account, named `soc5-outbound-api`.
2. Configure an approved CI identity to build `backend/Dockerfile`, scan the
   image, and push an immutable tag based on the reviewed commit SHA.
3. Configure the ECS `deploy` user/host to pull from ACR using a limited
   registry credential. Prefer a short-lived RAM/registry authorization flow
   supported by the account; do not use an account-owner password.
4. Record the full image digest with each release.

To pull a tagged ACR image with this repository's Compose setup, create a
protected `docker-compose.production.yml` override that sets the same immutable
image URI on `api`, `scheduler`, and `worker`, for example:

```yaml
services:
  api:
    image: registry.region-id.aliyuncs.com/namespace/soc5-outbound-api:<commit-sha>
  scheduler:
    image: registry.region-id.aliyuncs.com/namespace/soc5-outbound-api:<commit-sha>
  worker:
    image: registry.region-id.aliyuncs.com/namespace/soc5-outbound-api:<commit-sha>
```

Pass this override with `-f docker-compose.production.yml` to the commands
below. Keep it free of credentials; authenticate to ACR separately.

### Simpler fallback: build on ECS

If CI/ACR is not available, check out the reviewed source commit on the ECS
instance and build the image there with Docker Compose. This takes more CPU,
memory, and disk during builds and is less repeatable. Do not build from a dirty
checkout or deploy an unreviewed branch.

## Phase 7: install the production release and environment

1. Create `/opt/soc5-outbound` owned by `deploy` and check out the approved
   release commit. Keep the checkout clean and record its SHA.
2. Create `backend/.env` from `backend/.env.example` on the host or inject
   configuration through a protected secret service. Restrict file access to
   the deployment user and root. Never commit this file.
3. Set production-safe values, including:

   ```dotenv
   APP_ENV=production
   APP_DEBUG=false
   APP_KEY=<stable-unique-production-key>
   APP_URL=https://api.example.com
   FRONTEND_URL=https://app.example.com

   DB_CONNECTION=pgsql
   DB_HOST=<production-supabase-pooler-host>
   DB_PORT=6543
   DB_DATABASE=postgres
   DB_USERNAME=<production-database-user>
   DB_PASSWORD=<production-database-password>
   DB_SSLMODE=require

   SUPABASE_URL=https://<production-project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=<production-publishable-key>
   SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>

   SESSION_DRIVER=database
   SESSION_CONNECTION=pgsql
   SESSION_DOMAIN=.example.com
   SESSION_SECURE_COOKIE=true
   CACHE_STORE=database
   QUEUE_CONNECTION=database

   SEATALK_APPROVAL_ENABLED=false
   GOOGLE_SHEETS_SYNC_ENABLED=false
   GOOGLE_USER_IMPORTS_SYNC_ENABLED=false
   SENTRY_ENVIRONMENT=production
   ```

4. Use the correct parent domain in `SESSION_DOMAIN`; the cookie configuration
   must match the frontend/API origin design. The frontend must also be updated
   for cross-origin API requests and credentialed fetches; see
   [`aws-firebase-production-setup.md`](aws-firebase-production-setup.md).
5. Set exact frontend CORS origin and allow required headers including
   `X-XSRF-TOKEN`. Never use `*` with credentialed CORS.
6. Use a stable `APP_KEY`; generate it once and preserve it across releases.
   Do not print secrets in deployment output. Prefer Alibaba Cloud Secrets
   Manager if available; otherwise use a protected file with restrictive
   permissions and a documented rotation process.
7. Keep SeaTalk Approval Center disabled and Google Sheets disabled until their
   production destination, credentials, provider contracts, and acceptance
   tests are ready.

## Phase 8: expose only HTTPS through Nginx

The Compose API service exposes port 8000 to the Compose network but does not
publish a host port by default. Add a production-only Compose override that
binds the API to loopback:

```yaml
services:
  api:
    ports:
      - "127.0.0.1:8000:8000"
```

Do not add `0.0.0.0:8000:8000`. Configure host Nginx to:

- listen for `api.example.com` on 443 with the approved TLS certificate;
- redirect port 80 to HTTPS if port 80 is open;
- proxy API requests to `http://127.0.0.1:8000`;
- preserve the original host, scheme, and client IP headers; and
- route `/up` to Laravel for health checking.

Obtain the API certificate using Alibaba Cloud SSL Certificates or an
organization-approved ACME/Let's Encrypt flow. Configure automatic renewal and
alert on renewal failures. Set Laravel's trusted proxy configuration only for
the actual Nginx/load balancer proxy. Test HTTPS, callback reachability, and
secure-cookie behavior before opening the API hostname to users.

For the HA design, terminate TLS on an Alibaba Cloud SLB/ALB with an issued
certificate, target ECS instances on a private listener, and configure the
correct trusted proxy ranges in Laravel. Do not also expose the ECS API port to
the public internet.

## Phase 9: start API, worker, and scheduler

Use both Compose files so production has shared database-backed queue/cache/
sessions and a separate worker. The existing Compose definitions also include
a frontend `web` container; Firebase serves the frontend here, so do not start
that service.

1. Validate Compose configuration without printing secrets:

   ```sh
   docker compose --env-file backend/.env \
     -f docker-compose.yml -f docker-compose.async.yml config --quiet
   ```

2. Build the approved API image (or pull the immutable ECR/ACR release image).
3. Before starting production workers, apply the reviewed database migration
   plan in the correct phases, then run `system:verify-config` as described in
   the migration guide.
4. Start only the backend processes:

   ```sh
   docker compose --env-file backend/.env \
     -f docker-compose.yml -f docker-compose.async.yml up -d api scheduler worker
   ```

5. Check container state and logs, and verify Nginx returns the backend health
   endpoint over HTTPS. Ensure no service is restarting and the queue is
   processing.
6. Confirm Docker restart policies are active and test a controlled host
   reboot in staging before relying on automatic restart in production.

Compose starts one scheduler container. Do not run multiple scheduler
containers against the same deployment unless overlap prevention is verified.

## Phase 10: DNS, Firebase, monitoring, and release checks

1. Create `api.example.com` DNS A/AAAA record to the Elastic IP, or CNAME to
   the API load balancer for the HA setup. Use an appropriately low TTL during
   initial validation.
2. Configure Firebase Hosting for `app.example.com` and publish the Firebase
   domain verification records.
3. Configure Firebase build values: production `VITE_API_URL`, Supabase URL,
   publishable key, and public Sentry DSN only. Never expose service-role,
   database, Laravel, AWS, or SeaTalk secrets.
4. Configure Supabase Auth Site URL and provider callback allowlists for the
   frontend and SeaTalk login callback as applicable.
5. Enable CloudMonitor alerts for ECS instance status, CPU, memory, disk, and
   network. Install/configure the CloudMonitor agent if memory/disk metrics
   require it.
6. Forward application/container logs to a managed logging service or a
   monitored, rotated local destination. Use Sentry for application exceptions
   if enabled. Avoid logging credentials, tokens, callback signatures, or
   personal data unnecessarily.
7. Confirm a recovery path: prior image/commit, disk snapshot procedure, and
   separate Supabase backup/PITR verification.

The Firebase frontend must be updated for the separate API hostname. The
current app uses same-origin API URLs and SeaTalk session behavior. Ensure the
frontend uses `https://api.example.com/api/v1`, sends credentials, and that
Laravel's credentialed CORS/cookie settings are validated in staging.

## Database migration and first release order

1. Deploy to staging using the same region and the same hosting shape.
2. Confirm the production Supabase project backup/PITR state, migration ledger,
   role privileges, RLS, Auth settings, and Realtime configuration.
3. Build and record the approved backend image/commit and frontend build.
4. Review [`production-migrations.md`](production-migrations.md) and its
   generated plan. Apply phase A Supabase SQL, Laravel migrations, then phase C
   Supabase SQL. Do not reorder, blindly replay, or run the CI auth stub on
   production.
5. Run `php artisan system:verify-config --production` against the explicit
   production environment from a protected operator session or one-off
   container.
6. Start API and confirm `/up`, then scheduler and worker.
7. Deploy Firebase frontend and verify login, roles, API operations, request
   workflow, Realtime, email delivery, logs, and alerting.
8. Leave SeaTalk Approval Center disabled until a separate test tenant has
   passed create/approve/reject, callback signature, idempotency, retry, and
   synchronization checks and SeaTalk has confirmed the provider contract.
9. Record release SHA/image digest, migration evidence, health/acceptance
   results, operator, and rollback reference.

Application rollback does not automatically reverse database changes. Review
migration reversibility and restore procedures separately.

## Checklist

- [ ] MFA and named RAM operator/deployment access are in place.
- [ ] Budget alerts are configured and costs reviewed.
- [ ] VPC, subnets, routes, security groups, and DNS/IP design are reviewed.
- [ ] ECS instance is patched, SSH is key-only and IP-restricted, and firewall
      does not expose port 8000.
- [ ] Disk snapshots and log rotation/retention are configured.
- [ ] Approved backend image/commit is immutable and recorded.
- [ ] Backend secrets are protected and absent from Git/images/Firebase.
- [ ] TLS certificate is active, renewal is monitored, and HTTPS works.
- [ ] API, worker, and one scheduler run with the async production profile.
- [ ] Production database migrations and config verification follow the
      reviewed procedure.
- [ ] Firebase custom domain, production Auth redirects, API URL, CORS, and
      cookie behavior pass staging validation.
- [ ] CloudMonitor/logging and Supabase backup/PITR checks are ready.
- [ ] SeaTalk Approval Center and Sheets remain disabled until their gates pass.

Production readiness is **not established** by completing this document.
Record environment-specific evidence and obtain the production owner's release
approval before directing users to the deployment.
