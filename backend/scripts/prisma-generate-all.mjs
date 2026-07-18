import { execFileSync } from 'node:child_process';

const schemaPaths = [
  'prisma/authentication-identity-service/schema.prisma',
  'prisma/user-role-management-service/schema.prisma',
  'prisma/task-management-service/schema.prisma',
  'prisma/document-management-service/schema.prisma',
  'prisma/document-security-service/schema.prisma',
  'prisma/permission-service/schema.prisma',
  'prisma/audit-log-service/schema.prisma',
  'prisma/notification-service/schema.prisma',
  'prisma/security-monitoring-service/schema.prisma',
];

function runPnpm(args) {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    execFileSync(process.execPath, [npmExecPath, ...args], { stdio: 'inherit' });
    return;
  }

  execFileSync('pnpm', args, { stdio: 'inherit' });
}

for (const schemaPath of schemaPaths) {
  console.log(`Generating Prisma client for ${schemaPath}`);
  runPnpm(['exec', 'prisma', 'generate', '--schema', schemaPath]);
}
