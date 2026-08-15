import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthContext } from '@c17/auth-context';

import {
  denied,
  PermissionReasonCode,
  permissionCheckResponseSchema,
  type PermissionCheckRequest,
  type PermissionCheckResponse,
} from '@c17/contracts';

export interface PermissionGrantSummary {
  id: string;
  grantor_id: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  permissions: string[];
  task_id: string;
  expires_at: string;
  effective_expires_at: string;
  status: string;
  revoked_at: string | null;
  parent_grant_id: string | null;
  created_at: string;
}

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
  async check(request: PermissionCheckRequest): Promise<PermissionCheckResponse> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.checkTimeoutMs);

      const response = await fetch(`${this.permissionServiceUrl}/internal/permissions/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.error(`Permission check failed: ${response.status}`, request);
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

  async createTaskScopedGrant(data: {
    task_id: string;
    resource_id: string;
    actor_id: string;
    permissions: string[];
    expires_at: string;
    parent_grant_id?: string;
    caller: AuthContext;
  }): Promise<PermissionGrantSummary> {
    const response = await this.fetchWithCaller('/internal/grants/task-document', data.caller, {
      method: 'POST',
      body: JSON.stringify({
        task_id: data.task_id,
        resource_type: 'DOCUMENT',
        resource_id: data.resource_id,
        actor_id: data.actor_id,
        permissions: data.permissions,
        expires_at: data.expires_at,
        parent_grant_id: data.parent_grant_id,
      }),
    });

    return (await response.json()) as PermissionGrantSummary;
  }

  async revokeTaskDocumentGrants(data: {
    task_id: string;
    resource_id: string;
    reason: string;
  }): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.checkTimeoutMs);
    try {
      const response = await fetch(
        `${this.permissionServiceUrl}/internal/grants/task-document/revoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: data.task_id,
            resource_type: 'DOCUMENT',
            resource_id: data.resource_id,
            reason: data.reason,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Task-document grant revocation failed: ${response.status}`,
        );
      }

      const body = (await response.json().catch(() => undefined)) as
        { revoked?: number } | undefined;
      if (typeof body?.revoked !== 'number') {
        throw new ServiceUnavailableException('Task-document grant revocation response invalid');
      }
      return body.revoked;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Task-document grant revocation unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  async listTaskDocumentGrants(data: {
    task_id: string;
    resource_id: string;
    page: number;
    page_size: number;
    caller: AuthContext;
  }): Promise<{
    items: PermissionGrantSummary[];
    pagination: Record<string, unknown>;
  }> {
    const response = await this.fetchWithCaller(
      `/internal/grants/task-document?task_id=${encodeURIComponent(data.task_id)}&resource_id=${encodeURIComponent(data.resource_id)}&page=${data.page}&page_size=${data.page_size}`,
      data.caller,
      { method: 'GET' },
    );
    return (await response.json()) as {
      items: PermissionGrantSummary[];
      pagination: Record<string, unknown>;
    };
  }

  async updateTaskDocumentGrant(data: {
    task_id: string;
    resource_id: string;
    grant_id: string;
    permissions?: string[];
    expires_at?: string;
    caller: AuthContext;
  }): Promise<PermissionGrantSummary> {
    const response = await this.fetchWithCaller(
      `/internal/grants/task-document/${encodeURIComponent(data.grant_id)}`,
      data.caller,
      {
        method: 'PATCH',
        body: JSON.stringify({
          task_id: data.task_id,
          resource_type: 'DOCUMENT',
          resource_id: data.resource_id,
          ...(data.permissions ? { permissions: data.permissions } : {}),
          ...(data.expires_at ? { expires_at: data.expires_at } : {}),
        }),
      },
    );
    return (await response.json()) as PermissionGrantSummary;
  }

  async revokeTaskDocumentGrant(data: {
    task_id: string;
    resource_id: string;
    grant_id: string;
    reason: string;
    caller: AuthContext;
  }): Promise<PermissionGrantSummary> {
    const response = await this.fetchWithCaller(
      `/internal/grants/task-document/${encodeURIComponent(data.grant_id)}`,
      data.caller,
      {
        method: 'DELETE',
        body: JSON.stringify({
          task_id: data.task_id,
          resource_type: 'DOCUMENT',
          resource_id: data.resource_id,
          reason: data.reason,
        }),
      },
    );
    return (await response.json()) as PermissionGrantSummary;
  }

  private async fetchWithCaller(
    path: string,
    caller: AuthContext,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.checkTimeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.permissionServiceUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': caller.userId,
          'x-user-role': caller.role,
          'x-user-capabilities': JSON.stringify(caller.capabilities),
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.error('Permission service request error', error);
      throw new ServiceUnavailableException('Permission service unavailable');
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) return response;

    const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
    const message = body?.message || 'Permission service request failed';
    if (response.status === 400) throw new BadRequestException(message);
    if (response.status === 403) throw new ForbiddenException(message);
    if (response.status === 409) throw new ConflictException(message);
    throw new ServiceUnavailableException(message);
  }
}
