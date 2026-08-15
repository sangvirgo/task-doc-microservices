#!/usr/bin/env bash

set -euo pipefail

pull_service_with_retry() {
  local service="$1"
  local max_attempts="${DOCKER_PULL_MAX_ATTEMPTS:-5}"
  local retry_delay="${DOCKER_PULL_RETRY_DELAY_SECONDS:-10}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    if docker compose --env-file .env pull "$service"; then
      return 0
    fi

    if (( attempt == max_attempts )); then
      echo "Failed to pull $service after $max_attempts attempts" >&2
      return 1
    fi

    echo "Pull failed for $service (attempt $attempt/$max_attempts); retrying in ${retry_delay}s" >&2
    sleep "$retry_delay"
    retry_delay=$((retry_delay * 2))
    attempt=$((attempt + 1))
  done
}

main() {
  local deploy_dir
  deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
  cd "$deploy_dir"

  : "${IMAGE_PREFIX:?IMAGE_PREFIX must be set}"
  : "${IMAGE_TAG:?IMAGE_TAG must be set}"

  if [[ ! -f .env ]]; then
    echo "Missing $deploy_dir/.env" >&2
    exit 1
  fi

  export IMAGE_PREFIX IMAGE_TAG

  # Pull and replace one application image at a time because the EC2 host has limited disk space.
  # CI advances only the `latest` tag for services whose source changed; unchanged services keep
  # their previous latest image. Immutable sha-* tags remain available for rollback.
  # Keeping old and new large backend layers during a parallel pull can exhaust containerd.
  services=(
    api-gateway
    authentication-identity-service
    user-role-management-service
    task-management-service
    document-management-service
    document-security-service
    permission-service
    audit-log-service
    notification-service
    security-monitoring-service
    web
  )

  for service in "${services[@]}"; do
    echo "Deploying $service"
    pull_service_with_retry "$service"
    docker compose --env-file .env up -d --no-build --no-deps "$service"
    docker image prune -af
  done

  docker compose --env-file .env ps
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
