#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
asset_dir="/tmp/c17-clo-internship-deck"

node "$repo_root/scripts/create-clo-internship-deck.mjs" --assets-only

for index in $(seq 1 11); do
  magick "$asset_dir/slide${index}.svg" -strip "$asset_dir/slide${index}.png"
done

node "$repo_root/scripts/create-clo-internship-deck.mjs"
unzip -t "$repo_root/docs/presentations/C17-CLO-internship-presentation.pptx" >/dev/null
echo "Validated: $repo_root/docs/presentations/C17-CLO-internship-presentation.pptx"
