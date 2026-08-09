import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { attachAuthContextFromHeaders } from '@c17/auth-context';

import { TaskDocumentsController } from '../src/tasks/task-documents.controller';
import { TaskDocumentsService } from '../src/tasks/task-documents.service';

const TASK_ID = '10000000-0000-4000-a000-000000000001';
const DOCUMENT_ID = '20000000-0000-4000-a000-000000000002';
const EMPLOYEE_ID = '30000000-0000-4000-a000-000000000003';
const EXPIRY = '2026-08-10T17:00:00.000Z';

function authHeaders(): Record<string, string> {
  return {
    'x-user-id': EMPLOYEE_ID,
    'x-user-role': 'EMPLOYEE',
    'x-user-capabilities': '[]',
  };
}

describe('TaskDocumentsController', () => {
  let app: INestApplication;
  const service = {
    attach: jest.fn(),
    list: jest.fn(),
    addGrant: jest.fn(),
    listGrants: jest.fn(),
    updateGrant: jest.fn(),
    revokeGrant: jest.fn(),
    detach: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TaskDocumentsController],
      providers: [{ provide: TaskDocumentsService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(attachAuthContextFromHeaders);
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app.close();
  });

  it('exposes POST /tasks/:taskId/documents and passes the authenticated caller', async () => {
    service.attach.mockResolvedValue({ association: { id: 'association-1' }, grants: [] });

    const response = await request(app.getHttpServer())
      .post(`/tasks/${TASK_ID}/documents`)
      .set(authHeaders())
      .send({
        document_id: DOCUMENT_ID,
        grants: [
          {
            actor_id: EMPLOYEE_ID,
            permissions: ['PREVIEW', 'DOWNLOAD'],
            expires_at: EXPIRY,
          },
        ],
      })
      .expect(201);

    expect(response.body).toEqual({ association: { id: 'association-1' }, grants: [] });
    expect(service.attach).toHaveBeenCalledWith(
      TASK_ID,
      DOCUMENT_ID,
      [
        {
          actor_id: EMPLOYEE_ID,
          permissions: ['PREVIEW', 'DOWNLOAD'],
          expires_at: EXPIRY,
        },
      ],
      expect.objectContaining({ userId: EMPLOYEE_ID, role: 'EMPLOYEE' }),
    );
  });

  it('rejects malformed attach payloads before reaching the sharing service', async () => {
    await request(app.getHttpServer())
      .post(`/tasks/${TASK_ID}/documents`)
      .set(authHeaders())
      .send({ document_id: DOCUMENT_ID, grants: [{ actor_id: 'not-a-uuid' }] })
      .expect(400);

    expect(service.attach).not.toHaveBeenCalled();
  });

  it('exposes list and detach routes under the same task-document boundary', async () => {
    service.list.mockResolvedValue({
      items: [{ document_id: DOCUMENT_ID }],
      pagination: {
        page: 1,
        page_size: 20,
        total: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    });

    await request(app.getHttpServer())
      .get(`/tasks/${TASK_ID}/documents`)
      .set(authHeaders())
      .expect(200)
      .expect({
        items: [{ document_id: DOCUMENT_ID }],
        pagination: {
          page: 1,
          page_size: 20,
          total: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      });

    await request(app.getHttpServer())
      .delete(`/tasks/${TASK_ID}/documents/${DOCUMENT_ID}`)
      .set(authHeaders())
      .expect(204);

    expect(service.list).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ userId: EMPLOYEE_ID }),
      { page: 1, page_size: 20 },
    );
    expect(service.detach).toHaveBeenCalledWith(
      TASK_ID,
      DOCUMENT_ID,
      expect.objectContaining({ userId: EMPLOYEE_ID }),
    );
  });

  it('exposes per-grant list, update, and revoke routes', async () => {
    service.listGrants.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        page_size: 20,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_previous: false,
      },
    });
    service.updateGrant.mockResolvedValue({ id: 'grant-1', status: 'ACTIVE' });
    service.revokeGrant.mockResolvedValue({ id: 'grant-1', status: 'REVOKED' });

    await request(app.getHttpServer())
      .get(`/tasks/${TASK_ID}/documents/${DOCUMENT_ID}/grants`)
      .set(authHeaders())
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/tasks/${TASK_ID}/documents/${DOCUMENT_ID}/grants/grant-1`)
      .set(authHeaders())
      .send({ permissions: ['PREVIEW'], expires_at: EXPIRY })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/tasks/${TASK_ID}/documents/${DOCUMENT_ID}/grants/grant-1`)
      .set(authHeaders())
      .send({ reason: 'No longer needed' })
      .expect(200);

    expect(service.listGrants).toHaveBeenCalledWith(
      TASK_ID,
      DOCUMENT_ID,
      expect.objectContaining({ userId: EMPLOYEE_ID }),
      { page: 1, page_size: 20 },
    );
    expect(service.updateGrant).toHaveBeenCalledWith(
      TASK_ID,
      DOCUMENT_ID,
      'grant-1',
      { permissions: ['PREVIEW'], expires_at: EXPIRY },
      expect.objectContaining({ userId: EMPLOYEE_ID }),
    );
    expect(service.revokeGrant).toHaveBeenCalledWith(
      TASK_ID,
      DOCUMENT_ID,
      'grant-1',
      expect.objectContaining({ userId: EMPLOYEE_ID }),
      'No longer needed',
    );
  });
});
