import {
  BadRequestException,
  Body,
  Delete,
  Controller,
  ForbiddenException,
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

import { CurrentUser, type AuthContext, isAdmin } from '@c17/auth-context';
import { paginationQuerySchema, PaginationQuery } from '@c17/contracts';
import { MonitoringService, SecurityAlertDto, SecurityRuleDto } from './monitoring.service';
import {
  MonitoringStatisticsService,
  parseMonitoringStatisticsQuery,
} from './monitoring-statistics.service';

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
  send_alert_email: z.boolean().optional(),
});

const resolveAlertSchema = z.object({
  resolved_by: z.string().uuid(),
});

const toggleRuleSchema = z.object({
  enabled: z.boolean(),
});

const setRuleEmailSchema = z.object({
  send_alert_email: z.boolean(),
});

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly monitoringStatisticsService?: MonitoringStatisticsService,
  ) {}

  private requireAdmin(user: AuthContext): void {
    if (!isAdmin(user)) throw new ForbiddenException('Administrator role required');
  }

  @Get('internal/statistics')
  @ApiOperation({ summary: 'Get monitoring statistics for an internal aggregator' })
  async getInternalStatistics(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthContext,
  ) {
    if (!this.monitoringStatisticsService) {
      throw new ForbiddenException('Monitoring statistics unavailable');
    }
    const parsed = parseMonitoringStatisticsQuery(query);
    return this.monitoringStatisticsService.getOverview({ ...parsed, caller: user });
  }

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
    @CurrentUser() user?: AuthContext,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ): Promise<unknown> {
    this.requireAdmin(user as AuthContext);
    const pagination = this.parsePagination(page, page_size);
    return this.monitoringService.listAlerts({ status, severity, actor_id, rule_id }, pagination);
  }

  @Get('alerts/:id')
  @ApiOperation({ summary: 'Get a security alert by ID' })
  async getAlert(
    @Param('id') id: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<SecurityAlertDto> {
    this.requireAdmin(user as AuthContext);
    return this.monitoringService.getAlert(id);
  }

  @Post('alerts/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a security alert' })
  async resolveAlert(
    @Param('id') id: string,
    @Body() body: z.infer<typeof resolveAlertSchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    const parsed = resolveAlertSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    this.requireAdmin(user as AuthContext);
    return this.monitoringService.resolveAlert(id, (user as AuthContext).userId);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a security rule' })
  async createRule(
    @Body() body: z.infer<typeof createRuleSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<SecurityRuleDto> {
    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    this.requireAdmin(user as AuthContext);
    return this.monitoringService.createRule(parsed.data);
  }

  @Get('rules')
  @ApiOperation({ summary: 'List security rules' })
  async listRules(
    @CurrentUser() user?: AuthContext,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ): Promise<unknown> {
    this.requireAdmin(user as AuthContext);
    return this.monitoringService.listRules(this.parsePagination(page, page_size));
  }

  private parsePagination(page?: string, page_size?: string): PaginationQuery {
    const parsed = paginationQuerySchema.safeParse({ page, page_size });
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return parsed.data;
  }

  @Put('rules/:id/toggle')
  @ApiOperation({ summary: 'Enable or disable a rule' })
  async toggleRule(
    @Param('id') id: string,
    @Body() body: z.infer<typeof toggleRuleSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<SecurityRuleDto> {
    const parsed = toggleRuleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    this.requireAdmin(user as AuthContext);
    return this.monitoringService.toggleRule(id, parsed.data.enabled);
  }

  @Put('rules/:id/email')
  @ApiOperation({ summary: 'Enable or disable alert email notifications for a rule' })
  async setRuleEmail(
    @Param('id') id: string,
    @Body() body: z.infer<typeof setRuleEmailSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<SecurityRuleDto> {
    const parsed = setRuleEmailSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    this.requireAdmin(user as AuthContext);
    return this.monitoringService.setRuleEmail(id, parsed.data.send_alert_email);
  }
  @Delete("rules/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a security rule" })
  async deleteRule(@Param("id") id: string, @CurrentUser() user?: AuthContext): Promise<void> {
    this.requireAdmin(user as AuthContext);
    await this.monitoringService.deleteRule(id);
  }
}
