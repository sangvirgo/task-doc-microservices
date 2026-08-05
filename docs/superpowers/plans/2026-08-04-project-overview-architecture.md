# Project Overview Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incomplete project overview page with a self-contained layered architecture map and complete system-flow reference.

**Architecture:** Keep one standalone HTML file at `docs/project-overview.html`. Use CSS grid/flex for the five layers, inline SVG/CSS connectors for the high-level map, and small vanilla JavaScript filters/toggles for workflow exploration. Keep explanatory text visible in the DOM so the page remains useful without JavaScript.

**Tech Stack:** Plain HTML5, CSS3, inline SVG, vanilla JavaScript; no external assets or CDN dependencies.

---

### Task 1: Replace the stale overview document

**Files:**
- Delete and recreate: `docs/project-overview.html`

- [ ] **Step 1: Create the document shell and visual system**

  Add a semantic HTML document with:

  - a dark responsive theme;
  - sticky page navigation;
  - accessible headings and skip link;
  - CSS variables for layer/service/infrastructure colors;
  - responsive breakpoints for tablet and mobile widths;
  - no external fonts, scripts, images, or CDN imports.

- [ ] **Step 2: Add the layered architecture map**

  The overview must show these layers in order:

  `Web/Mobile → API Gateway → Security Boundary → Domain Services → Data & Messaging → Infrastructure`.

  Include explicit labels for JWT/caller context, public-vs-internal route policy, HTTP calls, RabbitMQ events, database ownership, MinIO ciphertext, and ClamAV.

- [ ] **Step 3: Add the service catalog**

  Include all ten services with current ports, databases, and responsibilities:

  `api-gateway:3000`, `authentication-identity-service:3001`, `user-role-management-service:3002`, `task-management-service:3003`, `document-management-service:3004`, `document-security-service:3005`, `permission-service:3006`, `audit-log-service:3007`, `notification-service:3008`, and `security-monitoring-service:3009`.

- [ ] **Step 4: Add complete workflow sections**

  Add step-by-step diagrams/cards for:

  1. registration, login, refresh, logout, and lock/session behavior;
  2. task participation and task-to-grant authorization;
  3. permission check, effective expiry, delegation, and cascade revocation;
  4. document upload through scan → checksum → encrypt → sign → store → metadata;
  5. secure download ticket issuance and one-time plaintext redemption;
  6. audit append/chain verification, notification events, and monitoring alerts;
  7. records, sealing, transfer package, archivist separation, and archive;
  8. retention eligibility, holds, disposal approval, execution, and audit survival.

- [ ] **Step 5: Add security invariants and operational reference**

  Include visible callouts for:

  - ADMIN controls platform policy but never content;
  - EMPLOYEE is the content-participating role;
  - default-deny/fail-closed authorization;
  - every grant has effective expiry;
  - audit has one writer and survives disposal;
  - only ciphertext reaches object storage;
  - clients call Gateway only and never `/internal/*`, databases, or infrastructure ports.

- [ ] **Step 6: Add vanilla JavaScript exploration controls**

  Implement filter buttons for `All`, `Authorization`, `Content Security`, `Evidence`, and `Archive`, plus collapsible workflow details. The default view must show the full overview; filters may hide details but must not delete explanatory content from the DOM.

- [ ] **Step 7: Validate the replacement page**

  Run:

  ```bash
  test "$(rg -o '<!DOCTYPE html>' docs/project-overview.html | wc -l)" -eq 1
  node --check /tmp/project-overview-inline-check.js
  rg -q 'API Gateway|Authentication|Task Management|Document Management|Document Security|Permission|Audit|Notification|Security Monitoring' docs/project-overview.html
  rg -q 'retention|disposal|transfer package|download ticket|RabbitMQ|MinIO|ClamAV' docs/project-overview.html
  git diff --check
  ```

  Extract the inline JavaScript into `/tmp/project-overview-inline-check.js` only for syntax checking; do not add that temporary file to the repository.

- [ ] **Step 8: Commit the HTML replacement**

  ```bash
  git add docs/project-overview.html
  git commit -m "docs: rebuild complete project architecture overview"
  ```
