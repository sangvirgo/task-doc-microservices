import { gatewayClient } from './client';
import type { StatisticsOverview, StatisticsScope } from '@/types/statistics';

export const statisticsApi = {
  overview: (scope: StatisticsScope, from: string, to: string) => {
    const query = new URLSearchParams({ scope, from, to });
    return gatewayClient.get<StatisticsOverview>(`/statistics/overview?${query.toString()}`);
  },
};
