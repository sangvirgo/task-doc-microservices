import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@c17/auth-context';

import { DocumentsService } from './documents.service';
import { PermissionClient } from '../permissions/permission.client';

/**
 * Document Management API (V3 §5.4, §5.6).
 *
 * Phase 1: skeleton endpoints with permission checks.
 * Phase 2: implement document lifecycle, versioning, and security pipeline.
 */
@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly permissionClient: PermissionClient,
  ) {}

  /**
   * Get document preview with permission check.
   * Caller must have PREVIEW permission via a Grant.
   */
  @Get(':id/preview')
  @ApiOperation({ summary: 'Get document preview' })
  async getDocumentPreview(
    @Param('id') documentId: string,
    @CurrentUser() user?: { userId: string; role: string },
  ) {
    // Phase 1: mock user if not provided
    const userId = user?.userId || 'user-1';

    // V3 §8.1: Check permission via Permission Service
    // Default deny, fail-closed
    const permCheck = await this.permissionClient.check({
      actor_id: userId,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'PREVIEW',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Document access denied: ${permCheck.reason_code}`);
    }

    return this.documentsService.getDocumentPreview(documentId);
  }

  /**
   * Get document download ticket with permission check.
   * Caller must have DOWNLOAD permission via a Grant.
   * Phase 2: returns time-bounded secure ticket for MinIO access.
   */
  @Get(':id/download')
  @ApiOperation({ summary: 'Get document download ticket' })
  async getDocumentDownload(
    @Param('id') documentId: string,
    @CurrentUser() user?: { userId: string; role: string },
  ) {
    // Phase 1: mock user if not provided
    const userId = user?.userId || 'user-1';

    // V3 §8.1: Check permission
    const permCheck = await this.permissionClient.check({
      actor_id: userId,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'DOWNLOAD',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Document download denied: ${permCheck.reason_code}`);
    }

    // Phase 1: mock ticket
    // Phase 2: create ticket with expiry bounded by grant.effective_expires_at
    return {
      ticket_id: 'ticket-' + Date.now(),
      document_id: documentId,
      expires_in_seconds: 3600, // 1 hour
      download_url: `/api/documents/${documentId}/download/${Date.now()}`,
    };
  }
}
