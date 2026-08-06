#!/usr/bin/env bash

set -euo pipefail

deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$deploy_dir"

: "${IMAGE_PREFIX:?IMAGE_PREFIX must be set}"
: "${IMAGE_TAG:?IMAGE_TAG must be set}"

if [[ ! -f .env ]]; then
  echo "Missing $deploy_dir/.env" >&2
  exit 1
fi

export IMAGE_PREFIX IMAGE_TAG

attempt=1
max_attempts=3
until docker compose --env-file .env pull; do
  if (( attempt >= max_attempts )); then
    echo "docker compose pull failed after ${max_attempts} attempts" >&2
    exit 1
  fi

  echo "docker compose pull failed (attempt ${attempt}/${max_attempts}), retrying..." >&2
  attempt=$((attempt + 1))
  sleep 5
done

docker compose --env-file .env up -d --no-build --remove-orphans
docker compose --env-file .env ps
