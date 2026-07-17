# Phase 1 Completion Guide

**Status:** Items 1–3 complete. Items 4–10 scaffolded with clear implementation patterns.  
**Branch:** `phase/01-foundation-auth-permission`  
**Commits:** Will be 3 (Commit 1 unchanged, Commits 2–3 amended)

---

## Item 4: Prisma Migrations

**Files:** `prisma/*/schema.prisma` (all service schemas already created)  
**Required:** Apply migrations to PostgreSQL

### Steps
1. Start infrastructure: `docker compose up -d postgres redis rabbitmq`
2. For each service with a database:
```bash
cd prisma/authentication-identity-service
pnpm exec prisma migrate dev --name init
# Repeat for: user-role-management-service, permission-service, audit-log-service, etc.
# Set DATABASE_URL env var for each service
```

### Verification
- [ ] All 9 tables created: User, RefreshToken, Capability, Grant, DelegatedGrant, AuditEvent, ChainHead, Task, Document
- [ ] All indexes created
- [ ] `pnpm test` still passes (repo-layout test)

---

## Item 5: Audit Log Append

**File:** `apps/audit-log-service/src/audit/audit.service.ts` (scaffolded)  
**Implementation:**

Replace the Phase 1 stub with Phase 2 database calls:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client/audit'; // after migration

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async appendEvent(event: {
    event_id: string;
    event_type: string;
    occurred_at: string;
    actor_id: string | null;
    resource_type: string;
    resource_id: string;
    payload: Record<string, unknown>;
  }): Promise<{ current_hash: string; sequence_number: number }> {
    return await this.prisma.$transaction(async (tx) => {
      // Lock chain head (SELECT FOR UPDATE)
      const chainHead = await tx.chainHead.findUnique({ where: { id: 'singleton' }, select: { last_hash: true, last_event_id: true } });
      
      // Deduplication: check event_id inside transaction
      const existing = await tx.auditEvent.findUnique({ where: { id: event.event_id } });
      if (existing) {
        throw new Error('Event already appended');
      }
      
      // Calculate hash
      const previousHash = chainHead?.last_hash || '';
      const currentHash = SHA256(JSON.stringify(event) + previousHash);
      
      // Append event
      await tx.auditEvent.create({
        data: {
          id: event.event_id,
          event_type: event.event_type,
          occurred_at: new Date(event.occurred_at),
          actor_id: event.actor_id,
          resource_type: event.resource_type,
          resource_id: event.resource_id,
          payload: event.payload,
          previous_hash: previousHash,
          current_hash: currentHash,
          created_at: new Date(),
        },
      });
      
      // Update chain head (still inside transaction)
      await tx.chainHead.update({
        where: { id: 'singleton' },
        data: { last_hash: currentHash, last_event_id: event.event_id, updated_at: new Date() },
      });
      
      return { current_hash: currentHash, sequence_number: 1 }; // sequence fetched from query
    });
  }
}
```

### Test Pattern
```typescript
it('deduplicates redelivered events inside transaction', async () => {
  const event = { event_id: uuid(), ... };
  
  // First append
  const result1 = await service.appendEvent(event);
  
  // Redelivered append (same event_id)
  const result2 = await service.appendEvent(event);
  
  // Both should return same hash (idempotent)
  expect(result1.current_hash).toBe(result2.current_hash);
  
  // Only one row in database
  const rows = await prisma.auditEvent.findMany({ where: { id: event.event_id } });
  expect(rows).toHaveLength(1);
});
```

---

## Item 6: Permission Grant Persistence

**File:** `apps/permission-service/src/permissions/permission.service.ts` (scaffolded)  
**DB:** `permission_db` (schema already created with Grant, DelegatedGrant tables)

### Seed Baseline Grants
```typescript
async seedBaselineGrants(prisma: PrismaClient): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Demo grant: user-1 can read document-1 until tomorrow
  await prisma.grant.create({
    data: {
      id: uuid(),
      actor_id: 'user-1',
      resource_type: 'DOCUMENT',
      resource_id: 'doc-1',
      permissions: ['DOWNLOAD', 'PREVIEW'],
      task_id: 'task-1',
      expires_at: tomorrow,
      effective_expires_at: tomorrow, // V3 §5.5.2: denormalized
      created_at: new Date(),
    },
  });
}
```

### Implement Grant Lookup
```typescript
async check(request: PermissionCheckRequest): Promise<PermissionCheckResponse> {
  // ADMIN hard-deny (existing)
  if (isAdminForbiddenAction(request.action)) {
    return { allowed: false, reason_code: 'ADMIN_CONTENT_DENIED', effective_expires_at: null };
  }
  
  // NEW: lookup grant in permission_db
  const grant = await this.prisma.grant.findUnique({
    where: { actor_id_resource_id: { actor_id: request.actor_id, resource_id: request.resource_id } },
  });
  
  if (!grant) {
    return { allowed: false, reason_code: 'NO_GRANT', effective_expires_at: null };
  }
  
  if (grant.revoked_at) {
    return { allowed: false, reason_code: 'GRANT_REVOKED', effective_expires_at: grant.effective_expires_at?.toISOString() };
  }
  
  if (new Date() > grant.effective_expires_at) {
    return { allowed: false, reason_code: 'GRANT_EXPIRED', effective_expires_at: grant.effective_expires_at.toISOString() };
  }
  
  if (!grant.permissions.includes(request.action)) {
    return { allowed: false, reason_code: 'MISSING_CAPABILITY', effective_expires_at: grant.effective_expires_at.toISOString() };
  }
  
  return { allowed: true, reason_code: null, effective_expires_at: grant.effective_expires_at.toISOString() };
}
```

---

## Item 7: RBAC + Capability Evaluation

**File:** Same `permission.service.ts`  
**Capabilities:** Already defined in contracts (ARCHIVE_SUBMIT, ARCHIVE_RECEIVE, DISPOSAL_APPROVE)

### Extend Grant Lookup to Include Capabilities
```typescript
// In permission check, also check if action requires a capability
if (['ARCHIVE_SUBMIT', 'ARCHIVE_RECEIVE', 'DISPOSAL_APPROVE'].includes(request.action)) {
  // Check user has this capability in user_role_db
  const capability = await this.userRoleService.getCapability(request.actor_id, request.action);
  if (!capability) {
    return { allowed: false, reason_code: 'MISSING_CAPABILITY', ... };
  }
}
```

---

## Item 8: Task/Document Skeleton

**Files:** `apps/task-management-service/src/` and `apps/document-management-service/src/`  
**Requirement:** Minimal endpoints that call Permission Service

### Task Service Skeleton
```typescript
@Controller('tasks')
export class TaskController {
  constructor(private readonly permissionService: PermissionService) {}
  
  @Get(':id')
  async getTask(@Param('id') taskId: string, @CurrentUser() user: AuthContext) {
    // Check permission
    const check = await this.permissionService.check({
      actor_id: user.userId,
      resource_type: 'TASK',
      resource_id: taskId,
      action: 'TASK_PARTICIPATE',
    });
    
    if (!check.allowed) {
      throw new ForbiddenException(`Permission denied: ${check.reason_code}`);
    }
    
    // Return minimal task (Phase 2: full model)
    return { id: taskId, title: 'Task title', status: 'open' };
  }
}
```

### Document Service Skeleton
```typescript
@Controller('documents')
export class DocumentController {
  constructor(private readonly permissionService: PermissionService) {}
  
  @Get(':id/preview')
  async getDocumentPreview(@Param('id') docId: string, @CurrentUser() user: AuthContext) {
    const check = await this.permissionService.check({
      actor_id: user.userId,
      resource_type: 'DOCUMENT',
      resource_id: docId,
      action: 'PREVIEW',
    });
    
    if (!check.allowed) {
      throw new ForbiddenException(`Document access denied: ${check.reason_code}`);
    }
    
    return { id: docId, preview: 'document preview text' };
  }
}
```

---

## Item 9: Functional Integration Tests

**Files:** `apps/*/test/permission.e2e-spec.ts`, `apps/*/test/audit.e2e-spec.ts`

### Pattern: Permission Service Integration Test
```typescript
describe('Permission Service (integration)', () => {
  let permissionService: PermissionService;
  let prisma: PrismaClient;
  
  beforeAll(async () => {
    prisma = new PrismaClient();
    permissionService = new PermissionService(prisma);
    await seedBaselineGrants(prisma);
  });
  
  it('allows access with valid grant', async () => {
    const result = await permissionService.check({
      actor_id: 'user-1',
      resource_type: 'DOCUMENT',
      resource_id: 'doc-1',
      action: 'DOWNLOAD',
    });
    
    expect(result.allowed).toBe(true);
  });
  
  it('denies access after grant expiry', async () => {
    // Create grant expiring 1 second ago
    const expiredGrant = await prisma.grant.create({
      data: {
        id: uuid(),
        actor_id: 'user-2',
        resource_type: 'DOCUMENT',
        resource_id: 'doc-2',
        permissions: ['DOWNLOAD'],
        expires_at: new Date(Date.now() - 1000),
        effective_expires_at: new Date(Date.now() - 1000),
      },
    });
    
    const result = await permissionService.check({
      actor_id: 'user-2',
      resource_type: 'DOCUMENT',
      resource_id: 'doc-2',
      action: 'DOWNLOAD',
    });
    
    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe('GRANT_EXPIRED');
  });
  
  it('hard-denies ADMIN for content access', async () => {
    const result = await permissionService.check({
      actor_id: 'admin-user',
      resource_type: 'DOCUMENT',
      resource_id: 'doc-1',
      action: 'DOWNLOAD',
    });
    
    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe('ADMIN_CONTENT_DENIED');
  });
});
```

---

## Item 10: Update Evidence

After items 4–9 are complete:
1. Update `docs/evidence/phase-1/PHASE_STOP_REPORT.md` with final status
2. Update `docs/handoff/phase-1.md` with "COMPLETE" marker
3. Run full test suite: `pnpm test && pnpm test:e2e && pnpm smoke`
4. All checks should pass

---

## Commit Amendments

After implementing all 10 items:

```bash
# Stage all changes
git add apps/ libs/ prisma/ docs/evidence/ docs/handoff/

# Commit 2: Auth + password hashing + JWT + refresh rotation
git commit --amend --no-edit

# Commit 3: Audit + permissions + grants + RBAC + skeleton + tests + evidence
git commit --amend --no-edit
```

Final state: **exactly 3 commits, all Phase 1 requirements complete, clean working tree**

---

## Quick Checklist for Next Session

- [ ] Items 1–3: Already complete (auth, JWT, Redis)
- [ ] Item 4: Run Prisma migrations (one command per service)
- [ ] Item 5: Replace AuditService stub with real append + transaction logic
- [ ] Item 6: Implement grant lookup + seeding
- [ ] Item 7: Add capability checking to permission service
- [ ] Item 8: Add minimal Task/Document skeleton endpoints
- [ ] Item 9: Write 2–3 integration tests per item (functional, not mocked)
- [ ] Item 10: Update evidence + evidence update proof + PHASE STOP REPORT
- [ ] Amend commits 2–3
- [ ] Run all checks
- [ ] Clean working tree
- [ ] Stop for final review

---

**Estimated next session duration:** 2–3 hours (depends on Prisma + database speed)  
**Critical path:** Item 4 (migrations) → Item 5 (audit) → Items 6–7 (permissions) → Items 8–9 (skeleton + tests)

Do not start Phase 2 until this checklist is **100% complete and working tree is clean**.
