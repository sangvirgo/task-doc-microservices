import { Controller, ForbiddenException, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { StatisticsService } from './statistics.service';
import { parseStatisticsQuery, type GatewayUser } from './statistics.types';

@Controller('api/statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  async overview(@Query() query: Record<string, unknown>, @Req() request: Request) {
    const caller = (request as Request & { user?: GatewayUser }).user;
    if (!caller) throw new ForbiddenException('Authentication required');

    const parsedQuery = parseStatisticsQuery(query);
    if (parsedQuery.scope === 'ORGANIZATION' && caller.role !== 'ADMIN') {
      throw new ForbiddenException('Administrator role required');
    }

    return this.statisticsService.getOverview(parsedQuery, caller);
  }
}
