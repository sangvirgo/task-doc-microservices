import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

import { InfraService, type InfraStatus } from './infra.service';
import type { GatewayUser } from '../statistics/statistics.types';

@Controller('api/infra')
export class InfraController {
  constructor(private readonly infraService: InfraService) {}

  @Get('status')
  async status(@Req() request: Request): Promise<InfraStatus> {
    const caller = (request as Request & { user?: GatewayUser }).user;
    if (!caller) throw new ForbiddenException('Authentication required');
    if (caller.role !== 'ADMIN') throw new ForbiddenException('Administrator role required');

    return this.infraService.getStatus();
  }
}