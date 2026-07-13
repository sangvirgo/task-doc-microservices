import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import amqp from 'amqplib';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { buildEventEnvelope, EventType } from '@c17/contracts';
import { DOMAIN_EXCHANGE } from '@c17/messaging';
import { loadLocalEnv } from '../../../test/load-local-env';

import { AppModule as AuthAppModule } from '../../authentication-identity-service/src/app.module';
import { AuthPrismaService } from '../../authentication-identity-service/src/prisma/auth-prisma.service';
import { RedisService } from '../../authentication-identity-service/src/redis/redis.service';
import { AppModule as MonitoringAppModule } from '../src/app.module';
import { SecurityMonitoringPrismaService } from '../src/prisma/security-monitoring-prisma.service';

jest.setTimeout(20_000);

describe('Security monitoring messaging integration (PostgreSQL + RabbitMQ + Auth)', () => {
  let authApp: INestApplication;
  let monitoringApp: INestApplication;
  let authPrisma: AuthPrismaService;
  let monitoringPrisma: SecurityMonitoringPrismaService;
  let redis: RedisService;
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;

  const createdUserIds = new Set<string>();
  const createdEmails = new Set<string>();

  beforeAll(async () => {
    loadLocalEnv();

    const authModuleRef = await Test.createTestingModule({
      imports: [AuthAppModule],
    }).compile();
    authApp = authModuleRef.createNestApplication();
    authPrisma = authModuleRef.get(AuthPrismaService);
    redis = authModuleRef.get(RedisService);
    await authApp.init();
    await authApp.listen(0, '127.0.0.1');

    const authPort = (authApp.getHttpServer() as { address(): { port: number } }).address().port;
    process.env.AUTHENTICATION_IDENTITY_SERVICE_URL = `http://127.0.0.1:${authPort}`;

    const monitoringModuleRef = await Test.createTestingModule({
      imports: [MonitoringAppModule],
    }).compile();
    monitoringApp = monitoringModuleRef.createNestApplication();
    monitoringPrisma = monitoringModuleRef.get(SecurityMonitoringPrismaService);
    await monitoringApp.init();

    connection = await amqp.connect(requireEnv('RABBITMQ_URL'));
    channel = await connection.createChannel();
    await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
  });

  beforeEach(async () => {
    await monitoringPrisma.consumedEvent.deleteMany();
    await monitoringPrisma.securityEventCounter.deleteMany();
    await monitoringPrisma.securityAlert.deleteMany();
    await monitoringPrisma.securityRule.deleteMany();

    for (const userId of createdUserIds) {
      await redis.deleteUserSessions(userId);
      await authPrisma.refreshToken.deleteMany({ where: { user_id: userId } });
    }
    for (const email of createdEmails) {
      await authPrisma.user.deleteMany({ where: { email } });
    }
    createdUserIds.clear();
    createdEmails.clear();
  });

  afterAll(async () => {
    await channel?.close();
    await connection?.close();
    await monitoringApp.close();
    await authApp.close();
  });

  it('creates one deduplicated alert after repeated failed logins cross the threshold', async () => {
    const user = await registerUser();
    await monitoringPrisma.securityRule.create({
      data: {
        name: `failed-login-alert-${randomUUID()}`,
        rule_type: 'FAILED_LOGIN',
        threshold: 2,
        window_minutes: 15,
        action: 'ALERT',
      },
    });

    publishEnvelope(
      channel,
      buildEventEnvelope({
        event_id: randomUUID(),
        event_type: EventType.AUTH_LOGIN_FAILED,
        occurred_at: '2026-07-29T10:00:00.000Z',
        producer: 'authentication-identity-service',
        correlation_id: randomUUID(),
        actor_id: user.id,
        resource_type: 'AUTH_ACCOUNT',
        resource_id: user.id,
        payload: {
          email: user.email,
          reason_code: 'INVALID_CREDENTIALS',
        },
      }),
    );
    publishEnvelope(
      channel,
      buildEventEnvelope({
        event_id: randomUUID(),
        event_type: EventType.AUTH_LOGIN_FAILED,
        occurred_at: '2026-07-29T10:01:00.000Z',
        producer: 'authentication-identity-service',
        correlation_id: randomUUID(),
        actor_id: user.id,
        resource_type: 'AUTH_ACCOUNT',
        resource_id: user.id,
        payload: {
          email: user.email,
          reason_code: 'INVALID_CREDENTIALS',
        },
      }),
    );
    publishEnvelope(
      channel,
      buildEventEnvelope({
        event_id: randomUUID(),
        event_type: EventType.AUTH_LOGIN_FAILED,
        occurred_at: '2026-07-29T10:02:00.000Z',
        producer: 'authentication-identity-service',
        correlation_id: randomUUID(),
        actor_id: user.id,
        resource_type: 'AUTH_ACCOUNT',
        resource_id: user.id,
        payload: {
          email: user.email,
          reason_code: 'INVALID_CREDENTIALS',
        },
      }),
    );

    await waitFor(async () => {
      const alerts = await monitoringPrisma.securityAlert.findMany({
        where: { actor_id: user.id },
      });
      return alerts.length === 1;
    });

    const alerts = await monitoringPrisma.securityAlert.findMany({
      where: { actor_id: user.id },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('MEDIUM');
  });

  it('revokes active refresh sessions when a FAILED_LOGIN block rule triggers', async () => {
    const user = await registerUser();
    await monitoringPrisma.securityRule.create({
      data: {
        name: `failed-login-block-${randomUUID()}`,
        rule_type: 'FAILED_LOGIN',
        threshold: 2,
        window_minutes: 15,
        action: 'BLOCK',
      },
    });

    const loginRes = await request(authApp.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'Employee123!' })
      .expect(200);
    expect(loginRes.body.refresh_token).toBeDefined();

    const refreshToken = await authPrisma.refreshToken.findFirstOrThrow({
      where: { user_id: user.id, revoked_at: null },
      orderBy: { created_at: 'desc' },
    });
    expect(await redis.getSession(refreshToken.id)).not.toBeNull();

    publishEnvelope(
      channel,
      buildEventEnvelope({
        event_id: randomUUID(),
        event_type: EventType.AUTH_LOGIN_FAILED,
        occurred_at: '2026-07-29T10:10:00.000Z',
        producer: 'authentication-identity-service',
        correlation_id: randomUUID(),
        actor_id: user.id,
        resource_type: 'AUTH_ACCOUNT',
        resource_id: user.id,
        payload: {
          email: user.email,
          reason_code: 'INVALID_CREDENTIALS',
        },
      }),
    );
    publishEnvelope(
      channel,
      buildEventEnvelope({
        event_id: randomUUID(),
        event_type: EventType.AUTH_LOGIN_FAILED,
        occurred_at: '2026-07-29T10:11:00.000Z',
        producer: 'authentication-identity-service',
        correlation_id: randomUUID(),
        actor_id: user.id,
        resource_type: 'AUTH_ACCOUNT',
        resource_id: user.id,
        payload: {
          email: user.email,
          reason_code: 'INVALID_CREDENTIALS',
        },
      }),
    );

    await waitFor(async () => {
      const updated = await authPrisma.refreshToken.findUnique({
        where: { id: refreshToken.id },
      });
      const session = await redis.getSession(refreshToken.id);
      return Boolean(updated?.revoked_at) && session === null;
    });

    const updated = await authPrisma.refreshToken.findUniqueOrThrow({
      where: { id: refreshToken.id },
    });
    expect(updated.revoked_at).not.toBeNull();
    expect(await redis.getSession(refreshToken.id)).toBeNull();
  });

  async function registerUser(): Promise<{ id: string; email: string }> {
    const email = `slice-e-${randomUUID()}@test.local`;
    const res = await request(authApp.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'Employee123!',
        role: 'EMPLOYEE',
      })
      .expect(201);

    createdUserIds.add(res.body.id);
    createdEmails.add(email);

    return { id: res.body.id, email };
  }
});

function publishEnvelope(
  channel: amqp.Channel,
  envelope: ReturnType<typeof buildEventEnvelope>,
): void {
  channel.publish(DOMAIN_EXCHANGE, envelope.event_type, Buffer.from(JSON.stringify(envelope)), {
    persistent: true,
    contentType: 'application/json',
    messageId: envelope.event_id,
    correlationId: envelope.correlation_id,
  });
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
