import {
  BadRequestException,
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Get,
  Inject,
  Optional,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import {
  PERMISSION_CHECK_PATH,
  buildEventEnvelope,
  denied,
  EventType,
  Producer,
  type PermissionCheckRequest,
  type PermissionCheckResponse,
  permissionCheckRequestSchema,
  PermissionReasonCode,
} from '@c17/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';

import { PermissionService, GrantDto } from './permission.service';

const createGrantSchema = z.object({
  grantor_id: z.string().uuid(),
  actor_id: z.string().uuid(),
  resource_type: z.string().min(1),
  resource_id: z.string().uuid(),
  permissions: z.array(z.string()).min(1),
  task_id: z.string().uuid(),
  expires_at: z.string().datetime(),
  parent_grant_id: z.string().uuid().optional(),
});

const delegateSchema = z.object({
  actor_id: z.string().uuid(),
  permissions: z.array(z.string()).optional(),
});

const revokeSchema = z.object({
  reason: z.string().optional(),
});

/**
 * Permission Service (V3 §8.1). Sole authority for content access decisions.
 *
 * Default deny, fail closed: any error or timeout produces a denial with
 * PERMISSION_SERVICE_UNAVAILABLE, never an allow (V3 §5.5.3, ADR-0001).
 */
@ApiTags('permissions')
@Controller()
export class PermissionsController {
  constructor(
    private readonly permissionService: PermissionService,
    @Optional() @Inject(EVENT_PUBLISHER) private readonly eventPublisher?: EventPublisher,
  ) {}

  @Post(PERMISSION_CHECK_PATH)
  @ApiOperation({ summary: 'Check whether an actor has a permission on a resource' })
  @HttpCode(HttpStatus.OK)
  async check(@Body() request: PermissionCheckRequest): Promise<PermissionCheckResponse> {
    const parsed = permissionCheckRequestSchema.safeParse(request);
    if (!parsed.success) {
      return denied(PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE);
    }

    const req = parsed.data;
    const result = await this.permissionService.check({
      actor_id: req.actor_id,
      actor_role: req.actor_role,
      resource_type: req.resource_type,
      resource_id: req.resource_id,
      action: req.action,
      task_id: req.task_id,
    });

    void this.eventPublisher
      ?.publish(
        buildEventEnvelope({
          event_id: randomUUID(),
          event_type: EventType.PERMISSION_DECISION_MADE,
          occurred_at: new Date().toISOString(),
          producer: Producer.PERMISSION_SERVICE,
          correlation_id: req.correlation_id,
          actor_id: req.actor_id,
          resource_type: req.resource_type,
          resource_id: req.resource_id,
          payload: {
            action: req.action,
            allowed: result.allowed,
            reason_code: result.reason_code,
          },
        }),
      )
      .catch(() => undefined);

    return result;
  }

  @Post('grants')
  @ApiOperation({ summary: 'Create a new grant' })
  async createGrant(@Body() body: z.infer<typeof createGrantSchema>): Promise<GrantDto> {
    const parsed = createGrantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.permissionService.createGrant({
      grantor_id: parsed.data.grantor_id,
      actor_id: parsed.data.actor_id,
      resource_type: parsed.data.resource_type,
      resource_id: parsed.data.resource_id,
      permissions: parsed.data.permissions,
      task_id: parsed.data.task_id,
      expires_at: new Date(parsed.data.expires_at),
      parent_grant_id: parsed.data.parent_grant_id,
    });
  }

  @Get('grants')
  @ApiOperation({ summary: 'List grants with filters' })
  async listGrants(
    @Query('actor_id') actor_id?: string,
    @Query('resource_type') resource_type?: string,
    @Query('resource_id') resource_id?: string,
    @Query('status') status?: string,
    @Query('task_id') task_id?: string,
  ): Promise<GrantDto[]> {
    return this.permissionService.listGrants({
      actor_id,
      resource_type,
      resource_id,
      status,
      task_id,
    });
  }

  @Get('grants/:id')
  @ApiOperation({ summary: 'Get a grant by ID' })
  async getGrant(@Param('id') id: string): Promise<GrantDto> {
    return this.permissionService.getGrant(id);
  }

  @Post('grants/:id/delegate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delegate a grant to another actor' })
  async delegateGrant(
    @Param('id') parentGrantId: string,
    @Body() body: z.infer<typeof delegateSchema>,
  ): Promise<GrantDto> {
    const parsed = delegateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.permissionService.delegateGrant({
      parent_grant_id: parentGrantId,
      actor_id: parsed.data.actor_id,
      permissions: parsed.data.permissions,
    });
  }

  @Delete('grants/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a grant' })
  async revokeGrant(
    @Param('id') id: string,
    @Body() body: z.infer<typeof revokeSchema>,
  ): Promise<GrantDto> {
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.permissionService.revokeGrant(id, parsed.data.reason);
  }
}
