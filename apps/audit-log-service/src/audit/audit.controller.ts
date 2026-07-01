import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  @Get('events/:id')
  @ApiOperation({ summary: 'Get an audit event by id' })
  getEvent(@Param('id') id: string) {
    return { id, event_type: 'permission.check', payload: {}, current_hash: 'hash' };
  }

  @Get('chain/head')
  @ApiOperation({ summary: 'Get the current hash chain head' })
  getChainHead() {
    return { last_hash: '', last_event_id: null };
  }
}
