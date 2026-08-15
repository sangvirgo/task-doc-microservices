# Phase 1 Verification Commands

## Setup
```bash
pnpm install --frozen-lockfile
cp .env.example .env
# Replace placeholders in .env with non-secret values
```

## Build
```bash
pnpm build
# Output: 10/10 applications built
```

## Tests
```bash
pnpm lint
# ✓ ESLint with TypeScript strict mode

pnpm format:check
# ✓ Prettier format validation

pnpm test
# 43 passing unit tests

pnpm test:e2e
# 30 passing E2E tests (health endpoints)

pnpm smoke
# 10/10 services respond to /health
```

## Infrastructure
```bash
docker compose --env-file .env.example config --quiet
# ✓ Docker Compose syntax valid

docker compose up -d postgres redis rabbitmq minio clamav
# Starts infrastructure for integration tests
```

## Manual Service Start
```bash
# Single service (e.g., permission-service on port 3006)
node dist/apps/permission-service/src/main.js

# Check health
curl http://localhost:3006/health

# Check permission endpoint
curl -X POST http://localhost:3006/internal/permissions/check \
  -H 'Content-Type: application/json' \
  -d '{
    "actor_id": "11111111-1111-4111-8111-111111111111",
    "resource_type": "DOCUMENT",
    "resource_id": "22222222-2222-4222-8222-222222222222",
    "action": "DOWNLOAD",
    "task_id": "33333333-3333-4333-8333-333333333333",
    "correlation_id": "44444444-4444-4444-8444-444444444444"
  }'

# Expected response (default deny):
# {"allowed":false,"reason_code":"NO_GRANT","effective_expires_at":null}
```

## Repository Invariants
```bash
# Verify no pnpm-workspace.yaml
ls -la pnpm-workspace.yaml 2>&1 | grep "cannot access"

# Verify no per-app package.json
find apps libs -name package.json 2>/dev/null | wc -l
# Should output: 0

# Verify all applications in nest-cli.json
grep -c '"type": "application"' nest-cli.json
# Should output: 10

# Verify all applications have directories
ls apps | wc -l
# Should output: 10
```
