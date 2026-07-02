import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { MonitoringService, SecurityAlertDto, SecurityRuleDto } from './monitoring.service';

const recordEventSchema = z.object({
  rule_id: z.string().uuid(),
  actor_id: z.string().uuid(),
});

const createRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rule_type: z.string().min(1),
  threshold: z.number().int().positive().optional(),
  window_minutes: z.number().int().positive().optional(),
  action: z.enum(['ALERT', 'BLOCK']).optional(),
});

const resolveAlertSchema = z.object({
  resolved_by: z.string().uuid(),
});

const toggleRuleSchema = z.object({
  enabled: z.boolean(),
});

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Post('events')
  @ApiOperation({ summary: 'Record a security event against a rule' })
  async recordEvent(@Body() body: z.infer<typeof recordEventSchema>) {
    const parsed = recordEventSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.monitoringService.recordEvent(parsed.data.rule_id, parsed.data.actor_id);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'List security alerts' })
  async listAlerts(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('actor_id') actor_id?: string,
    @Query('rule_id') rule_id?: string,
  ): Promise<SecurityAlertDto[]> {
    return this.monitoringService.listAlerts({ status, severity, actor_id, rule_id });
  }

  @Get('alerts/:id')
  @ApiOperation({ summary: 'Get a security alert by ID' })
  async getAlert(@Param('id') id: string): Promise<SecurityAlertDto> {
    return this.monitoringService.getAlert(id);
  }

  @Post('alerts/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a security alert' })
  async resolveAlert(@Param('id') id: string, @Body() body: z.infer<typeof resolveAlertSchema>) {
    const parsed = resolveAlertSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.monitoringService.resolveAlert(id, parsed.data.resolved_by);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a security rule' })
  async createRule(@Body() body: z.infer<typeof createRuleSchema>): Promise<SecurityRuleDto> {
    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.monitoringService.createRule(parsed.data);
  }

  @Get('rules')
  @ApiOperation({ summary: 'List security rules' })
  async listRules(): Promise<SecurityRuleDto[]> {
    return this.monitoringService.listRules();
  }

  @Put('rules/:id/toggle')
  @ApiOperation({ summary: 'Enable or disable a rule' })
  async toggleRule(@Param('id') id: string, @Body() body: z.infer<typeof toggleRuleSchema>): Promise<SecurityRuleDto> {
    const parsed = toggleRuleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.monitoringService.toggleRule(id, parsed.data.enabled);
  }
}
