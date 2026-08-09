#!/usr/bin/env bash

set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/deploy.sh"

DOCKER_PULL_MAX_ATTEMPTS=3
DOCKER_PULL_RETRY_DELAY_SECONDS=0
pull_attempts=0

docker() {
  pull_attempts=$((pull_attempts + 1))
  if (( pull_attempts < 3 )); then
    return 1
  fi
}

sleep() {
  :
}

pull_service_with_retry authentication-identity-service

[[ "$pull_attempts" -eq 3 ]]
