#!/bin/sh
# Script to run nest CLI with correct NODE_PATH for Docker builds
# This script replaces the hardcoded absolute paths with relative paths

NEST_CLI=$(find node_modules/.pnpm -name "nest.js" -path "*/@nestjs/cli/bin/*" | head -1)

if [ -z "$NEST_CLI" ]; then
  echo "Error: nest CLI not found"
  exit 1
fi

# Extract the base directory of the nest CLI package
NEST_PKG_DIR=$(dirname "$(dirname "$NEST_CLI")")

# Set NODE_PATH with relative paths
export NODE_PATH="$NEST_PKG_DIR/node_modules:$NEST_PKG_DIR/../node_modules:node_modules"

# Run the nest CLI with node
exec node "$NEST_CLI" "$@"
