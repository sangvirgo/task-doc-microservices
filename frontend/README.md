# Frontend Applications

## Overview

The C17 Task and Secure Document Platform has two separate frontend clients:

- **Web** (`frontend/web/`) — Next.js + TypeScript responsive web application
- **Mobile** (`frontend/mobile/`) — Flutter + Dart native mobile application

Both applications consume the same backend through the API Gateway. They share
backend API contracts, domain terminology, authentication rules, role and capability
rules, canonical enums and statuses, security requirements, upload/download workflows,
and error-handling expectations.

They do **not** share runtime UI source code. Web uses TypeScript models; Mobile uses
Dart models. API schemas may be used to generate typed clients for each platform
independently.

## Directory Ownership

### frontend/web/

- **Framework:** Next.js
- **Language:** TypeScript
- **Primary target:** desktop/laptop browsers
- **Secondary target:** tablet browsers
- **Mobile browser support:** secondary — the official mobile app is Flutter
- **Workflows:** administrative and data-dense screens, dashboards, task management,
  document management, permission management, records and transfer-package workflows,
  security alert management

### frontend/mobile/

- **Framework:** Flutter
- **Language:** Dart
- **Platforms:** Android and iOS (one shared codebase)
- **Primary target:** touch-first mobile workflows
- **Not a WebView wrapper** — native Flutter widgets, not the Next.js site embedded
  in a mobile shell
- **Workflows:** assigned task list, task details, document metadata, file upload,
  ticket-based secure download, notifications, account handling

## Current Implementation Status

| Application | Location | Technology | Status |
|---|---|---|---|
| Web | `frontend/web/` | Next.js + TypeScript | Planned — not initialized |
| Mobile | `frontend/mobile/` | Flutter + Dart | Planned — not initialized |

No frontend framework code has been implemented yet. The `frontend/web/` and
`frontend/mobile/` directories currently contain only their respective README files.

## Shared Integration Rules

Both applications must:

- Call the **API Gateway only** — never call service ports 3001–3009
- Never call `/internal/*` endpoints
- Never query service databases directly
- Never connect to Redis, RabbitMQ, ClamAV, or MinIO/S3/R2 directly
- Never upload directly to MinIO/S3/R2
- Never store backend secrets (JWT signing secret, KEK, database credentials, MinIO access keys)
- Use the real authentication contract (Bearer token, refresh rotation)
- Use canonical enums and statuses from the backend
- Treat backend authorization as authoritative — frontend route guards are UX only
- Preserve correlation IDs (`x-correlation-id`) from error responses
- Use the secure upload flow (multipart with metadata fields)
- Use the ticket-based download flow (request ticket, then redeem)
- Never expose `object_key`
- Never send trusted internal identity headers (`x-user-id`, `x-user-role`, `x-user-capabilities`)

## Separate Runtime Code

- Web and Flutter do **not** share runtime UI code
- Web uses TypeScript models and types
- Mobile uses Dart models and types
- API schemas/contracts may be generated separately for each platform when supported
- Do not import TypeScript code directly into Flutter
- Do not share component implementations across platforms

## Documentation Links

| Document | Path |
|---|---|
| Frontend overview | [frontend/README.md](README.md) |
| Web application | [frontend/web/README.md](web/README.md) |
| Flutter Mobile application | [frontend/mobile/README.md](mobile/README.md) |
| Frontend development guide | [docs/frontend/frontend-development-guide.md](../docs/frontend/frontend-development-guide.md) |
