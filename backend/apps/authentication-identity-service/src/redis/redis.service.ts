import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis(
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  async setSession(
    sessionId: string,
    metadata: Record<string, unknown>,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.setex(`session:${sessionId}`, ttlSeconds, JSON.stringify(metadata));
  }

  async getSession(sessionId: string): Promise<Record<string, unknown> | null> {
    const data = await this.client.get(`session:${sessionId}`);
    return data ? (JSON.parse(data) as Record<string, unknown>) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}`);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    // Scan for all sessions belonging to this user and delete them
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', 'session:*', 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const data = await this.client.get(key);
        if (data) {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (parsed.userId === userId) {
            await this.client.del(key);
          }
        }
      }
    } while (cursor !== '0');
  }
}
