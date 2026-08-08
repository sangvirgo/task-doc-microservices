# Affected-Service CI/CD Build Design

## Goal

Keep the existing full verification pipeline, but build and publish only the container images affected by a change on `main`.

## Scope

- Keep `verify` unchanged, including full backend build and full-stack E2E coverage.
- Add a change-detection job for `main` pushes.
- Build backend images through a dynamic matrix containing only affected applications.
- Build the web image only when the web app or shared web dependencies change.
- Treat backend shared libraries, backend build inputs, and workspace dependency files as affecting every backend image.
- Preserve immutable `sha-<commit>` tags and update `latest` only for images built by the current workflow.
- Deploy with `latest`, allowing unchanged services to retain their previous image while changed services receive the new image.

## Change classification

Backend application source changes map to the matching image:

| Changed path | Image impact |
| --- | --- |
| `backend/apps/api-gateway/**` | `api-gateway` |
| `backend/apps/authentication-identity-service/**` | `authentication-identity-service` |
| `backend/apps/user-role-management-service/**` | `user-role-management-service` |
| `backend/apps/task-management-service/**` | `task-management-service` |
| `backend/apps/document-management-service/**` | `document-management-service` |
| `backend/apps/document-security-service/**` | `document-security-service` |
| `backend/apps/permission-service/**` | `permission-service` |
| `backend/apps/audit-log-service/**` | `audit-log-service` |
| `backend/apps/notification-service/**` | `notification-service` |
| `backend/apps/security-monitoring-service/**` | `security-monitoring-service` |

The following changes affect all backend images because they are copied or consumed by every backend build:

- `backend/libs/**`
- `backend/infra/Dockerfile`
- `backend/package.json`
- `backend/tsconfig.json`, `backend/tsconfig.build.json`, `backend/nest-cli.json`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`

The web image is affected by `frontend/web/**` and shared workspace dependency files. Deployment-only files such as `docker-compose.yml` and `deploy/**` do not require an image build, but still allow the deploy job to run.

## Workflow and deployment

The workflow computes a JSON backend application list and a web-changed boolean from the push range. Dynamic image jobs are skipped when their affected set is empty. The deploy job tolerates skipped image jobs and runs after the successful verification/change-detection jobs.

Each built image is pushed with:

- `sha-${{ github.sha }}` for rollback and traceability;
- `latest` for the service-specific current deployment image.

The EC2 deployment keeps the existing service-by-service pull/restart sequence and uses `IMAGE_TAG=latest`. This avoids requiring an image for every service at every commit while preserving SHA tags in the registry for rollback workflows.

## Safety and failure behavior

- A shared backend or dependency change intentionally falls back to building all backend images.
- A malformed or unavailable change list fails the change-detection job rather than silently skipping builds.
- Verify remains the release gate and continues to build/run the complete application stack for E2E.
- Existing deploy concurrency and one-service-at-a-time image replacement remain unchanged.

## Validation

- Validate the workflow YAML and shell/JSON expressions used for change classification.
- Run backend lint, format, build, unit/integration tests, frontend lint/typecheck/tests/build, and E2E.
- Confirm a source change maps to one backend image, a shared change maps to all backend images, a web-only change maps to web, and docs-only changes map to no image build.
