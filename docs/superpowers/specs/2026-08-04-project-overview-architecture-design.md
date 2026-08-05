# Project Overview Architecture Diagram

## Goal

Replace the incomplete `docs/project-overview.html` with a self-contained, responsive architecture guide that explains the complete C17 Task & Secure Document Platform from client entry points to storage and infrastructure.

## Design

Use a layered architecture view as the primary mental model:

1. Client layer: Web and Mobile clients call only the API Gateway.
2. Gateway/security layer: JWT validation, caller context, public route policy, and internal-route isolation.
3. Domain service layer: all ten NestJS services, grouped by identity, work, content, evidence, and monitoring responsibilities.
4. Data and messaging layer: nine isolated PostgreSQL databases, Redis, RabbitMQ, and service-to-service HTTP.
5. Infrastructure/security layer: MinIO ciphertext storage, ClamAV scanning, encryption keys, and Docker Compose.

The HTML will include:

- An interactive overview diagram with layer and workflow filters.
- Service/port/database responsibility cards.
- End-to-end flow diagrams for authentication, task-to-grant authorization, upload/security pipeline, download tickets, audit/notifications/monitoring, records/transfer, and retention/disposal.
- A security invariants panel covering ADMIN/EMPLOYEE separation, fail-closed decisions, grant expiry, audit single-writer behavior, and ciphertext-only storage.
- A legend distinguishing synchronous HTTP, asynchronous RabbitMQ events, database ownership, and protected/internal paths.

## Constraints

- Keep the file at `docs/project-overview.html` and replace the old content completely.
- Use plain HTML, CSS, and JavaScript only; no external CDN or runtime dependency.
- Keep terminology and service names aligned with `README.md`, `CONTEXT.md`, ADRs, and the backend implementation.
- Make the page readable on desktop and tablet widths and usable without JavaScript for the core explanatory text.
- Do not claim runtime behavior that is not represented by the repository documentation or verified tests.

## Validation

- Confirm the old file is replaced, not appended to.
- Check HTML syntax and JavaScript syntax.
- Search the final page for all ten services, the main infrastructure components, and every required workflow.
- Run `git diff --check`.
