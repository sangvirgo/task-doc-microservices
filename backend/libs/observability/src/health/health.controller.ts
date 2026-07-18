import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SERVICE_NAME } from '@c17/config';

export interface HealthResponse {
  status: 'ok';
  service: string;
  uptime_seconds: number;
  timestamp: string;
}

/**
 * Liveness for one application. Deliberately dependency-free: it answers "is this process up and
 * serving HTTP", not "are Postgres and RabbitMQ reachable". Readiness against dependencies is a
 * separate concern and is not part of the Phase 1 baseline.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(SERVICE_NAME) private readonly serviceName: string) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe for this service' })
  @ApiOkResponse({ description: 'The service process is up and serving HTTP.' })
  check(): HealthResponse {
    return {
      status: 'ok',
      service: this.serviceName,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
