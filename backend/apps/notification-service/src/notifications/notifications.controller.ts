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
  ForbiddenException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { NotificationsService, NotificationDto } from './notifications.service';

const createNotificationSchema = z.object({
  recipient_id: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  channel: z.enum(['IN_APP', 'EMAIL']).default('IN_APP'),
  metadata: z.record(z.unknown()).optional(),
});

const updatePreferencesSchema = z.object({
  email_enabled: z.boolean().optional(),
  in_app_enabled: z.boolean().optional(),
});

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a notification' })
  async create(
    @Body() body: z.infer<typeof createNotificationSchema>,
    @Req() req: Request,
  ): Promise<NotificationDto> {
    this.requireAdmin(req);
    const parsed = createNotificationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.notificationsService.createNotification(parsed.data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a notification by ID' })
  async getOne(@Param('id') id: string, @Req() req: Request): Promise<NotificationDto> {
    const notification = await this.notificationsService.getNotification(id);
    this.requireOwner(req, notification.recipient_id);
    return notification;
  }

  @Get()
  @ApiOperation({ summary: 'List notifications for a recipient' })
  async list(
    @Query('recipient_id') recipient_id: string,
    @Query('unread_only') unread_only?: string,
    @Req() req?: Request,
  ): Promise<NotificationDto[]> {
    if (!recipient_id) throw new BadRequestException('recipient_id query param is required');
    this.requireOwner(req, recipient_id);
    return this.notificationsService.listNotifications(recipient_id, unread_only === 'true');
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Param('id') id: string, @Req() req: Request): Promise<NotificationDto> {
    const notification = await this.notificationsService.getNotification(id);
    this.requireOwner(req, notification.recipient_id);
    return this.notificationsService.markAsRead(id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read for a recipient' })
  async markAllAsRead(@Body() body: { recipient_id: string }, @Req() req: Request) {
    if (!body.recipient_id) throw new BadRequestException('recipient_id is required');
    this.requireOwner(req, body.recipient_id);
    return this.notificationsService.markAllAsRead(body.recipient_id);
  }

  @Get('preferences/:userId')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@Param('userId') userId: string, @Req() req: Request) {
    this.requireOwner(req, userId);
    return this.notificationsService.getPreferences(userId);
  }

  @Put('preferences/:userId')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @Param('userId') userId: string,
    @Body() body: z.infer<typeof updatePreferencesSchema>,
    @Req() req: Request,
  ) {
    this.requireOwner(req, userId);
    const parsed = updatePreferencesSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.notificationsService.updatePreferences(userId, parsed.data);
  }

  private requireAdmin(req: Request): void {
    if (req.header('x-user-role') !== 'ADMIN') {
      throw new ForbiddenException('Administrator role required');
    }
  }

  private requireOwner(req: Request | undefined, targetUserId: string): void {
    const callerId = req?.header('x-user-id');
    const role = req?.header('x-user-role');
    if (role !== 'ADMIN' && callerId !== targetUserId) {
      throw new ForbiddenException('Notifications may only be accessed for the caller');
    }
  }
}
