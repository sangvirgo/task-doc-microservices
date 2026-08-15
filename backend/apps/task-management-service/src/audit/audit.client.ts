import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

/**
 * Audit Log HTTP client. Best-effort: audit failures never block the caller.
 * Follows the same fire-and-forget shape as fluent-bit style logging.
 */
@Injectable()
export class AuditClient {
  private readonly logger = new Logger(AuditClient.name);
  private readonly auditServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.auditServiceUrl =
      this.configService.get<string>('AUDIT_SERVICE_URL') || 'http://localhost:3007';
    this.timeoutMs = this.configService.get<number>('AUDIT_TIMEOUT_MS') || 2000;
  }

  async record(event: {
    event_type: string;
    actor_id: string | null;
    resource_type: string;
    resource_id: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.auditServiceUrl}/audit/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: randomUUID(),
          event_type: event.event_type,
          occurred_at: new Date().toISOString(),
          actor_id: event.actor_id,
          resource_type: event.resource_type,
          resource_id: event.resource_id,
          payload: event.payload,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Audit record failed: ${response.status} for ${event.event_type}`);
      }
    } catch (error) {
      // Audit is best-effort; never block the caller
      this.logger.warn(
        `Audit client error for ${event.event_type}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
