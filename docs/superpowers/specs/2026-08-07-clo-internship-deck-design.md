# CLO Internship Presentation Deck Design

## Goal

Create a Vietnamese 10–15 minute internship presentation deck that maps the C17 Task & Secure Document Platform to CLO1–CLO5, with a security-first visual style and evidence grounded in the repository.

## Audience and narrative

The audience is the internship supervisor and evaluating lecturer. The deck follows the recommended project-story structure: introduce the organizational security problem, explain the system design, show the secure document flow, then demonstrate development, deployment, operation, teamwork, and CLO coverage.

## Visual direction

- 16:9 widescreen format.
- Dark navy background with mint/teal security accents, white text, and amber/orange for warnings or operational checkpoints.
- Large headings, short bullets, and diagrams that remain readable in a Meet screen share.
- Consistent footer with project name and slide number.
- Use simple vector shapes and icons/labels rather than dense screenshots.

## Slide structure

1. Title: C17 Task & Secure Document Platform; internship CLO presentation.
2. Problem and objectives: task-based access, confidentiality, expiry, auditability.
3. Architecture: API Gateway, 10 NestJS apps, database-per-service, PostgreSQL, Redis, RabbitMQ, MinIO, ClamAV.
4. CLO2 — problem analysis and theory: microservices, least privilege, zero-trust/default deny, event-driven integration, defense in depth.
5. CLO4 — design artifacts: task-to-grant-to-document flow and the main state transitions.
6. Security pipeline: upload → malware scan → AES-256-GCM encryption → signature → encrypted object storage.
7. CLO1 — ethics, compliance, and responsibility: ADMIN/content separation, fail-closed decisions, audit hash chain, handling failures.
8. CLO5 — development stage: NestJS/TypeScript/Prisma implementation, validation, pagination, authorization tests, regression process.
9. CLO5 — deployment: Docker Compose topology and service startup sequence.
10. CLO5 — operation and verification: health checks, logs, audit verification, full backend verification evidence.
11. CLO3 + conclusion: communication/team practices, deliverables, CLO1–CLO5 evidence matrix, next steps.

## Evidence policy

Only repository-backed facts are used. Current verification evidence is stated as “tại thời điểm báo cáo”: 10 backend applications build successfully; the latest full backend test run passed 41 suites and 212 tests; lint passed. Claims about team roles are framed as practices demonstrated by the project workflow, not as invented names or percentages.

## Deliverables

- `docs/presentations/C17-CLO-internship-presentation.pptx` — final deck.
- `scripts/build-clo-internship-deck.sh` — reproducible build command.
- `scripts/create-clo-internship-deck.mjs` — slide artwork and PPTX package generator.

The build command creates slide artwork as SVG, rasterizes it to PNG, packages the images into a standards-compatible PPTX, and validates the ZIP/XML package plus the 11-slide count.
