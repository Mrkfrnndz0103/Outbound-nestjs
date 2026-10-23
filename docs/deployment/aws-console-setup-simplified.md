# AWS setup guide (simplified, production-oriented)

This guide walks through the AWS side of SOC 5 Outbound using the AWS Console.
It assumes:

- Firebase Hosting serves the React frontend at `app.soc5outboundops.app`;
- AWS hosts the Laravel API and its background worker/scheduler;
- Supabase continues to provide PostgreSQL, Auth, and Realtime; and
- the production owner controls the AWS account and DNS domain.

This is a provisioning guide. It does not create AWS resources or deploy the
application. Use staging first. AWS services such as Fargate, load balancers,
NAT gateways, logs, and data transfer cost money; create an AWS Budget before
provisioning them.

## What AWS will run

| AWS resource | Plain-language purpose |
| --- | --- |
| ECR | Private shelf that stores the backend Docker image |
| ECS Fargate | Runs the API, background worker, and scheduled tasks without managing servers |
| VPC/subnets/security groups | Network boundaries around the application |
| Application Load Balancer (ALB) | Public HTTPS front door for the API |
| ACM | Provides the HTTPS certificate for the API hostname |
| Secrets Manager | Holds passwords and application secrets outside the image |
| CloudWatch | Collects logs and alerts on health problems |

Supabase, Firebase, SeaTalk, Google Sheets, and Sentry remain separate
services. Your domain can stay hosted in Cloudflare; Route 53 is not required.

## Before opening the AWS Console

Have these decisions and inputs ready:

- A production AWS account with MFA enabled for administrators.
- An AWS region. Use `Asia Pacific (Singapore) ap-southeast-1` unless the
  production owner selects another region.
- Your domain `soc5outboundops.app` is hosted in Cloudflare, and you can edit
  its DNS records. This guide uses `app.soc5outboundops.app` for Firebase and
  `api.soc5outboundops.app` for the AWS API.
- The production Supabase project URL, pooler host, database username/password,
  publishable key, and service-role key, stored in an approved password vault.
- The approved backend source commit and a CI/deployment identity that can
  publish the image to ECR. Avoid building and deploying unreviewed code from a
  workstation.
- A separate staging project/domain for the first deployment.

Do not put passwords or keys in chat, Git, Firebase variables, Docker build
arguments, or shell command history.

## Phase 1: protect the AWS account and set a budget

1. Sign in as the AWS account owner and turn on MFA.
2. Create named administrator access for operators. Do not use the root user
   for routine work. Follow your organization's IAM Identity Center or IAM
   process.
3. Open **Billing and Cost Management → Budgets → Create budget**.
4. Create a monthly cost budget with email alerts at 50%, 80%, and 100% of the
   amount approved by the owner. Add a separate zero-spend/free-tier alert if
   available. A budget alert notifies; it does not necessarily stop resources.
5. Select `ap-southeast-1` in the region menu in the upper-right. Keep the ALB,
   ECS, ECR, and log groups in the same region.

## Phase 2: request the TLS certificate and validate it in Cloudflare DNS

The certificate is attached to the public API load balancer.

1. Open **AWS Certificate Manager (ACM)** in `ap-southeast-1`.
2. Choose **Request a certificate → Request a public certificate**.
3. Add `api.soc5outboundops.app`. Add `*.soc5outboundops.app` only if the domain owner has a
   reason to cover multiple subdomains with one certificate.
4. Choose DNS validation and request the certificate.
5. In the Cloudflare dashboard, open the domain and select **DNS → Records →
   Add record**. Copy the ACM validation CNAME name and target exactly.
6. Set the validation record to **DNS only** (gray cloud), then save it.
   ACM validation records must resolve directly; do not orange-cloud proxy the
   validation CNAME.
7. Wait until ACM shows **Issued**. Do not continue to HTTPS listener setup
   until it is issued.

Firebase issues/uses its own certificate for `app.soc5outboundops.app`; the ACM
certificate is for the AWS API hostname.

## Phase 3: create a container image repository

1. Open **Elastic Container Registry (ECR) → Repositories → Create repository**.
2. Select **Private** and name it `soc5-outbound-api`.
3. Turn on image scanning if offered. Keep image tags immutable if the account
   policy permits it. Add a lifecycle policy later to expire old untagged
   images while retaining approved release images.
4. Copy the repository URI, which looks like:
   `123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/soc5-outbound-api`.
5. Configure the approved CI deployment identity to build the existing
   `backend/Dockerfile`, tag the image with the source commit SHA, and push it
   to ECR. The current Travis pipeline validates code but does not publish or
   deploy. Do not use a mutable `latest` tag as the release identity.

At this point ECR may be empty. ECS cannot start until an approved image has
been pushed.

### Configure Travis to publish an approved image

The repository's current CI provider is Travis CI. Existing Travis jobs test
the code and validate/build Docker configuration, but there is no ECR push or
ECS deployment job. Configure image publishing only after the ECR repository
and a restricted AWS deployment identity are ready.

1. In Travis, connect the SOC 5 repository and confirm the protected `main`
   branch requires review and all required test, PostgreSQL, migration-chain,
   and deployment-config jobs to pass.
2. In AWS IAM, create a deployment identity dedicated to this repository. The
   included deployment script currently expects a dedicated IAM user's access
   key and secret key. Keep the policy narrowly scoped and rotate these keys.
   If your Travis plan supports AWS OIDC, switch the script to short-lived role
   credentials before removing the key-based authentication.
3. Scope ECR push permissions to the single `soc5-outbound-api` repository in
   `ap-southeast-1`. For image publishing, the policy normally needs ECR
   authorization-token access plus layer upload, image upload, and image
   manifest operations. Do not grant administrator or account-wide ECR access.
4. If Travis will also trigger ECS deployment, add only the required ECS
   describe/register/update permissions for the named cluster/services and
   `iam:PassRole` for the exact task and execution roles. Keep this separate
   from the image-publisher permissions when possible.
5. Add these Travis repository variables. Mark both AWS keys **encrypted**;
   restrict the production deployment flag to protected release builds:

   ```text
   PRODUCTION_DEPLOY_ENABLED=true
   AWS_ACCESS_KEY_ID=<restricted-deploy-user-key>
   AWS_SECRET_ACCESS_KEY=<restricted-deploy-user-secret>
   AWS_DEFAULT_REGION=ap-southeast-1
   EXPECTED_AWS_ACCOUNT_ID=<12-digit-production-account-id>
   ECR_REPOSITORY_URI=<account-id>.dkr.ecr.ap-southeast-1.amazonaws.com/soc5-outbound-api
   ECS_CLUSTER=soc5-outbound-production
   ECS_API_SERVICE=<api-service-name>
   ECS_WORKER_SERVICE=<worker-service-name>
   ECS_SCHEDULER_SERVICE=<scheduler-service-name>
   ```

   Container names default to `api`, `worker`, and `scheduler`; if your ECS
   task definitions use different names, also set `ECS_API_CONTAINER_NAME`,
   `ECS_WORKER_CONTAINER_NAME`, and `ECS_SCHEDULER_CONTAINER_NAME`. Do not put
   credentials in `.travis.yml`, commit them, expose them to pull-request builds
   from forks, or print them in logs. Protect release tags in the Git host.
6. Add explicit ordered Travis stages so the normal test jobs finish first,
   tag-gated release acceptance runs next, and publishing/deployment runs last.
   Add the publish job only for an approved release tag after required checks
   pass. It should build `backend/Dockerfile`, tag the image with the exact
   commit SHA, authenticate to ECR, push, then record the pushed image digest.
   Never publish images from pull-request builds.
7. Require a human release owner to create the protected release tag only
   after staging passes. The included
   [`deploy-aws-ecs.sh`](../../scripts/deploy/deploy-aws-ecs.sh) job pushes the
   immutable commit-SHA image, registers task-definition revisions using the
   image, then updates API, worker, and scheduler ECS services in that order.
   It waits for each service to become stable. It does not run database
   migrations or deploy the Firebase frontend.
8. Give the IAM identity ECR image push, ECS service/task-definition
   registration/update/describe, and `iam:PassRole` access only for the named
   production ECS roles. The deployment script checks the AWS account ID and
   refuses to run unless it is on a tag and `PRODUCTION_DEPLOY_ENABLED=true`.
   Record the previous task definition and image digest for rollback.

Travis account settings, AWS identities/secrets, branch/tag protections, and
ECR/ECS resources are outside this repository. The gated pipeline implementation
is present, but it cannot publish or deploy until those account-side settings
and exact ECS service names are supplied. A failed test or staging acceptance
must prevent publishing and rollout.

## Phase 4: create the network

The ALB needs public network access. Application containers should not accept
direct public inbound traffic. They need outbound HTTPS access to Supabase and
external APIs.

### Recommended network for production

Ask the AWS/network owner to create or approve a VPC with:

- at least two public subnets in different Availability Zones for the ALB;
- private subnets in at least two Availability Zones for ECS tasks;
- a NAT gateway or another approved outbound route for the private ECS tasks;
- an internet gateway attached to the VPC; and
- routes so public subnets reach the internet gateway and private subnets use
  approved egress.

A NAT gateway has a fixed hourly and data-processing cost. Confirm the budget
and egress design before creating one. Private task subnets are the production
recommendation; do not expose port 8000 to the internet.

If the AWS account already has a production VPC, use the network team's
approved subnets and firewall rules instead of creating another VPC. Avoid
choosing the default VPC by accident without checking its routes and security.

### Create security groups

Create two security groups in **EC2 → Network & Security → Security Groups**:

1. `soc5-api-alb-sg`: inbound HTTPS TCP 443 from the internet (or the approved
   public source ranges); outbound to the API task security group on TCP 8000.
2. `soc5-api-task-sg`: inbound TCP 8000 **from `soc5-api-alb-sg` only**;
   outbound HTTPS TCP 443 for required database/provider access. Keep the
   default outbound rule only if approved by the security owner.

Do not add public inbound rules for TCP 8000, 5432, or Redis port 6379.

## Phase 5: store production secrets

1. Open **Secrets Manager → Store a new secret**.
2. Choose **Other type of secret** and store backend settings as key/value
   pairs. Create separate secrets for staging and production.
3. Use names such as `/soc5/production/laravel` and `/soc5/staging/laravel`.
4. Include only backend runtime values. At minimum, plan values for:

   - `APP_URL=https://api.soc5outboundops.app`;
   - `FRONTEND_URL=https://app.soc5outboundops.app`;
   - `SESSION_DOMAIN=.soc5outboundops.app`;
   - `SEATALK_REDIRECT_URI=https://api.soc5outboundops.app/auth/seatalk/callback`
     if SeaTalk login is enabled; and
   - Laravel `APP_KEY` (generate once, retain across releases);
   - Supabase database host, username, password, and database name;
   - Supabase URL, publishable key, and service-role key;
   - `ADMIN_EMAILS` and the production frontend/API URLs; and
   - Sentry backend DSN if enabled.

5. Keep SeaTalk Approval Center disabled initially. Add its app secret,
   callback signing secret, token secret, and URLs only after its production
   prerequisites and separate enablement review are complete.
6. Restrict secret read permissions to the ECS task role and approved
   deployment operators. Never put these values in an image or Firebase.

The complete Laravel variable list is in
[`aws-firebase-production-setup.md`](aws-firebase-production-setup.md). Its
example values are placeholders, not ready-to-use credentials.

## Phase 6: create ECS cluster and task definitions

### Create the cluster

1. Open **Elastic Container Service (ECS) → Clusters → Create cluster**.
2. Name it `soc5-outbound-production`.
3. Choose AWS Fargate as the compute option. Create the cluster.

### Create the API task definition

1. Open **Task definitions → Create new task definition**; choose **AWS Fargate**.
2. Name the family `soc5-outbound-api`.
3. Start with Linux/x86_64 unless the pushed image was deliberately built for
   ARM. Set task CPU/memory based on staging measurements; for an initial small
   deployment, ask the platform owner to size it rather than guessing.
4. Add an execution role that allows ECR image pulls and CloudWatch log writes.
   Add a separate task role with permission to read only the production secret.
5. Add a container named `api`, using the exact ECR image URI and commit SHA.
6. Set container port `8000` (TCP). Add a CloudWatch log group such as
   `/ecs/soc5-outbound/production/api`.
7. Add environment variables for non-secret production settings. Reference
   sensitive values from Secrets Manager using ECS's **Secrets** section.
8. Set container health check to request `http://localhost:8000/up` if the
   image health check configuration supports it; otherwise use the ALB health
   check in the next phase.
9. Save the task definition revision.

The API container listens on port 8000. The ALB connects to it over HTTP inside
the VPC; HTTPS terminates at the ALB.

### Create worker and scheduler task definitions

Create two task definition families from the same approved image, secret
references, network, and logging pattern:

- `soc5-outbound-worker`: command
  `php artisan queue:work database --sleep=3 --tries=3 --backoff=5 --timeout=90`.
- `soc5-outbound-scheduler`: command `php artisan schedule:work`.

Set worker stop timeout/grace period above the 90-second job timeout. Run one
scheduler task at a time. The worker and scheduler use the same database-backed
queue/cache/session settings as the API. Apply the required Laravel support
migrations before starting these processes.

## Phase 7: create the load balancer and API service

1. Open **EC2 → Load Balancers → Create load balancer → Application Load
   Balancer**.
2. Name it `soc5-outbound-api-alb`, choose **Internet-facing**, and select the
   approved VPC and at least two public subnets.
3. Attach `soc5-api-alb-sg`.
4. Create a target group for **IP addresses**, HTTP, port 8000, in the same VPC.
5. Set the health check path to `/up`. Use HTTP success code 200.
6. Add an HTTPS listener on port 443 and select the issued ACM certificate for
   `api.soc5outboundops.app`. Redirect HTTP port 80 to HTTPS if an HTTP listener is
   created.
7. Open **ECS → Clusters → soc5-outbound-production → Services → Create**.
8. Select the API task definition. Set desired count to 2 for production
   availability if budget allows; a single task has no task-level redundancy.
9. Choose Fargate, the approved VPC private subnets, and assign **no public IP**.
10. Attach `soc5-api-task-sg`; configure the ALB target group and container
    port 8000. Set deployment health checks and wait for healthy targets.
11. Create separate ECS services using the worker and scheduler task
    definitions. They do not need an ALB. Start with one worker and one
    scheduler. Keep scheduler desired count at one.

If the API task cannot reach Supabase, inspect the private-subnet route, NAT
egress, DNS resolution, task security group, Supabase TLS settings, and
credentials. Do not solve this by opening the database port to the internet.

## Phase 8: add DNS in Cloudflare and Firebase

1. In the ALB details, copy its DNS name.
2. In Cloudflare **DNS → Records**, create a CNAME record:
   - **Name:** `api`
   - **Target:** the ALB DNS name copied in the previous step
   - **Proxy status:** **DNS only** (gray cloud) for initial setup
   - **TTL:** Auto
3. In Firebase Console, add `app.soc5outboundops.app` as a Hosting custom domain.
   Add Firebase's domain verification and routing records in Cloudflare exactly
   as Firebase displays them. Keep these records DNS only while Firebase
   verifies the domain and provisions HTTPS.
4. Wait for both DNS records and certificates to become active.
5. Keep the API and frontend on the same parent domain so the SeaTalk session
   cookie flow can work with the reviewed cross-origin frontend changes.
6. Configure Supabase Auth's site URL and redirect allowlist for the frontend
   custom domain and enabled OAuth providers.

After the API works over HTTPS with Cloudflare DNS-only records, you may enable
Cloudflare's orange-cloud proxy for `api.soc5outboundops.app` if you want its proxy or
WAF features. Set Cloudflare **SSL/TLS encryption mode** to **Full (strict)**;
the AWS ALB must continue to present the valid ACM certificate. If you enable
the proxy, update the ALB security group to allow HTTPS from Cloudflare's
published IP ranges and keep that list current. Do not use Flexible SSL. Keep
ACM validation CNAME records DNS only even if the API record is proxied.

The frontend changes needed for API URL, `credentials: include`, CORS,
`X-XSRF-TOKEN`, and shared cookie domain are documented in
[`aws-firebase-production-setup.md`](aws-firebase-production-setup.md). Do not
assume the current same-origin frontend build will work unchanged on Firebase.

## Phase 9: logs, alerts, and operational checks

1. In **CloudWatch → Log groups**, confirm API, worker, and scheduler groups
   receive logs. Set a retention period that matches the data policy.
2. Create alarms for ALB unhealthy targets and 5xx responses, ECS task restarts,
   and worker/scheduler stopped tasks.
3. Add an alert for sustained queue backlog using the queue table/metric
   approach approved by the application owner.
4. Confirm no secret values appear in logs.
5. Confirm ECS deployments roll back or can be manually reverted to the prior
   task definition/image digest.
6. Record the release commit, image digest, task definition revisions, owner,
   and rollback reference.

## First production release order

1. Complete staging with the same AWS/Firebase/Supabase architecture.
2. Confirm backups and review the production migration plan and migration
   ledger using [`production-migrations.md`](production-migrations.md).
3. Apply approved Supabase phase A SQL, Laravel migrations, then phase C SQL;
   do not reorder or blindly replay migrations.
4. Run `php artisan system:verify-config --production` as a protected one-off
   task with the production task definition and secrets.
5. Deploy the API, confirm `/up` and ALB targets are healthy, then start the
   worker and single scheduler task.
6. Deploy the Firebase build with the production API URL and public Supabase
   settings only.
7. Validate login, API calls, role authorization, request workflow, realtime,
   email delivery, logs, and alerts with the release owner.
8. Keep SeaTalk Approval Center disabled until its separate staging and
   provider-contract gates pass.

## Stop and get help if

- the AWS budget/resource cost is unclear;
- you cannot tell staging from production;
- the selected VPC/subnets have unknown routes or shared workloads;
- the release image is not tied to an approved commit;
- production Supabase backup or migration history is uncertain;
- a secret is missing or has been exposed; or
- health checks, database connectivity, auth, or queue processing fail.

Do not open port 8000 to make the ALB health check pass, deploy a staging image
to production, or enable SeaTalk approvals to bypass a failed preflight.
