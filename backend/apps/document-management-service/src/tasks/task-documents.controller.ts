import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { AuthContext, CurrentUser } from '@c17/auth-context';

import { TaskDocumentsService } from './task-documents.service';

const grantSchema = z
  .object({
    actor_id: z.string().uuid(),
    permissions: z.array(z.string()).min(1),
    expires_at: z.string().datetime(),
    parent_grant_id: z.string().uuid().optional(),
  })
  .strict();

const attachSchema = z
  .object({
    document_id: z.string().uuid(),
    grants: z.array(grantSchema).min(1),
  })
  .strict();

@ApiTags('task-documents')
@Controller('tasks')
export class TaskDocumentsController {
  constructor(private readonly taskDocumentsService: TaskDocumentsService) {}

  @Post(':taskId/documents')
  @ApiOperation({ summary: 'Attach a document to a task and create task-scoped grants' })
  async attach(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @CurrentUser() user?: AuthContext,
  ) {
    const caller = this.requireUser(user);
    const parsed = attachSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    return this.taskDocumentsService.attach(
      taskId,
      parsed.data.document_id,
      parsed.data.grants,
      caller,
    );
  }

  @Get(':taskId/documents')
  @ApiOperation({ summary: 'List documents accessible to the caller in a task' })
  async list(@Param('taskId') taskId: string, @CurrentUser() user?: AuthContext) {
    return this.taskDocumentsService.list(taskId, this.requireUser(user));
  }

  @Post(':taskId/documents/:documentId/grants')
  @ApiOperation({ summary: 'Create an additional task-scoped document grant' })
  async addGrant(
    @Param('taskId') taskId: string,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
    @CurrentUser() user?: AuthContext,
  ) {
    const caller = this.requireUser(user);
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    return this.taskDocumentsService.addGrant(taskId, documentId, parsed.data, caller);
  }

  @Delete(':taskId/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Detach a document and revoke grants scoped to this task' })
  async detach(
    @Param('taskId') taskId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<void> {
    await this.taskDocumentsService.detach(taskId, documentId, this.requireUser(user));
  }

  private requireUser(user?: AuthContext): AuthContext {
    if (!user) throw new ForbiddenException('Authentication required');
    return user;
  }
}

/** Internal service-network endpoint; API Gateway does not map or expose this route. */
@Controller('internal/task-documents')
export class InternalTaskDocumentsController {
  constructor(private readonly taskDocumentsService: TaskDocumentsService) {}

  @Get(':taskId/:documentId')
  @ApiOperation({ summary: 'Validate a task-document association for Permission Service' })
  async validateAssociation(
    @Param('taskId') taskId: string,
    @Param('documentId') documentId: string,
  ): Promise<{ valid: boolean }> {
    return this.taskDocumentsService.validateAssociation(taskId, documentId);
  }
}
