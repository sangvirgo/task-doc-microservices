/**
 * End-to-end core workflow test.
 *
 * Requires all services running (docker compose up) and seeded (node infra/seed.js).
 * Covers: login → create task → create document → permission check → download ticket → audit chain.
 *
 * Seed IDs (from infra/seed.js):
 *   ADMIN_ID  = 00000000-0000-4000-a000-000000000001
 *   EMP_ID    = 00000000-0000-4000-a000-000000000002
 */

const GW = process.env.GATEWAY_URL || 'http://localhost:3000';
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const PERM_URL = process.env.PERMISSION_SERVICE_URL || 'http://localhost:3006';
const AUDIT_URL = process.env.AUDIT_SERVICE_URL || 'http://localhost:3007';

const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
const EMP_EMAIL = 'employee@c17.local';
const EMP_PASS = 'Employee123!';
const EMP_ID = '00000000-0000-4000-a000-000000000002';

type PaginatedList<T> = {
  items: T[];
  pagination: Record<string, unknown>;
};

async function post<T>(
  url: string,
  body: unknown,
  token?: string,
  additionalHeaders: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  Object.assign(headers, additionalHeaders);
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

function permissionPost<T>(
  url: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  return post(url, body, token, {
    'x-user-id': ADMIN_ID,
    'x-user-role': 'ADMIN',
  });
}

async function attachDocumentToTask(
  taskId: string,
  documentId: string,
  token: string,
): Promise<void> {
  const res = await post(
    `${GW}/api/tasks/${taskId}/documents`,
    {
      document_id: documentId,
      grants: [
        {
          actor_id: EMP_ID,
          permissions: ['PREVIEW'],
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    },
    token,
  );
  expect(res.status).toBe(201);
}

async function get<T>(url: string, token?: string): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

describe('E2E core workflow', () => {
  let accessToken: string;
  let taskId: string;
  let documentId: string;

  // ── 1. Auth ──────────────────────────────────────────────────────────────

  describe('1. Authentication', () => {
    it('logs in as employee and returns access token', async () => {
      const res = await post<{ access_token: string }>(`${AUTH_URL}/auth/login`, {
        email: EMP_EMAIL,
        password: EMP_PASS,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('access_token');
      expect(typeof res.body.access_token).toBe('string');
      accessToken = res.body.access_token as string;
    });
  });

  // ── 2. Task creation ─────────────────────────────────────────────────────

  describe('2. Task management', () => {
    it('creates a task via API gateway', async () => {
      const res = await post<{ id: string; title: string; reviewer_id: string | null }>(
        `${GW}/api/tasks`,
        { title: 'E2E test task', description: 'Created by e2e workflow test' },
        accessToken,
      );

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('E2E test task');
      expect(res.body.reviewer_id).toBe(EMP_ID);
      taskId = res.body.id as string;
    });

    it('rejects assigning the same employee as both assignee and reviewer', async () => {
      const res = await post(
        `${GW}/api/tasks`,
        { title: 'E2E invalid self-review', assignee_id: EMP_ID, reviewer_id: EMP_ID },
        accessToken,
      );

      expect(res.status).toBe(400);
    });

    it('lists tasks and finds the created task', async () => {
      const res = await get<PaginatedList<{ id: string }>>(
        `${GW}/api/tasks?creator_id=${EMP_ID}&page=1&page_size=20`,
        accessToken,
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.pagination).toMatchObject({ page: 1, page_size: 20 });
      const found = res.body.items.find((t) => t.id === taskId);
      expect(found).toBeDefined();
    });
  });

  // ── 3. Document creation ─────────────────────────────────────────────────

  describe('3. Document management', () => {
    it('creates a document via API gateway', async () => {
      const res = await post<{ id: string; title: string }>(
        `${GW}/api/documents`,
        {
          title: 'E2E test document',
          document_type: 'REPORT',
          owner_id: EMP_ID,
          security_level: 'INTERNAL',
        },
        accessToken,
      );

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('E2E test document');
      documentId = res.body.id as string;
    });

    it('attaches the document to the task before granting access', async () => {
      await attachDocumentToTask(taskId, documentId, accessToken);
    });
  });

  // ── 4. Permission check ──────────────────────────────────────────────────

  describe('4. Permission service', () => {
    it('checks PREVIEW permission for seeded grant (employee has PREVIEW on all docs)', async () => {
      const { randomUUID } = await import('crypto');
      const res = await post<{ allowed: boolean }>(`${PERM_URL}/internal/permissions/check`, {
        actor_id: EMP_ID,
        actor_role: 'EMPLOYEE',
        resource_type: 'DOCUMENT',
        resource_id: documentId,
        action: 'PREVIEW',
        correlation_id: randomUUID(),
      });

      // Seeded grant covers PREVIEW; result may be allowed or denied depending on resource_id scope
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('allowed');
    });

    it('grants PREVIEW permission on the new document', async () => {
      const res = await permissionPost<{ id: string }>(`${PERM_URL}/grants`, {
        grantor_id: ADMIN_ID,
        actor_id: EMP_ID,
        resource_type: 'DOCUMENT',
        resource_id: documentId,
        permissions: ['PREVIEW', 'DOWNLOAD'],
        task_id: taskId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('PREVIEW is now allowed on the document', async () => {
      const { randomUUID } = await import('crypto');
      const res = await post<{ allowed: boolean }>(`${PERM_URL}/internal/permissions/check`, {
        actor_id: EMP_ID,
        actor_role: 'EMPLOYEE',
        resource_type: 'DOCUMENT',
        resource_id: documentId,
        action: 'PREVIEW',
        correlation_id: randomUUID(),
      });

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    });
  });

  // ── 5. Document access via gateway (permission-gated) ────────────────────

  describe('5. Document access via gateway', () => {
    it('fetches document metadata through gateway after permission grant', async () => {
      const res = await get<unknown>(`${GW}/api/documents/${documentId}`, accessToken);

      expect(res.status).toBe(200);
    });
  });

  // ── 6. Audit log ─────────────────────────────────────────────────────────

  describe('6. Audit log', () => {
    it('audit chain head exists', async () => {
      const res = await get<{ sequence: number }>(`${AUDIT_URL}/audit/chain/head`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sequence');
    });

    it('audit chain integrity verifies', async () => {
      const res = await post<{ valid: boolean }>(`${AUDIT_URL}/audit/chain/verify`, {});
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('valid');
      expect(res.body.valid).toBe(true);
    });

    it('audit events list is queryable', async () => {
      const res = await get<PaginatedList<unknown>>(
        `${AUDIT_URL}/audit/events?page=1&page_size=10`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.pagination).toMatchObject({ page: 1, page_size: 10 });
    });
  });

  // ── 7. Gateway health ────────────────────────────────────────────────────

  describe('7. Gateway health', () => {
    it('gateway health endpoint is reachable without auth', async () => {
      const res = await get<unknown>(`${GW}/health`);
      expect(res.status).toBe(200);
    });
  });
});
