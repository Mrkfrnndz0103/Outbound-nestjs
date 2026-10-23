#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'Production deployment stopped: %s\n' "$1" >&2
  exit 1
}

[[ "${TRAVIS_TAG:-}" != "" ]] || fail "this job must run from a release tag"
[[ "${TRAVIS_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]] || fail "TRAVIS_COMMIT must be a full commit SHA"
[[ "${PRODUCTION_DEPLOY_ENABLED:-}" == "true" ]] || fail "PRODUCTION_DEPLOY_ENABLED is not true"

required_vars=(
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_DEFAULT_REGION
  EXPECTED_AWS_ACCOUNT_ID
  ECR_REPOSITORY_URI
  ECS_CLUSTER
  ECS_API_SERVICE
  ECS_WORKER_SERVICE
  ECS_SCHEDULER_SERVICE
)
for name in "${required_vars[@]}"; do
  [[ -n "${!name:-}" ]] || fail "required Travis variable ${name} is missing"
done

[[ "${TRAVIS_PULL_REQUEST:-false}" == "false" ]] || fail "pull-request builds cannot deploy"

actual_account_id="$(aws sts get-caller-identity --query Account --output text)"
[[ "$actual_account_id" == "$EXPECTED_AWS_ACCOUNT_ID" ]] || fail "AWS credentials resolve to an unexpected account"

registry_host="${ECR_REPOSITORY_URI%%/*}"
repository_name="${ECR_REPOSITORY_URI#*/}"
[[ "$registry_host" != "$repository_name" && "$repository_name" != */* ]] || fail "ECR_REPOSITORY_URI must identify one repository"
[[ "$registry_host" == "$EXPECTED_AWS_ACCOUNT_ID.dkr.ecr."* ]] || fail "ECR registry account does not match EXPECTED_AWS_ACCOUNT_ID"

image_uri="${ECR_REPOSITORY_URI}:${TRAVIS_COMMIT}"
docker login --username AWS --password-stdin "$registry_host" \
  <<< "$(aws ecr get-login-password --region "$AWS_DEFAULT_REGION")"
docker build --pull --file backend/Dockerfile --tag "$image_uri" backend
docker push "$image_uri"

image_digest="$(aws ecr describe-images \
  --repository-name "$repository_name" \
  --image-ids "imageTag=${TRAVIS_COMMIT}" \
  --query 'imageDetails[0].imageDigest' \
  --output text)"
[[ "$image_digest" == sha256:* ]] || fail "ECR did not return the pushed image digest"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

deploy_service() {
  local service_name="$1"
  local container_name="$2"
  local service_json current_task_definition task_json task_file new_task_definition

  service_json="$(aws ecs describe-services \
    --cluster "$ECS_CLUSTER" \
    --services "$service_name" \
    --output json)"
  [[ "$(jq '[.services[]?] | length' <<< "$service_json")" == "1" ]] \
    || fail "ECS service ${service_name} was not found exactly once"
  [[ "$(jq '.failures | length' <<< "$service_json")" == "0" ]] \
    || fail "ECS could not describe service ${service_name}"

  current_task_definition="$(jq -r '.services[0].taskDefinition' <<< "$service_json")"
  task_json="$(aws ecs describe-task-definition \
    --task-definition "$current_task_definition" \
    --query taskDefinition \
    --output json)"
  [[ "$(jq --arg name "$container_name" '[.containerDefinitions[] | select(.name == $name)] | length' <<< "$task_json")" == "1" ]] \
    || fail "task definition for ${service_name} must contain exactly one ${container_name} container"

  task_file="$work_dir/${service_name}.json"
  jq --arg image "$image_uri" --arg name "$container_name" '
    (.containerDefinitions[] | select(.name == $name) | .image) = $image
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)
  ' <<< "$task_json" > "$task_file"

  new_task_definition="$(aws ecs register-task-definition \
    --cli-input-json "file://${task_file}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)"
  [[ "$new_task_definition" == arn:*:task-definition/*:* ]] \
    || fail "ECS did not return a registered task definition for ${service_name}"

  printf 'Deploying %s with %s\n' "$service_name" "$TRAVIS_COMMIT"
  aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service "$service_name" \
    --task-definition "$new_task_definition" \
    --output text >/dev/null
  aws ecs wait services-stable \
    --cluster "$ECS_CLUSTER" \
    --services "$service_name"
}

# Roll out the API first and wait for health before changing background tasks.
deploy_service "$ECS_API_SERVICE" "${ECS_API_CONTAINER_NAME:-api}"
deploy_service "$ECS_WORKER_SERVICE" "${ECS_WORKER_CONTAINER_NAME:-worker}"
deploy_service "$ECS_SCHEDULER_SERVICE" "${ECS_SCHEDULER_CONTAINER_NAME:-scheduler}"

printf 'Production rollout completed: commit=%s image_digest=%s\n' \
  "$TRAVIS_COMMIT" "$image_digest"
