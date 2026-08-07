import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { paginationQuerySchema } from '@c17/contracts';

import { AuditService } from './audit.service';

const appendEventSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.string().min(1),
  occurred_at: z.string().datetime(),
  actor_id: z.string().uuid().nullable(),
  resource_type: z.string().min(1),
  resource_id: z.string().min(1),
  payload: z.record(z.unknown()),
});

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post('events')
  @ApiOperation({ summary: 'Append an audit event to the hash chain' })
  async appendEvent(@Body() body: z.infer<typeof appendEventSchema>) {
    const parsed = appendEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.auditService.appendEvent(parsed.data);
  }

  @Get('events')
  @ApiOperation({ summary: 'List audit events with filters' })
  async listEvents(
    @Query('event_type') event_type?: string,
    @Query('actor_id') actor_id?: string,
    @Query('resource_type') resource_type?: string,
    @Query('resource_id') resource_id?: string,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ): Promise<unknown> {
    const pagination = paginationQuerySchema.safeParse({ page, page_size });
    if (!pagination.success) {
      throw new BadRequestException(pagination.error.issues);
    }
    return this.auditService.listEvents(
      {
        event_type,
        actor_id,
        resource_type,
        resource_id,
      },
      pagination.data,
    );
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get an audit event by id' })
  async getEvent(@Param('id') id: string) {
    const event = await this.auditService.getEvent(id);
    if (!event) throw new NotFoundException('Audit event not found');
    return event;
  }

  @Get('chain/head')
  @ApiOperation({ summary: 'Get the current hash chain head' })
  async getChainHead() {
    return this.auditService.getChainHead();
  }

  @Post('chain/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify hash chain integrity' })
  async verifyChain() {
    return this.auditService.verifyChainIntegrity();
  }
}
