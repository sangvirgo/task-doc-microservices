import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import {
  denied,
  PermissionReasonCode,
  permissionCheckResponseSchema,
  type PermissionCheckRequest,
  type PermissionCheckResponse,
} from '@c17/contracts';

/**
 * Permission Service HTTP Client (V3 §8.1).
 * Calls Permission Service's /internal/permissions/check endpoint.
 * Phase 1: HTTP client with default deny fallback.
 */
@Injectable()
export class PermissionClient {
  private readonly logger = new Logger(PermissionClient.name);
  private readonly permissionServiceUrl: string;
  private readonly checkTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.permissionServiceUrl =
      this.configService.get<string>('PERMISSION_SERVICE_URL') || 'http://localhost:3006';
    this.checkTimeoutMs = this.configService.get<number>('PERMISSION_CHECK_TIMEOUT_MS') || 2000;
  }

  /**
   * Check if actor has permission on a resource.
   * Fails closed: any error returns a denial.
   */
  async check(
    request: Omit<PermissionCheckRequest, 'correlation_id'>,
  ): Promise<PermissionCheckResponse> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.checkTimeoutMs);
      const payload: PermissionCheckRequest = {
        ...request,
        correlation_id: randomUUID(),
      };

      const response = await fetch(`${this.permissionServiceUrl}/internal/permissions/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.error(`Permission check failed: ${response.status}`, payload);
        // Fail-closed: return denial on HTTP error
        return {
          allowed: false,
          reason_code: 'PERMISSION_SERVICE_UNAVAILABLE',
          effective_expires_at: null,
        };
      }

      const body = await response.json();
      const parsed = permissionCheckResponseSchema.safeParse(body);
      if (!parsed.success) {
        this.logger.error('Permission check response schema mismatch', parsed.error.flatten());
        return denied(PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE);
      }

      return parsed.data;
    } catch (error) {
      // Fail-closed: any error is a denial (V3 §5.5.3)
      this.logger.error('Permission check error', { error, request });
      return denied(PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE);
    }
  }
}
