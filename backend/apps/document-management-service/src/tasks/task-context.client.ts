import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TaskContext {
  task: {
    id: string;
    creator_id: string;
    assignee_id: string | null;
    deadline: string | null;
  };
  participants: Array<{
    user_id: string;
    role: string;
  }>;
}

@Injectable()
export class TaskContextClient {
  private readonly logger = new Logger(TaskContextClient.name);
  private readonly taskServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.taskServiceUrl =
      this.configService.get<string>('TASK_SERVICE_URL') || 'http://localhost:3003';
    this.timeoutMs = this.configService.get<number>('TASK_LOOKUP_TIMEOUT_MS') || 2000;
  }

  async getContext(taskId: string): Promise<TaskContext> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.taskServiceUrl}/tasks/internal/${encodeURIComponent(taskId)}/context`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );

      if (response.status === 404) {
        throw new NotFoundException('Task not found');
      }

      if (!response.ok) {
        throw new ServiceUnavailableException(`Task context lookup failed: ${response.status}`);
      }

      return (await response.json()) as TaskContext;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.warn(
        `Task context lookup error for ${taskId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new ServiceUnavailableException('Task context unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
