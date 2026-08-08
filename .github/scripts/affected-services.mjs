import { appendFileSync, readFileSync } from "node:fs";

export const BACKEND_APPS = [
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

const SHARED_WORKSPACE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
]);

const CI_ALL_IMAGES_FILES = new Set([
  ".github/scripts/affected-services.mjs",
]);

const ALL_BACKEND_PREFIXES = [
  "backend/libs/",
  "backend/infra/Dockerfile",
  "backend/package.json",
  "backend/.npmrc",
  "backend/tsconfig.json",
  "backend/tsconfig.build.json",
  "backend/nest-cli.json",
];

function addAllBackendApps(target) {
  BACKEND_APPS.forEach((app) => target.add(app));
}

function appFromPath(file, root) {
  const prefix = `${root}/`;
  if (!file.startsWith(prefix)) return null;

  const remainder = file.slice(prefix.length);
  const separator = remainder.indexOf("/");
  if (separator <= 0) return null;

  const app = remainder.slice(0, separator);
  return BACKEND_APPS.includes(app) ? app : null;
}

export function classifyChangedFiles(files) {
  const backendApps = new Set();
  let webChanged = false;

  for (const rawFile of files) {
    const file = String(rawFile).trim();
    if (!file) continue;

    if (file.startsWith(".github/workflows/") || CI_ALL_IMAGES_FILES.has(file)) {
      addAllBackendApps(backendApps);
      webChanged = true;
      continue;
    }

    if (SHARED_WORKSPACE_FILES.has(file)) {
      addAllBackendApps(backendApps);
      webChanged = true;
      continue;
    }

    if (file.startsWith("frontend/web/")) {
      webChanged = true;
    }

    if (
      ALL_BACKEND_PREFIXES.some(
        (prefix) => file === prefix || file.startsWith(prefix),
      )
    ) {
      addAllBackendApps(backendApps);
      continue;
    }

    const backendApp =
      appFromPath(file, "backend/apps") || appFromPath(file, "backend/prisma");
    if (backendApp) {
      backendApps.add(backendApp);
      continue;
    }

    // Fail closed for a new or otherwise unrecognised backend app/schema path.
    if (
      file.startsWith("backend/apps/") ||
      file.startsWith("backend/prisma/")
    ) {
      addAllBackendApps(backendApps);
    }
  }

  return {
    backendApps: BACKEND_APPS.filter((app) => backendApps.has(app)),
    webChanged,
  };
}

function parseOutputPath(argv) {
  const flagIndex = argv.indexOf("--github-output");
  if (flagIndex === -1 || !argv[flagIndex + 1]) {
    throw new Error("Usage: affected-services.mjs --github-output <path>");
  }
  return argv[flagIndex + 1];
}

if (process.argv[1]?.endsWith("/affected-services.mjs")) {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const changedFiles = readFileSync(0, "utf8").split(/\r?\n/u);
  const result = classifyChangedFiles(changedFiles);

  appendFileSync(
    outputPath,
    `backend_apps=${JSON.stringify(result.backendApps)}\nweb_changed=${result.webChanged}\n`,
  );
}
