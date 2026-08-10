import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import type { GatewayUser, StatisticsQuery } from './statistics.types';

@Injectable()
export class StatisticsService {
  async getOverview(query: StatisticsQuery, _caller: GatewayUser): Promise<unknown> {
    void query;
    throw new ServiceUnavailableException('Statistics aggregation is unavailable');
  }
}
