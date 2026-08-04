import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TaskDocumentClient {
  private readonly logger = new Logger(TaskDocumentClient.name);
  private readonly documentServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.documentServiceUrl =
      this.configService.get<string>('DOCUMENT_SERVICE_URL') || 'http://localhost:3004';
    this.timeoutMs = this.configService.get<number>('DOCUMENT_ASSOCIATION_TIMEOUT_MS') || 2000;
  }

  async exists(taskId: string, documentId: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.documentServiceUrl}/internal/task-documents/${encodeURIComponent(taskId)}/${encodeURIComponent(documentId)}`,
        { headers: { Accept: 'application/json' }, signal: controller.signal },
      );

      if (response.status === 404) return false;
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Task-document association lookup failed: ${response.status}`,
        );
      }

      const body = (await response.json()) as { valid?: boolean };
      return body.valid === true;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(
        `Task-document association lookup error for ${taskId}/${documentId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw new ServiceUnavailableException('Task-document association unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
