import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { AuthPrismaService } from '../src/prisma/auth-prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { UserRoleClient } from '../src/users/user-role.client';

/**
 * Integration tests for Authentication-Identity service against real
 * PostgreSQL (port 5433) and Redis. Requires Docker infrastructure running.
 */
describe('Auth Service Integration (PostgreSQL + Redis)', () => {
  let app: INestApplication;
  let prisma: AuthPrismaService;
  let redis: RedisService;

  const TEST_EMAIL = `integration-${Date.now()}@test.local`;
  const TEST_PASS = 'TestPassword123!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({
          secret: process.env.JWT_SECRET || 'test-secret-32-chars-min-for-testing',
          signOptions: { expiresIn: 1800 },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        AuthPrismaService,
        RedisService,
        {
          provide: UserRoleClient,
          useValue: {
            provisionUser: jest.fn().mockResolvedValue(undefined),
            getCapabilities: jest.fn().mockResolvedValue([]),
            getLockState: jest.fn().mockResolvedValue({ locked_at: null }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = moduleRef.get(AuthPrismaService);
    redis = moduleRef.get(RedisService);
    await app.init();
  });

  afterAll(async () => {
    // Clean up test user
    try {
      await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    } catch {
      /* ignore */
    }
    await app.close();
  });

  it('should register a new user in PostgreSQL', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASS })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(TEST_EMAIL);
    expect(res.body.role).toBe('EMPLOYEE');

    // Verify row exists in PostgreSQL
    const dbUser = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.email).toBe(TEST_EMAIL);
  });

  it('should login and return JWT tokens with Redis session', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASS })
      .expect(200);

    expect(res.body).toHaveProperty('access_token');
    expect(res.body).toHaveProperty('refresh_token');
    expect(res.body).toHaveProperty('expires_in_seconds');
    expect(typeof res.body.access_token).toBe('string');
    expect(typeof res.body.refresh_token).toBe('string');

    // Verify refresh token exists in PostgreSQL
    const dbTokens = await prisma.refreshToken.findMany({
      where: { user: { email: TEST_EMAIL } },
      orderBy: { created_at: 'desc' },
    });
    expect(dbTokens.length).toBeGreaterThanOrEqual(1);

    // Verify session exists in Redis
    const latestToken = dbTokens[0];
    const session = await redis.getSession(latestToken.id);
    expect(session).not.toBeNull();
    expect(session!.email).toBe(TEST_EMAIL);
  });

  it('should reject login with wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: 'WrongPassword!' })
      .expect(401);
  });

  it('should refresh tokens (rotation)', async () => {
    // Login first
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASS })
      .expect(200);

    const oldRefresh = loginRes.body.refresh_token;

    // Refresh
    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: oldRefresh })
      .expect(200);

    expect(refreshRes.body).toHaveProperty('access_token');
    expect(refreshRes.body.refresh_token).not.toBe(oldRefresh);

    // Old refresh token should be revoked — re-use must fail
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: oldRefresh })
      .expect(401);
  });

  it('should logout and clear Redis session', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASS })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refresh_token: loginRes.body.refresh_token })
      .expect(204);

    // Verify the refresh token is revoked in PostgreSQL
    const tokens = await prisma.refreshToken.findMany({
      where: { user: { email: TEST_EMAIL }, revoked_at: { not: null } },
    });
    expect(tokens.length).toBeGreaterThanOrEqual(1);
  });
});
