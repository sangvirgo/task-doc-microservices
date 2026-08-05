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

docker compose --env-file .env pull
docker compose --env-file .env up -d --no-build --remove-orphans
docker compose --env-file .env ps
