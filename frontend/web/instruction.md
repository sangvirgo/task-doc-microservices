---
name: c17-nextjs-web
summary: Operating instruction for the C17 desktop-first Next.js Web application.
---

# C17 Web operating instruction

## Scope and current state

- Scope is `frontend/web/` only. Do not modify `frontend/mobile/`, backend source, or infrastructure services unless the user explicitly changes scope.
- Current branch is `feat/web-ui-taskdoc`. Do not create, switch, merge, rebase, commit, push, tag, or open a PR without explicit user instruction.
- Phase 1 is implemented. Phase 2 is partial: Task and Document routes, a centralized Gateway client, and focused unit tests already exist. Preserve those files; do not re-scaffold the application.
- Read `../README.md`, `CONTEXT.md`, `CLAUDE.md`, `docs/frontend/frontend-development-guide.md`, this file, `phases.md`, and `backend-frontend-contract-audit.md` before changing a feature.
- Source of truth is current backend source, in this order: Gateway route table, owning controller, owning service, contracts and Prisma schema. Planning documents are not runtime contracts.
- This is a frontend-only project boundary. A missing Gateway route, missing backend guard, or unsuitable DTO is a documented blocker; do not change backend, the Gateway, root Compose, or infrastructure to work around it.
- Before a new feature phase, inspect the audit, propose the exact routes/files/tests, and obtain the user's phase approval. A phase report is required before advancing.

## Gateway boundary

- Browser traffic goes only through the same-origin `/gateway/*` rewrite to the API Gateway. The local Gateway base is `http://localhost:3000`; it has no CORS configuration for direct browser use.
- Never call ports 3001–3009, `/internal/*`, `/api/security/*`, databases, Redis, RabbitMQ, MinIO/S3/R2, ClamAV, or RabbitMQ/MinIO consoles from Web code.
- The gateway derives `x-user-id`, `x-user-role`, and `x-user-capabilities` from the JWT. The browser must never send them.
- Keep all endpoint construction and `fetch` in the typed browser Gateway client. View components must not call `fetch`, Axios, or construct backend URLs.

## Session, data, and security

- Use one namespaced `sessionStorage` record only for access/refresh tokens. Never use localStorage, IndexedDB, cookies, URLs, server props, durable browser caches, logs, telemetry, or analytics for tokens or private content.
- On 401, make one serialized refresh attempt. On refresh failure or unrecoverable 401, atomically clear the session and redirect to login. Never retry 403.
- Preserve a safe correlation ID. Normalize 400, 401, 403, 404, 409, 413, 415, 429, and 503; present a safe generic message rather than raw backend messages.
- Never render, log, persist, or include in URLs: access/refresh tokens, download tickets, object keys, storage URLs, document bytes, comments outside a direct-participant view, credentials, KEKs, IVs, tags, encrypted DEKs, or backend internals.
- Create Blob URLs only for a received download and revoke them immediately after triggering download.
- JWT claims currently issued by Authentication are `sub`, `role`, `capabilities`, `iat`, and `exp`; login currently issues an empty capabilities array. Claims are UX hints only, never authorization.

## Domain rules enforced by the client UX

- Roles are `ADMIN` and `EMPLOYEE`. Hide content/custody navigation for ADMIN, but treat the server as authoritative.
- Direct task participants are creator, current assignee, and explicit participant. Only they may render Comment, activity, participant, submission, or review UI.
- An ancestor-only task response is a six-field summary. It must not trigger, preload, render, or link Comment, activity, participant, Document, upload, preview, or download requests.
- Canonical task statuses are `CREATED`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_REVIEW`, `APPROVED`, `NEED_REVISION`, `REJECTED`, and `CANCELLED`. `BLOCKED` is a boolean condition and `is_overdue` is derived; neither is a lifecycle transition.
- Security levels are `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, and `RESTRICTED`. State-secret is a rejected declaration, never a security-level option.
- Use multipart field `file` for document upload. Use ticket request followed by one redemption for download; never call the deprecated download endpoint.

## Backend gaps and implementation limits

Read the audit document before using a route. In particular:

- `/api/retention-disposal` is not in the Gateway route table even though a backend controller exists. Do not build Retention/Disposal UI.
- Document list and version endpoints lack controller permission checks in the current source. Do not claim document-list authorization is server-verified; keep UI conservative and report the gap.
- Upload validation currently throws 400 for MIME/size checks; ticket replay returns 403; duplicate task participant is the observed 409. Do not fabricate different runtime behavior.
- User, grant, notification, monitoring, and audit controllers have Gateway JWT protection but several lack controller-level role/ownership checks. Client guards are presentation only; do not represent these routes as safely authorized until runtime/backend review resolves the gap.
- `/api/security/*` is proxied but exposes service-internal security operations; it remains forbidden to Web.

## Role-separated information architecture

- EMPLOYEE workspace: Tasks, Documents, Grants, Notifications, Records, and Transfer Packages. Show actions only from a safe UI eligibility rule and reconcile every mutation with the server.
- ADMIN workspace: Users/capabilities, monitoring alerts/rules, and only vetted audit metadata. ADMIN has no content, document, task, grant, record, or archival-custody route/navigation.
- A route hidden by role is never an authorization result. Preserve a safe forbidden state when the server denies it and record any missing server role/ownership guard in the phase report.
- Retention/Disposal remains absent from both workspaces: its backend controller is not public through Gateway. Do not invent a rewrite or call a service directly.

## Toolchain and styling

- Use the root pnpm workspace and shared `pnpm-lock.yaml`; never run npm/yarn or create another lockfile. The repository declares pnpm 9.15.9; report a host-version mismatch rather than silently changing workspace policy.
- Do not add dependencies beyond Next, React, TypeScript, Vitest, jsdom, React Testing Library, jest-dom, user-event, and Playwright without explicit user approval.
- Use App Router, strict TypeScript, CSS Modules, and project-owned semantic CSS custom properties. Light theme only: no dark theme or theme switcher.
- Use client components only for authenticated Gateway interactions. Do not place token data in Server Component props or cache keys.

## Verification modes

### Local verification (phase gate)

Run lint, typecheck, unit/component tests, coverage, production build, and managed-Chromium local browser tests when available. Do not claim completion without actual evidence.

### Runtime integration deferred

- Docker image pulls currently fail with an EOF while downloading CloudFront registry blobs. The stack and Gateway have not been runtime-verified in this environment.
- Work may continue from source-verified contracts and mock/static tests. Run local checks when dependencies permit.
- Docker Compose/backend/Gateway and containerized browser tests are deferred rather than required by the current frontend-only scope. Do not claim endpoint runtime verification or Docker integration; record them as follow-up validation.
- A managed Chromium failure is a local browser-test gap, not permission to substitute a system browser silently.

## Accessibility and UX

- Design desktop-first for 1024px+ and adapt at tablet widths. Use semantic HTML, keyboard operation, visible focus, 44px pointer targets, safe wrapping, accessible labels, and announced loading/error/success states.
- Provide loading, empty, retryable error, permission-denied, pending, and success states. Confirm irreversible actions.
- Do not build realtime chat, WebSockets, offline sync, PWA behavior, direct storage links, analytics, AI summaries, or any mobile-client UI.
