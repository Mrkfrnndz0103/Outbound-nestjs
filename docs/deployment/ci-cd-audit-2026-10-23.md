# CI/CD implementation audit — 23 October 2026

## Scope

The repository configures Travis CI in `.travis.yml`; no GitHub Actions, GitLab,
or other pipeline definition is present. The configured pipeline validates code,
builds Docker images, applies the complete migration chain to an isolated CI
PostgreSQL service, and runs tag-gated staging acceptance. It does not publish
images or deploy/roll back an application; host deployment is manual through the
documented Compose procedure.

## Follow-up: gated AWS ECS deployment wiring

The Travis configuration now orders tag release acceptance before an optional
`publish-production` stage. When `PRODUCTION_DEPLOY_ENABLED=true` is configured
in protected Travis repository settings, the job runs
[`scripts/deploy/deploy-aws-ecs.sh`](../../scripts/deploy/deploy-aws-ecs.sh).
That script publishes the backend image to ECR under the full commit SHA, checks
the expected AWS account, registers task-definition revisions using the image,
and updates the API, worker, then scheduler services while waiting for each to
stabilize. It does not apply database migrations or deploy the Firebase site.

This is repository wiring only. No AWS account identity, Travis encrypted
variables, ECR repository, ECS cluster/services, or production release tag was
configured or exercised here. The branch/tag protections, exact service and
container names, and least-privilege IAM permissions still require account-side
setup. The prior audit rows below describe the earlier implementation state.

## Fixes applied

- PostgreSQL workflow tests and the complete Supabase/Laravel migration-chain
  job now run on pull requests targeting `main`, as well as pushes to `main`.
- Browser E2E tests now run during pull-request validation instead of being
  skipped there.
- The tag-only release acceptance job uses Node 22, installs the locked root
  Playwright dependencies, and installs Chromium with its Linux dependencies.
- Realtime acceptance now recognizes the unique per-subscription channel names
  created by the client and still checks that a connection joins each channel at
  most once.
- Release acceptance accepts an encrypted `STAGING_AUTH_STATE_B64` CI variable,
  writes it to a mode-600 temporary file, validates the JSON, and removes it on
  exit. A protected pre-provisioned file path remains supported.
- Deployment configuration now declares a Docker service and explicit Node/PHP
  tooling; Composer is installed from its signed official installer before its
  audit command is used.

## Remaining controls and evidence

- Travis account settings are outside this repository. Verify that `main` is
  protected by required successful jobs and review, and that the acceptance job
  receives `STAGING_BASE_URL` and a short-lived, staging-only authenticated
  browser state through protected CI variables. Never use production credentials
  in this job.
- The staging URL is not checked against the commit/tag under test. Before
  treating acceptance as release evidence, confirm staging runs the same commit
  as the tag or add a trusted build-SHA endpoint and assert it in the test.
- No automated image publication, host rollout, migration execution against a
  shared environment, rollback, or promotion step is configured. This is a
  manual release process today.
- Travis CLI, Docker, and a Linux shell are unavailable on this workstation.
  YAML parsing, Playwright test syntax, migration planner tests and repository
  diff checks were run locally; the changed Travis jobs and Docker builds still
  need a successful hosted Travis run.

## Local checks

- `.travis.yml` parsed successfully and contains seven jobs.
- `node --check tests/realtime.spec.js` passed.
- Migration deployment tests: 4 passed; exact manifest coverage: 43 migrations.
- `git diff --check` passed.
