import { gatewayClient } from './client';

export interface RabbitQueueInfo {
  name: string;
  messages: number;
  messages_ready: number;
  messages_unacknowledged: number;
  consumers: number;
  memory: number;
  state: string;
}

export interface InfraStatus {
  generated_at: string;
  rabbitmq: {
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
  };
  minio: {
    ok: boolean;
    error?: string;
    total_objects?: number;
    total_bytes?: number;
    buckets?: Array<{ name: string; objects: number; bytes: number }>;
    limited?: boolean;
  };
}

export const infraApi = {
  status: () => gatewayClient.get<InfraStatus>('/infra/status'),
};