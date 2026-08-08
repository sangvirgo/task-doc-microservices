import assert from "node:assert/strict";
import test from "node:test";

import { classifyChangedFiles } from "./affected-services.mjs";

const ALL_BACKEND_APPS = [
  "api-gateway",
  "authentication-identity-service",
  "user-role-management-service",
  "task-management-service",
  "document-management-service",
  "document-security-service",
  "permission-service",
  "audit-log-service",
  "notification-service",
  "security-monitoring-service",
];

test("maps an API Gateway source change only to the API Gateway image", () => {
  assert.deepEqual(
    classifyChangedFiles(["backend/apps/api-gateway/src/main.ts"]),
    {
      backendApps: ["api-gateway"],
      webChanged: false,
    },
  );
});

test("maps a service Prisma schema change only to that service image", () => {
  assert.deepEqual(
    classifyChangedFiles([
      "backend/prisma/document-security-service/schema.prisma",
    ]),
    {
      backendApps: ["document-security-service"],
      webChanged: false,
    },
  );
});

test("maps backend shared library changes to every backend image", () => {
  assert.deepEqual(
    classifyChangedFiles(["backend/libs/contracts/src/permission.ts"]),
    {
      backendApps: ALL_BACKEND_APPS,
      webChanged: false,
    },
  );
});

test("maps workspace dependency changes to every backend image and web", () => {
  assert.deepEqual(classifyChangedFiles(["pnpm-lock.yaml"]), {
    backendApps: ALL_BACKEND_APPS,
    webChanged: true,
  });
});

test("maps CI workflow changes to every backend image and web", () => {
  assert.deepEqual(classifyChangedFiles([".github/workflows/ci.yml"]), {
    backendApps: ALL_BACKEND_APPS,
    webChanged: true,
  });
});

test("maps affected-service classifier changes to every backend image and web", () => {
  assert.deepEqual(
    classifyChangedFiles([".github/scripts/affected-services.mjs"]),
    {
      backendApps: ALL_BACKEND_APPS,
      webChanged: true,
    },
  );
});

test("maps a web-only source change only to web", () => {
  assert.deepEqual(classifyChangedFiles(["frontend/web/src/app/page.tsx"]), {
    backendApps: [],
    webChanged: true,
  });
});

test("does not build images for documentation or deployment-only changes", () => {
  assert.deepEqual(
    classifyChangedFiles([
      "README.md",
      "docs/postman/C17-secure-preview.postman_collection.json",
      "docker-compose.yml",
      "deploy/ec2/deploy.sh",
    ]),
    {
      backendApps: [],
      webChanged: false,
    },
  );
});
