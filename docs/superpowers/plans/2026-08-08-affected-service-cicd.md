# Affected-Service CI/CD Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep full verification unchanged while making the main-branch image pipeline build only backend services and web images affected by the changed files.

**Architecture:** A small Node ESM classifier receives the changed-path list and emits a backend JSON matrix plus a web-changed flag. GitHub Actions uses those outputs for conditional matrix jobs; changed images receive both immutable SHA tags and the service-specific `latest` tag. The existing EC2 deployment sequence remains one service at a time and deploys `latest`.

**Tech Stack:** GitHub Actions, Node.js 24 built-in `node:test`, Docker Buildx, Docker Compose, Bash.

---

### Task 1: Add test-first changed-service classifier

**Files:**

- Create: `.github/scripts/affected-services.test.mjs`
- Create: `.github/scripts/affected-services.mjs`

- [x] **Step 1: Write failing classification tests**

  Cover these exact behaviors:

  - an `api-gateway` source path maps only to `api-gateway`;
  - a `document-security-service` Prisma schema path maps only to that service;
  - a backend shared library path maps all ten backend services;
  - a root lockfile change maps all backend services and web;
  - a web-only path maps only web;
  - deployment/docs-only paths map no images.

- [x] **Step 2: Run the classifier test and confirm the expected missing-module failure**

  Run:

  ```bash
  node --test .github/scripts/affected-services.test.mjs
  ```

  Expected: FAIL because `.github/scripts/affected-services.mjs` does not exist yet.

- [x] **Step 3: Implement the minimal classifier**

  Export `classifyChangedFiles(files)` returning:

  ```js
  {
    backendApps: string[],
    webChanged: boolean,
  }
  ```

  Map `backend/apps/<app>/...` and `backend/prisma/<app>/...` to the matching app. Escalate to all backend apps for backend shared libraries, backend build configuration, backend Dockerfile, backend package metadata, root workspace dependency files, or root `.npmrc`. Mark web for `frontend/web/...` and root workspace dependency files. When invoked as a CLI, read newline-delimited paths from stdin and write `backend_apps=<JSON>` and `web_changed=<true|false>` to `$GITHUB_OUTPUT` supplied by `--github-output`.

- [x] **Step 4: Run the classifier test and confirm it passes**

  Run:

  ```bash
  node --test .github/scripts/affected-services.test.mjs
  ```

  Expected: all classifier tests pass.

### Task 2: Make GitHub image jobs affected-service aware

**Files:**

- Modify: `.github/workflows/ci.yml`

- [x] **Step 1: Add the change-detection job after `verify`**

  Check out with `fetch-depth: 2`, diff `${{ github.event.before }}` against `${{ github.sha }}`, and pipe the newline-delimited changed paths into the classifier. The job runs only for pushes to `main` and needs `verify`, so verification remains the gate before any image build.

- [x] **Step 2: Replace the static backend matrix with the classifier output**

  Make `build-backend-images` depend on `changes` and use:

  ```yaml
  matrix:
    app: ${{ fromJSON(needs.changes.outputs.backend_apps) }}
  ```

  Skip the job when the JSON list is `[]`. Keep the existing Buildx cache, registry tags, and Dockerfile arguments, but publish only the matrix apps and tag each built image as both `sha-${{ github.sha }}` and `latest`.

- [x] **Step 3: Make the web image conditional**

  Make `build-web-image` depend on `changes`, skip it when `web_changed` is false, and publish both `sha-${{ github.sha }}` and `latest` for the web image.

- [x] **Step 4: Preserve deploy behavior when either image job is skipped**

  Make `deploy-test` depend on `changes`, both image jobs, and use `always()` with explicit success-or-skipped checks. This allows a backend-only, web-only, or docs-only main push to reach deployment without treating a skipped matrix job as failure.

- [x] **Step 5: Validate workflow syntax and classifier integration**

  Run:

  ```bash
  node --test .github/scripts/affected-services.test.mjs
  docker compose --env-file .env.example config --quiet
  ```

  If `actionlint` is available, also run `actionlint .github/workflows/ci.yml`; otherwise inspect the generated workflow expressions and report that the external action validator is unavailable.

  Validation completed with Prettier's YAML parser and Docker Compose config; `actionlint` is not installed in this workspace.

### Task 3: Deploy service-specific latest images

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `deploy/ec2/deploy.sh`
- Modify: `docker-compose.yml`

- [x] **Step 1: Switch the remote deployment tag to `latest`**

  Pass `IMAGE_TAG=latest` to `deploy.sh`. Keep SHA tags in the registry for traceability and rollback.

- [x] **Step 2: Update deployment comments and compose documentation**

  Explain that local images default to `local`, changed CI images advance their service-specific `latest` tag, and immutable SHA tags remain available for rollback.

- [x] **Step 3: Verify deploy script and compose interpolation**

  Run:

  ```bash
  bash -n deploy/ec2/deploy.sh
  docker compose --env-file .env.example config --quiet
  ```

### Task 4: Run the full verification suite

**Files:**

- No additional files.

- [x] **Step 1: Run backend lint, formatting, build, and tests**

  ```bash
  pnpm backend:lint
  pnpm --filter backend format:check
  pnpm backend:build
  pnpm backend:test
  ```

- [x] **Step 2: Run frontend checks**

  ```bash
  pnpm --dir frontend/web lint
  pnpm --dir frontend/web typecheck
  pnpm --dir frontend/web test
  pnpm --dir frontend/web build
  ```

- [x] **Step 3: Run E2E against the full stack**

  ```bash
  pnpm backend:test:e2e
  ```

- [x] **Step 4: Check the final diff and working tree**

  ```bash
  git diff --check
  git status --short --branch
  ```

  Confirm the existing Postman collection remains uncommitted unless the user explicitly requests committing it, and report all verification counts plus any environment warnings.
