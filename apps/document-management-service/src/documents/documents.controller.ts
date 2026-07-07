import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { randomUUID } from 'crypto';

import { CurrentUser, AuthContext } from '@c17/auth-context';
import { buildEventEnvelope } from '@c17/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';

import {
  DocumentsService,
  DocumentDto,
  DocumentVersionDto,
  RecordDto,
  DownloadTicketDto,
} from './documents.service';
import { PermissionClient } from '../permissions/permission.client';
import { AuditClient } from '../audit/audit.client';
import { SecurityClient } from '../security/security.client';

const createDocumentSchema = z.object({
  title: z.string().min(1),
  document_type: z.string().min(1),
  owner_id: z.string().uuid(),
  security_level: z.string().default('INTERNAL'),
  retention_policy: z.string().optional(),
});

const documentVersionSchema = z.object({
  object_key: z.string().min(1),
  checksum: z.string().min(1),
  encrypted_dek: z.string().min(1),
  file_size: z.number().int().positive(),
  mime_type: z.string().min(1),
  kek_version: z.number().int().positive().optional(),
});

const downloadTicketSchema = z.object({
  version: z.number().int().positive(),
  expires_in_seconds: z.number().int().positive().default(3600),
});

const createRecordSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

const recordEntrySchema = z.object({
  document_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
});

const transferPackageSchema = z.object({
  manifest: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const reviewPackageSchema = z.object({
  approved: z.boolean(),
  rejection_reason: z.string().optional(),
});

/**
 * Document Management API (V3 §5.4, §5.6).
 * Full document lifecycle with versioning, records, transfer packages, and download tickets.
 */
@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly permissionClient: PermissionClient,
    private readonly auditClient: AuditClient,
    private readonly securityClient: SecurityClient,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List documents' })
  async listDocuments(
    @Query('owner_id') owner_id?: string,
    @Query('creator_id') creator_id?: string,
    @Query('status') status?: string,
  ): Promise<DocumentDto[]> {
    return this.documentsService.listDocuments({ owner_id, creator_id, status });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new document' })
  async createDocument(
    @Body() body: z.infer<typeof createDocumentSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<DocumentDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = createDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.documentsService
      .createDocument({
        title: parsed.data.title,
        document_type: parsed.data.document_type,
        owner_id: parsed.data.owner_id,
        creator_id: user.userId,
        security_level: parsed.data.security_level,
        retention_policy: parsed.data.retention_policy,
      })
      .then(async (doc) => {
        await this.auditClient.record({
          event_type: 'DOCUMENT_CREATED',
          actor_id: user.userId,
          resource_type: 'DOCUMENT',
          resource_id: doc.id,
          payload: {
            title: doc.title,
            document_type: doc.document_type,
            security_level: doc.security_level,
          },
        });
        void this.eventPublisher.publish(
          buildEventEnvelope({
            event_id: randomUUID(),
            event_type: 'document.created',
            occurred_at: new Date().toISOString(),
            producer: 'document-management-service',
            correlation_id: randomUUID(),
            actor_id: user.userId,
            resource_type: 'DOCUMENT',
            resource_id: doc.id,
            payload: { title: doc.title, document_type: doc.document_type },
          }),
        );
        return doc;
      });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document metadata' })
  async getDocument(
    @Param('id') documentId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<DocumentDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'PREVIEW',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Document access denied: ${permCheck.reason_code}`);
    }

    return this.documentsService.getDocument(documentId);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Get document preview' })
  async getDocumentPreview(@Param('id') documentId: string, @CurrentUser() user?: AuthContext) {
    if (!user) throw new ForbiddenException('Authentication required');

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'PREVIEW',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Document access denied: ${permCheck.reason_code}`);
    }

    return this.documentsService.getDocumentPreview(documentId);
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Create a new document version' })
  async createVersion(
    @Param('id') documentId: string,
    @Body() body: z.infer<typeof documentVersionSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<DocumentVersionDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = documentVersionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const version = await this.documentsService.createDocumentVersion({
      document_id: documentId,
      object_key: parsed.data.object_key,
      checksum: parsed.data.checksum,
      encrypted_dek: parsed.data.encrypted_dek,
      file_size: parsed.data.file_size,
      mime_type: parsed.data.mime_type,
      kek_version: parsed.data.kek_version,
      created_by: user.userId,
    });

    void this.securityClient.processDocument({
      document_id: documentId,
      version: version.version,
      object_key: parsed.data.object_key,
      checksum: parsed.data.checksum,
      encrypted_dek: parsed.data.encrypted_dek,
      file_size: parsed.data.file_size,
      mime_type: parsed.data.mime_type,
      kek_version: parsed.data.kek_version,
    });

    return version;
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List document versions' })
  async getVersions(@Param('id') documentId: string): Promise<DocumentVersionDto[]> {
    return this.documentsService.getDocumentVersions(documentId);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Get specific document version' })
  async getVersion(
    @Param('id') documentId: string,
    @Param('version') version: string,
  ): Promise<DocumentVersionDto> {
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) throw new BadRequestException('Invalid version number');
    return this.documentsService.getDocumentVersion(documentId, versionNum);
  }

  @Post(':id/download-ticket')
  @ApiOperation({ summary: 'Create download ticket (requires DOWNLOAD permission)' })
  async createDownloadTicket(
    @Param('id') documentId: string,
    @Body() body: z.infer<typeof downloadTicketSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<DownloadTicketDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = downloadTicketSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'DOWNLOAD',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Download denied: ${permCheck.reason_code}`);
    }

    const version = await this.documentsService.getDocumentVersion(documentId, parsed.data.version);

    return this.documentsService
      .createDownloadTicket({
        document_id: documentId,
        version: parsed.data.version,
        actor_id: user.userId,
        object_key: version.object_key,
        expires_in_seconds: parsed.data.expires_in_seconds,
      })
      .then(async (ticket) => {
        await this.auditClient.record({
          event_type: 'DOCUMENT_DOWNLOAD_TICKET',
          actor_id: user.userId,
          resource_type: 'DOCUMENT',
          resource_id: documentId,
          payload: { version: parsed.data.version, ticket_id: ticket.id },
        });
        return ticket;
      });
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Get download ticket for current version (deprecated, use /download-ticket)',
  })
  async getDocumentDownload(
    @Param('id') documentId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<DownloadTicketDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'DOWNLOAD',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Download denied: ${permCheck.reason_code}`);
    }

    const document = await this.documentsService.getDocument(documentId);
    const version = await this.documentsService.getDocumentVersion(
      documentId,
      document.current_version,
    );

    return this.documentsService.createDownloadTicket({
      document_id: documentId,
      version: document.current_version,
      actor_id: user.userId,
      object_key: version.object_key,
      expires_in_seconds: 3600,
    });
  }
}

/**
 * Record Management API (V3 §5.7).
 * Records group document versions for archival transfer.
 */
@ApiTags('records')
@Controller('records')
export class RecordsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List records' })
  async listRecords(
    @Query('creator_id') creator_id?: string,
    @Query('status') status?: string,
  ): Promise<RecordDto[]> {
    return this.documentsService.listRecords({ creator_id, status });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new record' })
  async createRecord(
    @Body() body: z.infer<typeof createRecordSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<RecordDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = createRecordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.documentsService.createRecord({
      title: parsed.data.title,
      description: parsed.data.description,
      creator_id: user.userId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get record by ID' })
  async getRecord(@Param('id') recordId: string): Promise<RecordDto> {
    return this.documentsService.getRecord(recordId);
  }

  @Post(':id/entries')
  @ApiOperation({ summary: 'Add document to record' })
  async addEntry(
    @Param('id') recordId: string,
    @Body() body: z.infer<typeof recordEntrySchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = recordEntrySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.documentsService.addDocumentToRecord(
      recordId,
      parsed.data.document_id,
      parsed.data.document_version_id,
    );
  }

  @Post(':id/seal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seal record (no more edits allowed)' })
  async sealRecord(
    @Param('id') recordId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<RecordDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    return this.documentsService.sealRecord(recordId);
  }
}

/**
 * Transfer Package API (V3 §5.9).
 * Manages archival transfer packages for records.
 */
@ApiTags('transfer-packages')
@Controller('transfer-packages')
export class TransferPackagesController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create transfer package' })
  async createPackage(
    @Body() body: { record_id: string } & z.infer<typeof transferPackageSchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = transferPackageSchema.extend({ record_id: z.string().uuid() }).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.documentsService.createTransferPackage({
      record_id: parsed.data.record_id,
      submitter_id: user.userId,
      manifest: parsed.data.manifest,
      metadata: parsed.data.metadata,
    });
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit package for archival' })
  async submitPackage(@Param('id') packageId: string, @CurrentUser() user?: AuthContext) {
    if (!user) throw new ForbiddenException('Authentication required');
    return this.documentsService.submitTransferPackage(packageId);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review transfer package (archivist action)' })
  async reviewPackage(
    @Param('id') packageId: string,
    @Body() body: z.infer<typeof reviewPackageSchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = reviewPackageSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.documentsService.reviewTransferPackage(
      packageId,
      user.userId,
      parsed.data.approved,
      parsed.data.rejection_reason,
    );
  }
}
