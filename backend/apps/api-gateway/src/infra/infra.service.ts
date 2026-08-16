import { Injectable, Logger } from '@nestjs/common';

interface RabbitQueueInfo {
  name: string;
  messages: number;
  messages_ready: number;
  messages_unacknowledged: number;
  consumers: number;
  memory: number;
  state: string;
}

interface RabbitInfo {
  ok: boolean;
  error?: string;
  node?: string;
  version?: string;
  total_messages?: number;
  total_consumers?: number;
  connections?: number;
  channels?: number;
  exchanges?: number;
  publish_rate?: number;
  memory_bytes?: number;
  disk_free_bytes?: number;
  queues?: RabbitQueueInfo[];
}

interface MinioBucketInfo {
  name: string;
  objects: number;
  bytes: number;
}

interface MinioInfo {
  ok: boolean;
  error?: string;
  total_objects?: number;
  total_bytes?: number;
  buckets?: MinioBucketInfo[];
  limited?: boolean;
}

export interface InfraStatus {
  generated_at: string;
  rabbitmq: RabbitInfo;
  minio: MinioInfo;
}

const MAX_OBJECTS_PER_BUCKET = 200_000;

@Injectable()
export class InfraService {
  private readonly logger = new Logger(InfraService.name);

  async getStatus(): Promise<InfraStatus> {
    const [rabbitmq, minio] = await Promise.all([
      this.collectRabbitMq().catch((error: unknown) => this.rabbitError(error)),
      this.collectMinio().catch((error: unknown) => this.minioError(error)),
    ]);
    return { generated_at: new Date().toISOString(), rabbitmq, minio };
  }

  private rabbitError(error: unknown): RabbitInfo {
    this.logger.warn(`RabbitMQ stats unavailable: ${error instanceof Error ? error.message : 'unknown'}`);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  private minioError(error: unknown): MinioInfo {
    this.logger.warn(`MinIO stats unavailable: ${error instanceof Error ? error.message : 'unknown'}`);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  private async collectRabbitMq(): Promise<RabbitInfo> {
    const { baseUrl, username, password } = this.rabbitMgmtConfig();

    const [overview, queues] = await Promise.all([
      fetch(`${baseUrl}/api/overview`, { headers: this.authHeaders(username, password) }),
      fetch(`${baseUrl}/api/queues?columns=name,messages,messages_ready,messages_unacknowledged,consumers,memory,state`, {
        headers: this.authHeaders(username, password),
      }),
    ]);

    if (!overview.ok) {
      throw new Error(`RabbitMQ management API returned ${overview.status}`);
    }
    if (!queues.ok) {
      throw new Error(`RabbitMQ queue API returned ${queues.status}`);
    }

    const overviewJson = (await overview.json()) as Record<string, unknown>;
    const queueJson = (await queues.json()) as unknown[];

    const queueTots = (overviewJson['queue_totals'] as Record<string, unknown> | undefined) ?? {};
    const msgStats = (overviewJson['message_stats'] as Record<string, unknown> | undefined) ?? {};
    const node = (overviewJson['node'] as string | undefined) ?? 'rabbit@localhost';
    const mgmtVersion = (overviewJson['management_version'] as string | undefined) ?? null;
    const diskFree = (overviewJson['disk_free'] as number | undefined) ?? null;
    const diskFreeLimit = (overviewJson['disk_free_limit'] as number | undefined) ?? null;
    const memory = (overviewJson['memory'] as number | undefined) ?? null;

    const queueInfos: RabbitQueueInfo[] = queueJson.map((entry) => {
      const q = entry as Record<string, unknown>;
      return {
        name: String(q['name'] ?? ''),
        messages: Number(q['messages'] ?? 0),
        messages_ready: Number(q['messages_ready'] ?? 0),
        messages_unacknowledged: Number(q['messages_unacknowledged'] ?? 0),
        consumers: Number(q['consumers'] ?? 0),
        memory: Number(q['memory'] ?? 0),
        state: String(q['state'] ?? 'running'),
      };
    });

    return {
      ok: true,
      node,
      version: mgmtVersion ?? undefined,
      total_messages: Number(queueTots['messages'] ?? 0),
      total_consumers: Number(queueTots['consumers'] ?? 0),
      connections: Number((overviewJson['object_totals'] as Record<string, unknown> | undefined)?.['connections'] ?? 0),
      channels: Number((overviewJson['object_totals'] as Record<string, unknown> | undefined)?.['channels'] ?? 0),
      exchanges: Number((overviewJson['object_totals'] as Record<string, unknown> | undefined)?.['exchanges'] ?? 0),
      publish_rate: Number((msgStats['publish_in_details'] as Record<string, unknown> | undefined)?.['rate'] ?? 0),
      memory_bytes: memory ?? undefined,
      disk_free_bytes: typeof diskFree === 'number' && typeof diskFreeLimit === 'number' ? diskFree - diskFreeLimit : undefined,
      queues: queueInfos,
    };
  }

  private async collectMinio(): Promise<MinioInfo> {
    const { Client } = await import('minio');
    const client = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
    });

    const bucketNames = await client.listBuckets();
    const buckets: MinioBucketInfo[] = [];
    let totalObjects = 0;
    let totalBytes = 0;
    let limited = false;

    for (const { name } of bucketNames) {
      let objects = 0;
      let bytes = 0;

      const stream = client.listObjectsV2(name, '', true);
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };
        stream.on('data', (item: import('minio').BucketItem) => {
          if (objects >= MAX_OBJECTS_PER_BUCKET) {
            limited = true;
            stream.destroy();
            return;
          }
          objects += 1;
          bytes += Number(item.size ?? 0);
        });
        stream.on('error', (error: unknown) => {
          if (!finished) {
            finished = true;
            reject(error);
          }
        });
        stream.on('end', finish);
        stream.on('close', finish);
      });

      buckets.push({ name, objects, bytes });
      totalObjects += objects;
      totalBytes += bytes;
    }

    return {
      ok: true,
      total_objects: totalObjects,
      total_bytes: totalBytes,
      buckets: buckets.sort((a, b) => b.bytes - a.bytes),
      limited,
    };
  }

  private rabbitMgmtConfig(): { baseUrl: string; username: string; password: string } {
    const url = new URL(process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672');
    return {
      baseUrl: `http://${url.hostname}:15672`,
      username: url.username || 'guest',
      password: url.password || 'guest',
    };
  }

  private authHeaders(username: string, password: string): Record<string, string> {
    return {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      Accept: 'application/json',
    };
  }
}