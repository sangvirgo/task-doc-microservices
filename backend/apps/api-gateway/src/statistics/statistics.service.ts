import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { TASK_STATUSES } from './statistics.types';
import {
  auditVerificationResponseSchema,
  documentStatisticsResponseSchema,
  monitoringStatisticsResponseSchema,
  taskStatisticsResponseSchema,
  userStatisticsResponseSchema,
  type AuditVerificationResponse,
  type DocumentStatisticsResponse,
  type GatewayUser,
  type MonitoringStatisticsResponse,
  type StatisticsOverviewResponse,
  type StatisticsQuery,
  type TaskStatisticsResponse,
  type UserStatisticsResponse,
} from './statistics.types';

@Injectable()
export class StatisticsService {
  private readonly timeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS || 10_000);

  async getOverview(
    query: StatisticsQuery,
    caller: GatewayUser,
  ): Promise<StatisticsOverviewResponse> {
    const queryString = new URLSearchParams({
      scope: query.scope,
      from: query.from,
      to: query.to,
    }).toString();

    const [tasks, documents, monitoring] = await Promise.all([
      this.fetchJson<TaskStatisticsResponse>(
        this.serviceUrl('TASK_SERVICE_URL', 'http://localhost:3003') +
          `/tasks/internal/statistics?${queryString}`,
        caller,
        taskStatisticsResponseSchema,
      ),
      this.fetchJson<DocumentStatisticsResponse>(
        this.serviceUrl('DOCUMENT_SERVICE_URL', 'http://localhost:3004') +
          `/documents/internal/statistics?${queryString}`,
        caller,
        documentStatisticsResponseSchema,
      ),
      this.fetchJson<MonitoringStatisticsResponse>(
        this.serviceUrl('SECURITY_MONITORING_SERVICE_URL', 'http://localhost:3009') +
          `/monitoring/internal/statistics?${queryString}`,
        caller,
        monitoringStatisticsResponseSchema,
      ),
    ]);

    const taskStatus = Object.fromEntries(
      TASK_STATUSES.map((status) => [status, tasks.task_status[status] ?? 0]),
    ) as StatisticsOverviewResponse['task_status'];

    const response: StatisticsOverviewResponse = {
      scope: query.scope,
      range: { from: query.from, to: query.to },
      summary: {
        ...tasks.summary,
        visible_documents: documents.visible_documents,
        task_documents: documents.task_documents,
        security_alerts: monitoring.security_alerts,
      },
      task_status: taskStatus,
      task_trend: tasks.task_trend,
      recent_activity: tasks.recent_activity,
    };

    if (query.scope === 'ORGANIZATION') {
      const [users, audit] = await Promise.all([
        this.fetchJson<UserStatisticsResponse>(
          this.serviceUrl('USER_ROLE_SERVICE_URL', 'http://localhost:3002') +
            `/users/internal/statistics?${queryString}`,
          caller,
          userStatisticsResponseSchema,
        ),
        this.fetchJson<AuditVerificationResponse>(
          this.serviceUrl('AUDIT_SERVICE_URL', 'http://localhost:3007') + '/audit/chain/verify',
          caller,
          auditVerificationResponseSchema,
          'POST',
        ),
      ]);

      const organizationTasks = tasks.organization_tasks ?? {
        total: tasks.summary.total_tasks,
        approved: tasks.summary.approved_tasks,
        overdue: tasks.summary.overdue_tasks,
      };
      const taskGrowth = new Map((tasks.growth_trend ?? []).map((item) => [item.date, item.tasks]));
      response.users = users.users;
      response.organization_tasks = organizationTasks;
      response.security = {
        open_alerts: monitoring.open_alerts ?? monitoring.security_alerts,
        audit_chain: audit.valid ? 'VALID' : 'INVALID',
      };
      response.retention = { eligible_documents: documents.eligible_documents ?? 0 };
      response.growth_trend = users.growth_trend.map((item) => ({
        date: item.date,
        users: item.users,
        tasks: taskGrowth.get(item.date) ?? 0,
      }));
    }

    return response;
  }

  private serviceUrl(environmentKey: string, fallback: string): string {
    return (process.env[environmentKey] || fallback).replace(/\/$/, '');
  }

  private async fetchJson<T>(
    url: string,
    caller: GatewayUser,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    method = 'GET',
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'x-user-id': caller.userId,
        'x-user-role': caller.role,
        'x-user-capabilities': JSON.stringify(caller.capabilities),
      };
      if (caller.email) headers['x-user-email'] = caller.email;

      const response = await fetch(url, { method, headers, signal: controller.signal });
      if (response.status === 403) throw new ForbiddenException('Statistics access denied');
      if (!response.ok) throw new ServiceUnavailableException('Statistics service unavailable');

      const body = await response.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ServiceUnavailableException('Statistics response invalid');
      return parsed.data;
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('Statistics service unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
