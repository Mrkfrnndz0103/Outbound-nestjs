# AWS Console setup (current simplified guide)

> Console labels verified against the current AWS experience in October 2026. AWS
> occasionally renames or moves controls; use the console search bar if a label
> differs slightly.

This guide deploys the repository's **NestJS** backend to Amazon ECS on AWS
Fargate. Supabase continues to provide PostgreSQL, Auth, and Realtime. The React
frontend remains on Firebase Hosting. Cloudflare can continue to host DNS, so
Route 53 is optional.

## Target architecture

| Resource | Purpose |
| --- | --- |
| Amazon ECR | Stores immutable NestJS container images |
| Amazon ECS with Fargate | Runs the API and background processes |
| Application Load Balancer | Public HTTPS endpoint for the API |
| AWS Certificate Manager | TLS certificate for the API hostname |
| AWS Secrets Manager | Server-only runtime configuration |
| CloudWatch Logs and alarms | Logs, health monitoring, and alerts |
| VPC, subnets, and security groups | Network isolation and outbound access |

Use `Asia Pacific (Singapore) — ap-southeast-1` unless the production owner has
approved another region. Keep ECR, ECS, the load balancer, certificate, and log
groups in the same region.

## Before provisioning

Have the following ready:

- an AWS account whose root user is protected by MFA;
- named operator access through IAM Identity Center where possible;
- control of `soc5outboundops.app` DNS in Cloudflare;
- production and staging Supabase projects;
- the Supabase **transaction pooler** URI, URL, and service-role key;
- reviewed SeaTalk credentials and callback URLs if SeaTalk is enabled; and
- an approved release commit and CI identity.

Never put secrets in Git, Docker build arguments, screenshots, chat, or frontend
environment variables.

## 1. Set the region and cost controls

1. In the AWS console header, choose **Asia Pacific (Singapore)**.
2. Open **Billing and Cost Management** from the account menu.
3. Choose **Budgets → Create budget → Customize (advanced)**.
4. Select **Cost budget**, set the approved monthly amount, and add email alerts
   at 50%, 80%, and 100%.
5. Optionally create a zero-spend budget for Free Tier usage. Budget alerts notify
   owners; they do not stop resources automatically.

## 2. Request the API certificate

1. Search for **Certificate Manager** and open AWS Certificate Manager in
   `ap-southeast-1`.
2. Choose **Request → Request a public certificate → Next**.
3. Under **Fully qualified domain name**, enter
   `api.soc5outboundops.app`.
4. Keep **DNS validation** and the default key algorithm, then choose **Request**.
5. Open the new certificate and copy its CNAME name and value.
6. In Cloudflare, choose **DNS → Records → Add record**, create that CNAME, and
   set **Proxy status** to **DNS only**.
7. Wait until ACM shows **Issued**.

Do not delete the validation CNAME after issuance; ACM uses it for renewal.

## 3. Create the ECR repository

1. Search for **Elastic Container Registry**.
2. In the left navigation, choose **Private registry → Repositories**.
3. Choose **Create repository**.
4. Keep **Private**, set the repository name to `soc5-outbound-api`, and set
   **Image tag mutability** to **Immutable**.
5. Leave encryption at **AES-256** unless the organization requires a KMS key.
6. Choose **Create repository** and copy its URI.
7. Configure image scanning under **Private registry → Settings → Scanning**.
   Repository-level scan-on-push controls are deprecated in the current UI; use
   basic or enhanced registry scanning with a filter for this repository.
8. Add a lifecycle policy that expires untagged images while retaining approved
   release images.

CI builds `backend-nest/Dockerfile`. Tag releases with the full commit SHA rather
than `latest`.

## 4. Create or select the network

For production, use an approved VPC with:

- two public subnets in different Availability Zones for the load balancer;
- two private subnets in different Availability Zones for Fargate tasks;
- an internet gateway for the public subnets; and
- a NAT gateway or approved egress path for private tasks to reach Supabase,
  SeaTalk, Google APIs, and other HTTPS services.

A NAT gateway has fixed and data-processing charges. Confirm the design and
budget before creating one.

### Security groups

Open **EC2 → Network & Security → Security Groups** and create:

1. `soc5-api-alb-sg`
   - inbound HTTPS TCP 443 from approved public sources (or `0.0.0.0/0` and
     `::/0` for a public API);
   - optional inbound HTTP TCP 80 only for redirecting to HTTPS; and
   - outbound TCP 3001 to `soc5-api-task-sg`.
2. `soc5-api-task-sg`
   - inbound TCP 3001 with **source** `soc5-api-alb-sg`; and
   - outbound HTTPS TCP 443 and required DNS/egress according to policy.

Do not expose ports 3001, 5432, or 6543 publicly.

## 5. Store runtime secrets

1. Search for **Secrets Manager**.
2. Choose **Secrets → Store a new secret**.
3. Select **Other type of secret** and use key/value pairs.
4. Store the secret as `/soc5/production/backend-nest` and create a separate
   `/soc5/staging/backend-nest` secret.
5. Keep automatic rotation off unless a tested rotation workflow exists.

At minimum, provide these production values:

```text
NODE_ENV=production
PORT=3001
DATABASE_URL=<Supabase transaction-pooler URI on port 6543>
DATABASE_SSL=true
SUPABASE_URL=<production Supabase URL>
SUPABASE_SERVICE_ROLE_KEY=<server-only service-role key>
CORS_ORIGIN=https://app.soc5outboundops.app
APP_URL=https://api.soc5outboundops.app
```

Use the transaction pooler URI from **Supabase → Connect → Transaction pooler**,
not `db.<project-ref>.supabase.co`. Remote PostgreSQL connections require TLS.

Add the SeaTalk and Google variables from `backend-nest/.env.example` only when
those integrations are enabled. Keep `SEATALK_APPROVAL_ENABLED=false` until
callbacks, signing secrets, Data Scope, migrations, and staging tests are ready.

ECS injects Secrets Manager values through the task definition's **Environment
variables → Secrets** controls. The task execution role—not the application task
role—must be able to call `secretsmanager:GetSecretValue` for the exact secret
ARN and `kms:Decrypt` when a customer-managed KMS key is used.

## 6. Create IAM roles

Open **IAM → Roles → Create role**.

### Task execution role

1. Choose **AWS service** and **Elastic Container Service Task**.
2. Attach `AmazonECSTaskExecutionRolePolicy`.
3. Add a narrowly scoped inline policy allowing `secretsmanager:GetSecretValue`
   for `/soc5/production/backend-nest`.
4. Name it `soc5EcsTaskExecutionRole`.

This role lets ECS pull from ECR, write logs, and inject secrets.

### Application task role

Create another ECS task role named `soc5BackendTaskRole`. Start with no AWS API
permissions. Add only permissions the NestJS process actually needs. Access to
Supabase and SeaTalk uses outbound HTTPS and does not require AWS IAM permissions.

### CI deployment identity

The current Travis deployment script expects `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`. Prefer short-lived OIDC role credentials when the CI
platform and script are updated to support them. Until then, use a dedicated,
restricted IAM user and rotate its key.

Grant only:

- ECR authentication and push actions for `soc5-outbound-api`;
- ECS describe, task-definition registration, and named-service update actions;
- `iam:PassRole` for the two exact ECS roles; and
- STS caller identity.

Do not grant administrator access.

## 7. Create the ECS cluster

1. Search for **Elastic Container Service**.
2. Choose **Clusters → Create cluster**.
3. Set **Cluster name** to `soc5-outbound-production`.
4. Under **Infrastructure**, keep **AWS Fargate (serverless)** selected. The
   current console associates Fargate and Fargate Spot capacity providers
   automatically.
5. Under **Monitoring**, enable **Container Insights with enhanced
   observability** if its additional cost is approved.
6. Choose **Create**.

Use a separate cluster or, at minimum, separate services and secrets for staging.

## 8. Create the API task definition

1. In ECS, choose **Task definitions → Create new task definition**.
2. Set **Task definition family** to `soc5-outbound-api`.
3. Under **Infrastructure requirements**:
   - choose **AWS Fargate**;
   - choose Linux/x86_64 unless the image is deliberately built for ARM64;
   - select initial CPU and memory based on staging measurements;
   - select `soc5EcsTaskExecutionRole`; and
   - select `soc5BackendTaskRole`.
4. Under **Container details**:
   - name: `api`;
   - image URI: the ECR image with its immutable commit-SHA tag;
   - container port: `3001` over TCP;
   - essential container: enabled.
5. Under **Environment variables**, add non-sensitive values as plain variables
   and add sensitive values with **Value type: ValueFrom** using Secrets Manager
   ARNs. If using one JSON secret, reference individual JSON keys where the
   console supports the `secret-arn:json-key::` form.
6. Under **Logging**, select `awslogs`, create/use
   `/ecs/soc5-outbound/production/api`, and set a retention period in CloudWatch.
7. Add a container health check:

   ```text
   CMD-SHELL,wget -qO- http://localhost:3001/up || exit 1
   ```

   The Alpine runtime image includes BusyBox `wget`. `/up` is liveness;
   `/up/ready` additionally verifies PostgreSQL and required Supabase settings.
8. Choose **Create**.

The container listens on port 3001. TLS terminates at the load balancer.

## 9. Create the target group and load balancer

### Target group

1. Open **EC2 → Load Balancing → Target Groups → Create target group**.
2. Choose **IP addresses** because Fargate tasks use `awsvpc` networking.
3. Name it `soc5-outbound-api-tg`, protocol **HTTP**, port **3001**, and select
   the production VPC.
4. Set **Health check protocol** to HTTP and **Health check path** to `/up/ready`.
5. Under **Advanced health check settings**, use success code `200`.
6. Create the group without manually registering targets; ECS registers tasks.

### Application Load Balancer

1. Choose **EC2 → Load Balancers → Create load balancer → Application Load
   Balancer → Create**.
2. Name it `soc5-outbound-api-alb`, use **Internet-facing**, **IPv4** (or
   Dualstack when IPv6 is configured), the production VPC, and at least two
   public subnets.
3. Select `soc5-api-alb-sg`.
4. Add an HTTPS listener on port 443 forwarding to `soc5-outbound-api-tg` and
   select the issued ACM certificate.
5. Optionally add HTTP port 80 with a redirect action to HTTPS 443.
6. Create the load balancer and wait for **Active**.

## 10. Create the ECS API service

1. Open **ECS → Clusters → soc5-outbound-production → Services → Create**.
2. Under **Environment**, choose the Fargate launch type or Fargate capacity
   provider strategy. Do not use Fargate Spot for the only production API task.
3. Select the `soc5-outbound-api` task definition and latest approved revision.
4. Set **Service name** to `soc5-outbound-api`.
5. Set **Desired tasks** to 2 for production availability if budget permits.
6. Under **Networking**, select the private subnets,
   `soc5-api-task-sg`, and **Public IP: Turned off**.
7. Under **Load balancing**, select **Application Load Balancer**, choose the
   existing load balancer, container `api:3001`, listener, and target group.
8. Turn on the **deployment circuit breaker with rollback**.
9. Set **Health check grace period** long enough for application startup.
10. Choose **Create** and wait for deployment status **Successful** and healthy
    targets.

The NestJS process currently contains its outbox, Google sync, and SeaTalk
Approval Center schedulers. Do not create PHP Artisan worker or scheduler tasks;
those belonged to the retired Laravel backend. If separate NestJS worker services
are retained for operational isolation, use the same image with explicit feature
flags so only one service owns each scheduler. Never run duplicate schedulers
without that separation.

## 11. Configure DNS

1. Copy the ALB's **DNS name** from its details page.
2. In Cloudflare **DNS → Records**, create:
   - type: CNAME;
   - name: `api`;
   - target: the ALB DNS name;
   - proxy status: **DNS only** initially;
   - TTL: Auto.
3. Wait for DNS propagation and test
   `https://api.soc5outboundops.app/up/ready`.
4. Keep ACM validation CNAME records set to DNS only.

After direct HTTPS works, Cloudflare proxying is optional. If enabled, use
**SSL/TLS → Overview → Full (strict)**. Never use Flexible mode.

## 12. Configure CI deployment variables

Add these encrypted variables to the protected Travis deployment environment:

```text
PRODUCTION_DEPLOY_ENABLED=true
AWS_ACCESS_KEY_ID=<restricted deployment key>
AWS_SECRET_ACCESS_KEY=<restricted deployment secret>
AWS_DEFAULT_REGION=ap-southeast-1
EXPECTED_AWS_ACCOUNT_ID=<12-digit account ID>
ECR_REPOSITORY_URI=<account>.dkr.ecr.ap-southeast-1.amazonaws.com/soc5-outbound-api
ECS_CLUSTER=soc5-outbound-production
ECS_API_SERVICE=soc5-outbound-api
ECS_API_CONTAINER_NAME=api
```

The existing deployment script also currently requires worker and scheduler
service names. Either provision intentionally isolated NestJS services with
feature flags or update the script before production so it deploys only the API
service. Do not point those variables to the API service as a workaround.

Only protected release tags should publish or deploy. Pull-request builds must
never receive production credentials.

## 13. Logs and alarms

1. Open **CloudWatch → Logs → Log groups** and verify application logs arrive.
2. Set an explicit retention period; the default never-expire behavior can add
   cost and conflict with data policy.
3. Create alarms for:
   - ALB unhealthy host count;
   - ALB target 5xx responses;
   - ECS running task count below desired count;
   - repeated task exits or failed deployments; and
   - elevated application errors.
4. Route alarms through an approved SNS topic and notification destination.
5. Confirm logs never contain database passwords, service-role keys, access
   tokens, callback signatures, or request authorization headers.

## 14. Production release order

1. Rehearse the same architecture in staging.
2. Apply every reviewed Supabase migration in filename order and verify the
   migration ledger.
3. Build the NestJS image from the approved commit, push the immutable SHA tag,
   and record its ECR digest.
4. Register a new task-definition revision using that exact image.
5. Deploy the API service and wait for ECS stability and healthy `/up/ready`
   checks.
6. Deploy the Firebase frontend with only public Supabase settings and the
   production API URL.
7. Validate Supabase login, CORS, authorization, request workflow, Realtime,
   SeaTalk callbacks, outbox processing, Google sync, logs, and alarms.
8. Keep SeaTalk Approval Center disabled until its staging acceptance and
   provider configuration gates pass.
9. Record the release commit, image digest, task-definition revision, service
   deployment, owner, and rollback revision.

## Stop and investigate when

- the AWS account, region, VPC, or environment is ambiguous;
- tasks have public IPs or port 3001 is publicly reachable;
- `/up` succeeds but `/up/ready` fails;
- the Supabase URL uses the direct `db.<project-ref>` host instead of the pooler;
- PostgreSQL reports that SSL is required;
- the ALB reports unhealthy targets;
- ECS cannot read the secret or pull the image;
- duplicate scheduler instances process the same work;
- the release image is not tied to an approved immutable commit; or
- cost, security, backup, migration, or rollback ownership is unclear.
