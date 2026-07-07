import {
  All,
  Controller,
  ForbiddenException,
  Logger,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getCorrelationId } from '@c17/observability';

import { Public } from '../auth/jwt-auth.guard';

/**
 * Service route configuration for the API Gateway proxy.
 */
interface ServiceRoute {
  prefix: string;
  target: string;
  upstreamBasePath: string;
}

/**
 * Route table: maps URL prefixes to internal service base URLs.
 * For Docker, these would use container names. For local dev, localhost with ports.
 */
function getRoutes(): ServiceRoute[] {
  return [
    {
      prefix: '/api/auth',
      target: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
      upstreamBasePath: '/auth',
    },
    {
      prefix: '/api/users',
      target: process.env.USER_ROLE_SERVICE_URL || 'http://localhost:3002',
      upstreamBasePath: '/users',
    },
    {
      prefix: '/api/tasks',
      target: process.env.TASK_SERVICE_URL || 'http://localhost:3003',
      upstreamBasePath: '/tasks',
    },
    {
      prefix: '/api/documents',
      target: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3004',
      upstreamBasePath: '/documents',
    },
    {
      prefix: '/api/records',
      target: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3004',
      upstreamBasePath: '/records',
    },
    {
      prefix: '/api/transfer-packages',
      target: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3004',
      upstreamBasePath: '/transfer-packages',
    },
    {
      prefix: '/api/security',
      target: process.env.DOCUMENT_SECURITY_SERVICE_URL || 'http://localhost:3005',
      upstreamBasePath: '/security',
    },
    {
      prefix: '/api/permissions',
      target: process.env.PERMISSION_SERVICE_URL || 'http://localhost:3006',
      upstreamBasePath: '',
    },
    {
      prefix: '/api/audit',
      target: process.env.AUDIT_SERVICE_URL || 'http://localhost:3007',
      upstreamBasePath: '/audit',
    },
    {
      prefix: '/api/notifications',
      target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3008',
      upstreamBasePath: '/notifications',
    },
    {
      prefix: '/api/monitoring',
      target: process.env.SECURITY_MONITORING_SERVICE_URL || 'http://localhost:3009',
      upstreamBasePath: '/monitoring',
    },
  ];
}

const DEFAULT_TIMEOUT_MS = Number(process.env.GATEWAY_TIMEOUT_MS || 10_000);

/**
 * API Gateway controller: proxies /api/* requests to internal services.
 *
 * - JWT validation happens via the global JwtAuthGuard
 * - /api/auth routes are public (login/register/refresh don't need a token)
 * - Correlation IDs are forwarded
 * - Authenticated user context is forwarded as internal headers
 * - Timeout and fail-closed: errors → 503, upstream 403 → 403, upstream 5xx → 503
 */
@Controller()
export class GatewayController {
  private readonly logger = new Logger('GatewayController');
  private readonly routes = getRoutes();

  /** Auth endpoints are public — no JWT required */
  @Public()
  @All(['api/auth', 'api/auth/*path'])
  async proxyAuth(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/users', 'api/users/*path'])
  async proxyUsers(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/tasks', 'api/tasks/*path'])
  async proxyTasks(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/documents', 'api/documents/*path'])
  async proxyDocuments(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/records', 'api/records/*path'])
  async proxyRecords(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/transfer-packages', 'api/transfer-packages/*path'])
  async proxyTransferPackages(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/security', 'api/security/*path'])
  async proxySecurity(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/permissions', 'api/permissions/*path'])
  async proxyPermissions(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/audit', 'api/audit/*path'])
  async proxyAudit(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/notifications', 'api/notifications/*path'])
  async proxyNotifications(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  @All(['api/monitoring', 'api/monitoring/*path'])
  async proxyMonitoring(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy(req, res);
  }

  private async proxy(req: Request, res: Response): Promise<void> {
    const route = this.routes.find((r) => req.originalUrl.startsWith(r.prefix));
    if (!route) {
      res.status(404).json({ statusCode: 404, message: 'Route not found' });
      return;
    }

    try {
      // Strip the /api/<service> prefix → forward the rest to the internal service
      const targetPath = req.originalUrl.slice(route.prefix.length);
      const targetUrl = `${route.target}${route.upstreamBasePath}${targetPath || ''}`;

      const headers: Record<string, string> = {};
      const requestContentType = req.headers['content-type'];
      const accept = req.headers['accept'];
      const authorization = req.headers['authorization'];
      if (typeof requestContentType === 'string') headers['content-type'] = requestContentType;
      if (typeof accept === 'string') headers['accept'] = accept;
      if (typeof authorization === 'string') headers['authorization'] = authorization;

      // Propagate correlation ID
      const correlationId = getCorrelationId();
      if (correlationId) headers['x-correlation-id'] = correlationId;

      // Forward authenticated user context as internal headers
      const user = (req as unknown as Record<string, unknown>)['user'] as
        { userId: string; role: string; capabilities: string[] } | undefined;
      if (user) {
        headers['x-user-id'] = user.userId;
        headers['x-user-role'] = user.role;
        headers['x-user-capabilities'] = JSON.stringify(user.capabilities);
      }

      // Build body for mutating methods
      let body: string | undefined;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
        body = JSON.stringify(req.body);
      }

      // Fetch with configurable timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      let response: globalThis.Response;
      try {
        response = await fetch(targetUrl, {
          method: req.method,
          headers,
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      // Map upstream status codes per requirements
      const status = this.mapStatus(response.status);

      // Forward response headers
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('content-type', contentType);
      const upstreamCorrelation = response.headers.get('x-correlation-id');
      if (upstreamCorrelation) res.setHeader('x-correlation-id', upstreamCorrelation);

      const responseBody = await response.text();
      res.status(status).send(responseBody);
    } catch (error: unknown) {
      // Fail-closed: any proxy error → 503
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn(`Proxy timeout: ${req.method} ${req.originalUrl}`);
        throw new ServiceUnavailableException('Upstream service timeout');
      }
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `Proxy error: ${req.method} ${req.originalUrl} — ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new ServiceUnavailableException('Upstream service unavailable');
    }
  }

  /**
   * 403 from upstream → 403 (permission denied)
   * 5xx from upstream → 503 (fail-closed)
   * Everything else passes through
   */
  private mapStatus(status: number): number {
    if (status === 403) return 403;
    if (status >= 500) return 503;
    return status;
  }
}
