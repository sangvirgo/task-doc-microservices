import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { AuthContext } from '@c17/auth-context';
import { isPermissionAction, PermissionAction, ResourceType } from '@c17/contracts';

import {
  DocumentDto,
  DocumentsService,
  TaskDocumentAssociationDto,
} from '../documents/documents.service';
import { AuditClient } from '../audit/audit.client';
import { PermissionClient, PermissionGrantSummary } from '../permissions/permission.client';
import { TaskContext, TaskContextClient } from './task-context.client';

const DOCUMENT_GRANTABLE_ACTIONS = new Set<string>([
  PermissionAction.PREVIEW,
  PermissionAction.DOWNLOAD,
  PermissionAction.UPDATE,
  PermissionAction.SHARE,
  PermissionAction.TRANSFER,
  PermissionAction.DISPOSE,
]);

const DOCUMENT_ACCESS_ACTIONS = Array.from(DOCUMENT_GRANTABLE_ACTIONS) as PermissionAction[];

export interface TaskDocumentGrantInput {
  actor_id: string;
  permissions: string[];
  expires_at: string;
  parent_grant_id?: string;
}

export interface TaskDocumentGrantResult {
  association: TaskDocumentAssociationDto;
  document: DocumentDto;
  grants: PermissionGrantSummary[];
}

export interface TaskDocumentListItem {
  association_id: string;
  task_id: string;
  document_id: string;
  title: string;
  document_type: string;
  security_level: string;
  current_version: number;
  attached_by: string;
  attached_at: string;
  permissions: PermissionAction[];
  effective_expires_at: string | null;
}

@Injectable()
export class TaskDocumentsService {
  private readonly logger = new Logger(TaskDocumentsService.name);

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly taskContextClient: TaskContextClient,
    private readonly permissionClient: PermissionClient,
    private readonly auditClient: AuditClient,
  ) {}

  async attach(
    taskId: string,
    documentId: string,
    grants: TaskDocumentGrantInput[],
    caller: AuthContext,
  ): Promise<TaskDocumentGrantResult> {
    const context = await this.taskContextClient.getContext(taskId);
    await this.assertDirectParticipant(context, caller, taskId, 'TASK_DOCUMENT_ATTACH_DENIED');

    const document = await this.documentsService.getDocument(documentId);
    await this.assertCanShare(document, caller, taskId);
    await this.validateGrantInputs(context, taskId, documentId, grants, caller, document);

    const association = await this.documentsService.attachDocumentToTask({
      task_id: taskId,
      document_id: documentId,
      attached_by: caller.userId,
    });

    const createdGrants: PermissionGrantSummary[] = [];
    try {
      for (const grant of grants) {
        createdGrants.push(
          await this.permissionClient.createTaskScopedGrant({
            task_id: taskId,
            resource_id: documentId,
            actor_id: grant.actor_id,
            permissions: grant.permissions,
            expires_at: grant.expires_at,
            parent_grant_id: grant.parent_grant_id,
            caller,
          }),
        );
      }
    } catch (error) {
      await this.compensateAttach(taskId, documentId, createdGrants.length > 0);
      throw error;
    }

    await this.auditClient.record({
      event_type: 'TASK_DOCUMENT_ATTACHED',
      actor_id: caller.userId,
      resource_type: 'TASK_DOCUMENT',
      resource_id: association.id,
      payload: {
        task_id: taskId,
        document_id: documentId,
        grant_count: createdGrants.length,
      },
    });

    for (const grant of createdGrants) {
      await this.auditClient.record({
        event_type: 'DOCUMENT_GRANT_CREATED_IN_TASK',
        actor_id: caller.userId,
        resource_type: ResourceType.DOCUMENT,
        resource_id: documentId,
        payload: {
          grant_id: grant.id,
          task_id: taskId,
          actor_id: grant.actor_id,
          permissions: grant.permissions,
          effective_expires_at: grant.effective_expires_at,
        },
      });
    }

    return { association, document, grants: createdGrants };
  }

  async list(taskId: string, caller: AuthContext): Promise<TaskDocumentListItem[]> {
    const context = await this.taskContextClient.getContext(taskId);
    await this.assertDirectParticipant(context, caller, taskId, 'TASK_DOCUMENT_LIST_DENIED');

    const associations = await this.documentsService.listTaskDocuments(taskId);
    const visible: TaskDocumentListItem[] = [];

    for (const item of associations) {
      const access = await this.getAccess(taskId, item.document.id, caller);
      if (!access.permissions.includes(PermissionAction.PREVIEW)) continue;

      visible.push({
        association_id: item.association.id,
        task_id: taskId,
        document_id: item.document.id,
        title: item.document.title,
        document_type: item.document.document_type,
        security_level: item.document.security_level,
        current_version: item.document.current_version,
        attached_by: item.association.attached_by,
        attached_at: item.association.attached_at,
        permissions: access.permissions,
        effective_expires_at: access.effective_expires_at,
      });
    }

    return visible;
  }

  async addGrant(
    taskId: string,
    documentId: string,
    grant: TaskDocumentGrantInput,
    caller: AuthContext,
  ): Promise<PermissionGrantSummary> {
    const context = await this.taskContextClient.getContext(taskId);
    await this.assertDirectParticipant(context, caller, taskId, 'TASK_DOCUMENT_GRANT_DENIED');

    const association = await this.documentsService.getTaskDocument(taskId, documentId);
    if (!association) {
      await this.recordDenied('TASK_DOCUMENT_GRANT_DENIED', caller.userId, documentId, {
        task_id: taskId,
        reason_code: 'TASK_DOCUMENT_ASSOCIATION_NOT_FOUND',
      });
      throw new NotFoundException('Task-document association not found');
    }

    await this.assertCanShare(association.document, caller, taskId);
    await this.validateGrantInputs(
      context,
      taskId,
      documentId,
      [grant],
      caller,
      association.document,
    );

    const created = await this.permissionClient.createTaskScopedGrant({
      task_id: taskId,
      resource_id: documentId,
      actor_id: grant.actor_id,
      permissions: grant.permissions,
      expires_at: grant.expires_at,
      parent_grant_id: grant.parent_grant_id,
      caller,
    });

    await this.auditClient.record({
      event_type: 'DOCUMENT_GRANT_CREATED_IN_TASK',
      actor_id: caller.userId,
      resource_type: ResourceType.DOCUMENT,
      resource_id: documentId,
      payload: {
        grant_id: created.id,
        task_id: taskId,
        actor_id: created.actor_id,
        permissions: created.permissions,
        effective_expires_at: created.effective_expires_at,
      },
    });

    return created;
  }

  async detach(taskId: string, documentId: string, caller: AuthContext): Promise<void> {
    const context = await this.taskContextClient.getContext(taskId);
    await this.assertDirectParticipant(context, caller, taskId, 'TASK_DOCUMENT_DETACH_DENIED');

    const association = await this.documentsService.getTaskDocument(taskId, documentId);
    if (!association) {
      await this.recordDenied('TASK_DOCUMENT_DETACH_DENIED', caller.userId, documentId, {
        task_id: taskId,
        reason_code: 'TASK_DOCUMENT_ASSOCIATION_NOT_FOUND',
      });
      throw new NotFoundException('Task-document association not found');
    }

    await this.assertCanShare(association.document, caller, taskId);

    // Removing the association first is fail-closed: even if the external revoke call is
    // unavailable, Permission Service will reject the now-orphaned task-scoped grants.
    await this.documentsService.detachDocumentFromTask(taskId, documentId);
    try {
      const revokedCount = await this.permissionClient.revokeTaskDocumentGrants({
        task_id: taskId,
        resource_id: documentId,
        reason: 'Task-document association detached',
      });

      await this.auditClient.record({
        event_type: 'DOCUMENT_GRANTS_REVOKED_DUE_TO_TASK_DETACH',
        actor_id: caller.userId,
        resource_type: ResourceType.DOCUMENT,
        resource_id: documentId,
        payload: { task_id: taskId, document_id: documentId, revoked_count: revokedCount },
      });
    } catch (error) {
      this.logger.error(
        `Task-document grant revocation failed after detach for ${taskId}/${documentId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw error;
    }

    await this.auditClient.record({
      event_type: 'TASK_DOCUMENT_DETACHED',
      actor_id: caller.userId,
      resource_type: 'TASK_DOCUMENT',
      resource_id: association.association.id,
      payload: { task_id: taskId, document_id: documentId },
    });
  }

  async validateAssociation(taskId: string, documentId: string): Promise<{ valid: boolean }> {
    return { valid: await this.documentsService.hasTaskDocument(taskId, documentId) };
  }

  private async validateGrantInputs(
    context: TaskContext,
    taskId: string,
    documentId: string,
    grants: TaskDocumentGrantInput[],
    caller: AuthContext,
    document: DocumentDto,
  ): Promise<void> {
    const recipients = new Set<string>();
    const callerOwnsDocument =
      document.owner_id === caller.userId || document.creator_id === caller.userId;

    for (const grant of grants) {
      if (recipients.has(grant.actor_id)) {
        throw new ConflictException('A recipient may only appear once per request');
      }
      recipients.add(grant.actor_id);

      if (!this.isDirectParticipant(context, grant.actor_id)) {
        await this.recordDenied('TASK_DOCUMENT_GRANT_DENIED', caller.userId, documentId, {
          task_id: taskId,
          actor_id: grant.actor_id,
          reason_code: 'RECIPIENT_NOT_A_PARTICIPANT',
        });
        throw new ForbiddenException('Grant recipient must be a direct task participant');
      }

      if (
        grant.permissions.length === 0 ||
        grant.permissions.some((permission) => !isPermissionAction(permission))
      ) {
        throw new BadRequestException('Grant contains an invalid permission action');
      }

      if (grant.permissions.some((permission) => !DOCUMENT_GRANTABLE_ACTIONS.has(permission))) {
        throw new BadRequestException('Grant contains an invalid document permission action');
      }

      const expiresAt = new Date(grant.expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Grant expiration must be in the future');
      }

      if (!callerOwnsDocument) {
        for (const permission of grant.permissions) {
          const decision = await this.permissionClient.check({
            actor_id: caller.userId,
            actor_role: caller.role,
            resource_type: ResourceType.DOCUMENT,
            resource_id: documentId,
            action: permission as PermissionAction,
            task_id: null,
            correlation_id: randomUUID(),
          });
          if (!decision.allowed) {
            await this.recordDenied('TASK_DOCUMENT_GRANT_DENIED', caller.userId, documentId, {
              task_id: taskId,
              permission,
              reason_code: decision.reason_code,
            });
            throw new ForbiddenException(`Caller may not grant permission ${permission}`);
          }
        }
      }
    }
  }

  private async assertCanShare(
    document: DocumentDto,
    caller: AuthContext,
    taskId: string,
  ): Promise<void> {
    if (document.owner_id === caller.userId || document.creator_id === caller.userId) return;

    const decision = await this.permissionClient.check({
      actor_id: caller.userId,
      actor_role: caller.role,
      resource_type: ResourceType.DOCUMENT,
      resource_id: document.id,
      action: PermissionAction.SHARE,
      task_id: null,
      correlation_id: randomUUID(),
    });

    if (decision.allowed) return;

    await this.recordDenied('TASK_DOCUMENT_ATTACH_DENIED', caller.userId, document.id, {
      task_id: taskId,
      reason_code: decision.reason_code,
    });
    throw new ForbiddenException('Caller is not authorized to share this document');
  }

  private async getAccess(
    taskId: string,
    documentId: string,
    caller: AuthContext,
  ): Promise<{ permissions: PermissionAction[]; effective_expires_at: string | null }> {
    const permissions: PermissionAction[] = [];
    let effectiveExpiresAt: string | null = null;

    for (const action of DOCUMENT_ACCESS_ACTIONS) {
      const decision = await this.permissionClient.check({
        actor_id: caller.userId,
        actor_role: caller.role,
        resource_type: ResourceType.DOCUMENT,
        resource_id: documentId,
        action,
        task_id: taskId,
        correlation_id: randomUUID(),
      });

      if (!decision.allowed) continue;
      permissions.push(action);
      if (
        decision.effective_expires_at &&
        (!effectiveExpiresAt || decision.effective_expires_at < effectiveExpiresAt)
      ) {
        effectiveExpiresAt = decision.effective_expires_at;
      }
    }

    return { permissions, effective_expires_at: effectiveExpiresAt };
  }

  private async assertDirectParticipant(
    context: TaskContext,
    caller: AuthContext,
    taskId: string,
    eventType: string,
  ): Promise<void> {
    if (this.isDirectParticipant(context, caller.userId)) return;

    await this.recordDenied(eventType, caller.userId, taskId, {
      task_id: taskId,
      reason_code: 'NOT_A_DIRECT_TASK_PARTICIPANT',
    });
    throw new ForbiddenException('Direct task participation is required');
  }

  private isDirectParticipant(context: TaskContext, userId: string): boolean {
    return (
      context.task.creator_id === userId ||
      context.task.assignee_id === userId ||
      context.participants.some(
        (participant) => participant.user_id === userId && participant.role !== 'ASSIGNEE',
      )
    );
  }

  private async compensateAttach(
    taskId: string,
    documentId: string,
    grantsCreated: boolean,
  ): Promise<void> {
    if (grantsCreated) {
      await this.permissionClient
        .revokeTaskDocumentGrants({
          task_id: taskId,
          resource_id: documentId,
          reason: 'Attach-and-share compensation after grant creation failure',
        })
        .catch((error) =>
          this.logger.error(
            `Grant compensation failed for ${taskId}/${documentId}: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          ),
        );
    }

    await this.documentsService
      .detachDocumentFromTask(taskId, documentId)
      .catch((error) =>
        this.logger.error(
          `Association compensation failed for ${taskId}/${documentId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        ),
      );
  }

  private async recordDenied(
    eventType: string,
    actorId: string,
    resourceId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.auditClient.record({
      event_type: eventType,
      actor_id: actorId,
      resource_type: 'TASK_DOCUMENT',
      resource_id: resourceId,
      payload,
    });
  }
}
