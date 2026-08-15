# C17 Web application

Next.js 16 frontend for the Task Document platform. It only talks to the public API Gateway through the same-origin `/gateway/*` rewrite; browser code never calls backend service ports directly.

## Included surfaces

- Employee: tasks, documents (upload, preview metadata, ticketed download), grants, notifications, records, transfer packages, retention/disposal.
- Administrator: user/capability management, monitoring alerts/rules, and read-only audit metadata.
- Role separation is enforced in the UI and again by the Gateway/backend. Audit never renders payloads, hashes, actor IDs, or resource IDs and cannot append events.

## Run the full Docker stack

Prerequisites: Docker Desktop running in Linux-container mode, Compose v2, and at least 8 GB RAM available to Docker. Node 24 plus Corepack is needed only for local (non-Docker) frontend checks.

From the repository root:

```powershell
Copy-Item .env.example .env
# Edit .env: replace every `replace-me-local-only` value with local throwaway secrets.
docker compose config --services
docker compose up --build
```

Wait until `api-gateway` and `web` are healthy, then open:

| Service | URL |
| --- | --- |
| Web frontend | http://localhost:3100 |
| API Gateway | http://localhost:3000 |
| RabbitMQ management | http://localhost:15672 |
| MinIO console | http://localhost:9001 |

Do not use ports 3001–3009 from the browser; they are internal service ports. The Web container is configured with `NEXT_PUBLIC_API_BASE_URL=http://api-gateway:3000`, and Next.js rewrites browser `/gateway/*` requests to Gateway `/api/*`.

Useful diagnostics:

```powershell
docker compose ps
docker compose logs -f web api-gateway
docker compose down                 # stop services, retain volumes
docker compose down -v              # reset all local Docker data
```

If Docker reports `dockerDesktopLinuxEngine` missing, start Docker Desktop and wait for it to finish initializing before retrying. If an image pull ends in EOF, retry after Docker is healthy; this is registry/runtime setup, not a frontend test pass.

## Accounts and manual test flow

Public registration creates **EMPLOYEE** accounts only. Create an employee at `http://localhost:3100/login` (password minimum 8 characters), then sign in.

For ADMIN pages, use an administrator provisioned by the deployment/DB owner. Do not invent or commit an admin password: public registration intentionally rejects ADMIN creation. An existing admin can create users and manage employee capabilities.

Suggested employee smoke test:

1. Register and log in; verify the workspace navigation shows employee features only.
2. Create a task; open it, assign/add a participant, add a comment, change lifecycle, submit and review where server role permits.
3. Upload an allowed file (PDF, TXT, PNG, JPEG, DOC or DOCX; default maximum 25 MiB), open document metadata, request a ticketed download once.
4. Exercise grants and notification preferences; verify server-denied requests remain denied in UI.
5. Create a record, add a document version, seal it; create/submit/receive/decide a transfer package using appropriately capable employee accounts.
6. Open Retention & disposal; place/release a hold, run eligibility, and test approval/execution only with an employee granted `DISPOSAL_APPROVE` and document `DISPOSE` permission.

Suggested administrator smoke test:

1. Sign in as provisioned ADMIN; verify employee navigation is absent.
2. Visit Users & capabilities, Monitoring, and Audit metadata.
3. Create/lock/unlock employee accounts and alter their capabilities.
4. Create/toggle monitoring rules and resolve alerts.
5. In Audit metadata, verify the chain. Confirm no event payload/hash/identifier field or write action is exposed.

## Local frontend checks

```powershell
corepack pnpm --filter @c17/web lint
corepack pnpm --filter @c17/web typecheck
corepack pnpm --filter @c17/web test
corepack pnpm --filter @c17/web build
corepack pnpm --filter @c17/web test:e2e
```

Playwright E2E requires its managed browser once per machine:

```powershell
corepack pnpm --filter @c17/web exec playwright install chromium
```

`test:e2e` is not a passing check until Chromium is installed and launches. The current frontend’s static verification is lint, TypeScript, unit tests, and production build; Docker/Gateway validation must be performed against a running stack.

## Security rules

- Tokens live only in `sessionStorage`; a 401 triggers refresh once, then local session cleanup.
- All requests use typed `gatewayClient`, normalized errors, and correlation IDs.
- Document ticket redemption is single-use; temporary Blob URLs are revoked.
- Never add browser calls to `/api/security`, `/internal`, infrastructure URLs, or service ports.
- Never put secrets in `NEXT_PUBLIC_*` variables or log tokens, document bytes, object keys, or raw backend errors.