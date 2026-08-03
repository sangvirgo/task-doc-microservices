import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { createWriteStream, mkdirSync } from 'fs';
import { stat, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import { CurrentUser, AuthContext, isAdmin, hasCapability } from '@c17/auth-context';
import { getCorrelationId } from '@c17/observability';
import { Capability } from '@c17/contracts';

import {
  DocumentsService,
  DocumentDto,
  DocumentVersionDto,
  RecordDto,
  DownloadTicketDto,
  TransferPackageDto,
} from './documents.service';
import { PermissionClient } from '../permissions/permission.client';
import { AuditClient } from '../audit/audit.client';
import { SecurityClient } from '../security/security.client';

const createDocumentSchema = z.object({
  title: z.string().min(1),
  document_type: z.string().min(1),
  owner_id: z.string().uuid(),
  security_level: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).default('INTERNAL'),
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

const redeemDownloadTicketSchema = z.object({
  ticket_id: z.string().uuid(),
});

const createRecordSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

const recordEntrySchema = z.object({
  document_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
});

const TMP_UPLOAD_DIR =
  process.env.DOCUMENT_UPLOAD_TMP_DIR || join(tmpdir(), 'c17-document-management-uploads');
const MAX_UPLOAD_BYTES = Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
const ALLOWED_UPLOAD_MIME_TYPES = new Set(
  (
    process.env.DOCUMENT_ALLOWED_MIME_TYPES ||
    'application/pdf,text/plain,application/octet-stream,image/png,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

const rawBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', 'TRUE', 'FALSE'])])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return value.toLowerCase() === 'true';
  });

const multipartUploadSchema = z.object({
  title: z.string().min(1),
  document_type: z.string().min(1),
  owner_id: z.string().uuid(),
  security_level: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).default('INTERNAL'),
  retention_policy: z.string().optional(),
  declared_state_secret: rawBooleanSchema.default(false),
});

const rawUploadHeaderSchema = z.object({
  title: z.string().min(1),
  document_type: z.string().min(1),
  owner_id: z.string().uuid(),
  security_level: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).default('INTERNAL'),
  retention_policy: z.string().optional(),
  declared_state_secret: rawBooleanSchema.default(false),
});

interface UploadedDocumentResult {
  document: DocumentDto;
  version: DocumentVersionDto;
}

interface UploadMetadata {
  title: string;
  document_type: string;
  owner_id: string;
  security_level: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  retention_policy?: string;
  declared_state_secret: boolean;
}

interface UploadedFileReference {
  filePath: string;
  fileSize: number;
  mimeType: string;
  originalName: string;
}

interface UploadedFilePayload {
  path: string;
  size: number;
  mimetype: string;
  originalname: string;
}

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
  ) {}

  @Get()
  @ApiOperation({ summary: 'List documents' })
  async listDocuments(
    @Query('owner_id') owner_id?: string,
    @Query('creator_id') creator_id?: string,
    @Query('status') status?: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<DocumentDto[]> {
    if (!user) throw new ForbiddenException('Authentication required');
    const documents = await this.documentsService.listDocuments({ owner_id, creator_id, status });
    const visible = await Promise.all(
      documents.map(async (document) => {
        const decision = await this.permissionClient.check({
          actor_id: user.userId,
          actor_role: user.role,
          resource_type: 'DOCUMENT',
          resource_id: document.id,
          action: 'PREVIEW',
          correlation_id: getCorrelationId() ?? randomUUID(),
        });
        return decision.allowed ? document : null;
      }),
    );
    return visible.filter((document): document is DocumentDto => document !== null);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: TMP_UPLOAD_DIR,
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Upload a document with streamed downstream processing' })
  async uploadDocument(
    @UploadedFile() file: UploadedFilePayload | undefined,
    @Body() body: Record<string, string>,
    @CurrentUser() user?: AuthContext,
  ): Promise<UploadedDocumentResult> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (!file) throw new BadRequestException('A file upload is required');

    const parsed = multipartUploadSchema.safeParse(body);
    if (!parsed.success) {
      await safeDelete(file.path);
      throw new BadRequestException(parsed.error.issues);
    }

    return this.handleUploadedFile(
      {
        filePath: file.path,
        fileSize: file.size,
        mimeType: normalizeMimeType(file.mimetype),
        originalName: file.originalname,
      },
      parsed.data,
      user,
    );
  }

  @Post('upload/raw')
  @ApiOperation({ summary: 'Upload a raw document stream with metadata headers' })
  async uploadRawDocument(
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @CurrentUser() user?: AuthContext,
  ): Promise<UploadedDocumentResult> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = rawUploadHeaderSchema.safeParse({
      title: firstHeader(headers['x-document-title']),
      document_type: firstHeader(headers['x-document-type']),
      owner_id: firstHeader(headers['x-document-owner-id']),
      security_level: firstHeader(headers['x-document-security-level']) || 'INTERNAL',
      retention_policy: firstHeader(headers['x-document-retention-policy']),
      declared_state_secret: firstHeader(headers['x-document-state-secret']) || false,
    });

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const mimeType = normalizeMimeType(firstHeader(headers['content-type']));
    const tempFilePath = join(
      TMP_UPLOAD_DIR,
      `${randomUUID()}-${sanitizeFilename('raw-upload.bin')}`,
    );
    mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

    await pipeline(req, createWriteStream(tempFilePath));

    const fileStat = await stat(tempFilePath);

    return this.handleUploadedFile(
      {
        filePath: tempFilePath,
        fileSize: fileStat.size,
        mimeType,
        originalName: basename(tempFilePath),
      },
      parsed.data,
      user,
    );
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
        correlation_id: getCorrelationId() ?? randomUUID(),
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
      correlation_id: getCorrelationId() ?? randomUUID(),
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
      correlation_id: getCorrelationId() ?? randomUUID(),
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

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'UPDATE',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });
    if (!permCheck.allowed)
      throw new ForbiddenException(`Document update denied: ${permCheck.reason_code}`);

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
  async getVersions(
    @Param('id') documentId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<DocumentVersionDto[]> {
    await this.requireDocumentPreview(documentId, user);
    return this.documentsService.getDocumentVersions(documentId);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Get specific document version' })
  async getVersion(
    @Param('id') documentId: string,
    @Param('version') version: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<DocumentVersionDto> {
    await this.requireDocumentPreview(documentId, user);
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) throw new BadRequestException('Invalid version number');
    return this.documentsService.getDocumentVersion(documentId, versionNum);
  }

  private async requireDocumentPreview(documentId: string, user?: AuthContext): Promise<void> {
    if (!user) throw new ForbiddenException('Authentication required');
    const decision = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'PREVIEW',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });
    if (!decision.allowed)
      throw new ForbiddenException(`Document access denied: ${decision.reason_code}`);
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
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Download denied: ${permCheck.reason_code}`);
    }

    return this.documentsService
      .createDownloadTicket({
        document_id: documentId,
        version: parsed.data.version,
        actor_id: user.userId,
        expires_in_seconds: parsed.data.expires_in_seconds,
        max_expires_at: permCheck.effective_expires_at
          ? new Date(permCheck.effective_expires_at)
          : undefined,
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
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Download denied: ${permCheck.reason_code}`);
    }

    const document = await this.documentsService.getDocument(documentId);
    return this.documentsService.createDownloadTicket({
      document_id: documentId,
      version: document.current_version,
      actor_id: user.userId,
      expires_in_seconds: 3600,
      max_expires_at: permCheck.effective_expires_at
        ? new Date(permCheck.effective_expires_at)
        : undefined,
    });
  }

  @Post(':id/versions/:version/redeem')
  @ApiOperation({ summary: 'Redeem a single-use download ticket and stream plaintext bytes' })
  async redeemDownloadTicket(
    @Param('id') documentId: string,
    @Param('version') version: string,
    @Body() body: z.infer<typeof redeemDownloadTicketSchema>,
    @CurrentUser() user: AuthContext | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = redeemDownloadTicketSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) {
      throw new BadRequestException('Invalid version number');
    }

    const correlationId = getCorrelationId() ?? randomUUID();
    const auditDeny = async (reason_code: string) => {
      await this.auditClient.record({
        event_type: 'DOCUMENT_DOWNLOAD_DENIED',
        actor_id: user.userId,
        resource_type: 'DOCUMENT',
        resource_id: documentId,
        payload: { version: versionNum, ticket_id: parsed.data.ticket_id, reason_code },
      });
    };

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action: 'DOWNLOAD',
      correlation_id: correlationId,
    });

    if (!permCheck.allowed) {
      await auditDeny(permCheck.reason_code || 'DOWNLOAD_DENIED');
      throw new ForbiddenException('Download denied');
    }

    const ticket = await this.documentsService
      .getDownloadTicket(parsed.data.ticket_id)
      .catch(async () => {
        await auditDeny('DOWNLOAD_TICKET_NOT_FOUND');
        throw new ForbiddenException('Download denied');
      });

    if (ticket.document_id !== documentId || ticket.version !== versionNum) {
      await auditDeny('DOWNLOAD_TICKET_RESOURCE_MISMATCH');
      throw new ForbiddenException('Download denied');
    }

    if (ticket.actor_id !== user.userId) {
      await auditDeny('DOWNLOAD_TICKET_ACTOR_MISMATCH');
      throw new ForbiddenException('Download denied');
    }

    if (ticket.used_at) {
      await auditDeny('DOWNLOAD_TICKET_ALREADY_USED');
      throw new ForbiddenException('Download denied');
    }

    if (ticket.expires_at.getTime() <= Date.now()) {
      await auditDeny('DOWNLOAD_TICKET_EXPIRED');
      throw new ForbiddenException('Download denied');
    }

    const markedUsed = await this.documentsService.markDownloadTicketUsed(ticket.id);
    if (!markedUsed) {
      await auditDeny('DOWNLOAD_TICKET_ALREADY_USED');
      throw new ForbiddenException('Download denied');
    }

    const securityResponse = await this.securityClient.redeemDownload({
      document_id: documentId,
      version: versionNum,
      correlation_id: correlationId,
    });

    if (!securityResponse?.body) {
      await this.auditClient.record({
        event_type: 'DOCUMENT_DOWNLOAD_DENIED',
        actor_id: user.userId,
        resource_type: 'DOCUMENT',
        resource_id: documentId,
        payload: {
          version: versionNum,
          ticket_id: parsed.data.ticket_id,
          reason_code: 'DOCUMENT_DOWNLOAD_UNAVAILABLE',
        },
      });
      throw new ServiceUnavailableException('Download unavailable');
    }

    await this.auditClient.record({
      event_type: 'DOCUMENT_DOWNLOAD_REDEEMED',
      actor_id: user.userId,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      payload: { version: versionNum, ticket_id: parsed.data.ticket_id },
    });

    const contentType = securityResponse.headers.get('content-type') || 'application/octet-stream';
    const contentLength = securityResponse.headers.get('content-length');
    res.status(200);
    res.setHeader('content-type', contentType);
    if (contentLength) {
      res.setHeader('content-length', contentLength);
    }

    await pipeline(Readable.fromWeb(securityResponse.body as never), res);
  }

  private async handleUploadedFile(
    file: UploadedFileReference,
    metadata: UploadMetadata,
    user: AuthContext,
  ): Promise<UploadedDocumentResult> {
    try {
      this.assertUploadAccepted(file.fileSize, file.mimeType);

      if (metadata.declared_state_secret) {
        await this.auditClient.record({
          event_type: 'DOCUMENT_UPLOAD_REJECTED',
          actor_id: user.userId,
          resource_type: 'DOCUMENT',
          resource_id: randomUUID(),
          payload: {
            reason_code: 'STATE_SECRET_DECLARED',
            title: metadata.title,
            document_type: metadata.document_type,
          },
        });
        throw new BadRequestException('Declared state-secret material is not accepted');
      }

      const documentId = randomUUID();
      const processed = await this.securityClient.processUpload({
        document_id: documentId,
        version: 1,
        file_path: file.filePath,
        file_size: file.fileSize,
        mime_type: file.mimeType,
        original_filename: file.originalName,
      });

      if (!processed) {
        throw new BadRequestException('Document security processing failed');
      }

      const created = await this.documentsService.createUploadedDocument({
        document_id: documentId,
        title: metadata.title,
        document_type: metadata.document_type,
        owner_id: metadata.owner_id,
        creator_id: user.userId,
        security_level: metadata.security_level,
        retention_policy: metadata.retention_policy,
        object_key: processed.object_key,
        checksum: processed.checksum,
        signature: processed.signature,
        encrypted_dek: processed.encrypted_dek,
        file_size: processed.file_size,
        mime_type: processed.mime_type,
        kek_version: processed.kek_version,
        correlation_id: getCorrelationId() ?? randomUUID(),
      });

      await this.auditClient.record({
        event_type: 'DOCUMENT_CREATED',
        actor_id: user.userId,
        resource_type: 'DOCUMENT',
        resource_id: created.document.id,
        payload: {
          title: created.document.title,
          document_type: created.document.document_type,
          security_level: created.document.security_level,
          version: created.version.version,
        },
      });
      return created;
    } finally {
      await safeDelete(file.filePath);
    }
  }

  private assertUploadAccepted(fileSize: number, mimeType: string): void {
    if (fileSize <= 0) {
      throw new BadRequestException('Uploaded file must not be empty');
    }
    if (fileSize > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`Upload exceeds the ${MAX_UPLOAD_BYTES} byte limit`);
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Unsupported MIME type: ${mimeType}`);
    }
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeMimeType(value: string | undefined): string {
  return (value || '').split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function safeDelete(path: string): Promise<void> {
  await rm(path, { force: true }).catch(() => undefined);
}

/**
 * Record Management API (V3 §5.7).
 * Records group document versions for archival transfer.
 */
@ApiTags('records')
@Controller('records')
export class RecordsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly permissionClient: PermissionClient,
    private readonly auditClient: AuditClient,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List records' })
  async listRecords(
    @Query('creator_id') creator_id?: string,
    @Query('status') status?: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<RecordDto[]> {
    if (!user) throw new ForbiddenException('Authentication required');
    return this.documentsService.listRecords({ creator_id: creator_id || user.userId, status });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new record' })
  async createRecord(
    @Body() body: z.infer<typeof createRecordSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<RecordDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot create records');

    const parsed = createRecordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const record = await this.documentsService.createRecord({
      title: parsed.data.title,
      description: parsed.data.description,
      creator_id: user.userId,
    });

    await this.auditClient.record({
      event_type: 'RECORD_CREATED',
      actor_id: user.userId,
      resource_type: 'RECORD',
      resource_id: record.id,
      payload: { title: record.title, description: record.description },
    });

    return record;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get record by ID' })
  async getRecord(
    @Param('id') recordId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<RecordDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    const record = await this.documentsService.getRecord(recordId);
    if (record.creator_id !== user.userId) {
      throw new ForbiddenException('Only the record custodian may access this record');
    }
    return record;
  }

  @Post(':id/entries')
  @ApiOperation({ summary: 'Add document to record' })
  async addEntry(
    @Param('id') recordId: string,
    @Body() body: z.infer<typeof recordEntrySchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot modify records');

    const parsed = recordEntrySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const record = await this.documentsService.getRecord(recordId);
    if (record.creator_id !== user.userId) {
      throw new ForbiddenException('Only the record custodian may modify this record');
    }

    const entry = await this.documentsService.addDocumentToRecord(
      recordId,
      parsed.data.document_id,
      parsed.data.document_version_id,
    );

    await this.auditClient.record({
      event_type: 'RECORD_ENTRY_ADDED',
      actor_id: user.userId,
      resource_type: 'RECORD',
      resource_id: recordId,
      payload: {
        document_id: parsed.data.document_id,
        document_version_id: parsed.data.document_version_id,
      },
    });

    return entry;
  }

  @Post(':id/seal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seal record (no more edits allowed)' })
  async sealRecord(
    @Param('id') recordId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<RecordDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot seal records');

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'RECORD',
      resource_id: recordId,
      action: 'TRANSFER',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Record seal denied: ${permCheck.reason_code}`);
    }

    const record = await this.documentsService.sealRecord(recordId);

    await this.auditClient.record({
      event_type: 'RECORD_SEALED',
      actor_id: user.userId,
      resource_type: 'RECORD',
      resource_id: recordId,
      payload: { title: record.title, entry_count: record.entries.length },
    });

    return record;
  }
}

/**
 * Transfer Package API (V3 §5.9).
 * Manages archival transfer packages for records.
 */
@ApiTags('transfer-packages')
@Controller('transfer-packages')
export class TransferPackagesController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly permissionClient: PermissionClient,
    private readonly auditClient: AuditClient,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create transfer package (requires ARCHIVE_SUBMIT capability)' })
  async createPackage(
    @Body() body: { record_id: string },
    @CurrentUser() user?: AuthContext,
  ): Promise<TransferPackageDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot create transfer packages');
    if (!hasCapability(user, Capability.ARCHIVE_SUBMIT)) {
      throw new ForbiddenException('ARCHIVE_SUBMIT capability required');
    }

    const parsed = z.object({ record_id: z.string().uuid() }).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: parsed.data.record_id,
      action: 'TRANSFER',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Transfer package creation denied: ${permCheck.reason_code}`);
    }

    const pkg = await this.documentsService.createTransferPackage({
      record_id: parsed.data.record_id,
      submitter_id: user.userId,
    });

    await this.auditClient.record({
      event_type: 'TRANSFER_PACKAGE_CREATED',
      actor_id: user.userId,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: pkg.id,
      payload: { record_id: pkg.record_id, status: pkg.status },
    });

    return pkg;
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit package for archival (requires ARCHIVE_SUBMIT capability)' })
  async submitPackage(
    @Param('id') packageId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TransferPackageDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot submit transfer packages');
    if (!hasCapability(user, Capability.ARCHIVE_SUBMIT)) {
      throw new ForbiddenException('ARCHIVE_SUBMIT capability required');
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      action: 'TRANSFER',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Transfer package submission denied: ${permCheck.reason_code}`);
    }

    const pkg = await this.documentsService.submitTransferPackage(packageId, user.userId);

    await this.auditClient.record({
      event_type: 'TRANSFER_PACKAGE_SUBMITTED',
      actor_id: user.userId,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      payload: { record_id: pkg.record_id, status: pkg.status },
    });

    return pkg;
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive package for checking (requires ARCHIVE_RECEIVE capability)' })
  async receivePackage(
    @Param('id') packageId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TransferPackageDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot receive transfer packages');
    if (!hasCapability(user, Capability.ARCHIVE_RECEIVE)) {
      throw new ForbiddenException('ARCHIVE_RECEIVE capability required');
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      action: 'TRANSFER',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Transfer package reception denied: ${permCheck.reason_code}`);
    }

    const pkg = await this.documentsService.receiveTransferPackage(packageId, user.userId);

    await this.auditClient.record({
      event_type: 'TRANSFER_PACKAGE_RECEIVED',
      actor_id: user.userId,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      payload: { record_id: pkg.record_id, status: pkg.status },
    });

    return pkg;
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept package (requires ARCHIVE_RECEIVE capability)' })
  async acceptPackage(
    @Param('id') packageId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TransferPackageDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot accept transfer packages');
    if (!hasCapability(user, Capability.ARCHIVE_RECEIVE)) {
      throw new ForbiddenException('ARCHIVE_RECEIVE capability required');
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      action: 'TRANSFER',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Transfer package acceptance denied: ${permCheck.reason_code}`);
    }

    const pkg = await this.documentsService.acceptTransferPackage(packageId, user.userId);

    await this.auditClient.record({
      event_type: 'TRANSFER_PACKAGE_ACCEPTED',
      actor_id: user.userId,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      payload: { record_id: pkg.record_id, status: pkg.status },
    });

    return pkg;
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject package (requires ARCHIVE_RECEIVE capability)' })
  async rejectPackage(
    @Param('id') packageId: string,
    @Body() body: { rejection_reason: string },
    @CurrentUser() user?: AuthContext,
  ): Promise<TransferPackageDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot reject transfer packages');
    if (!hasCapability(user, Capability.ARCHIVE_RECEIVE)) {
      throw new ForbiddenException('ARCHIVE_RECEIVE capability required');
    }

    const parsed = z.object({ rejection_reason: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      action: 'TRANSFER',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Transfer package rejection denied: ${permCheck.reason_code}`);
    }

    const pkg = await this.documentsService.rejectTransferPackage(
      packageId,
      user.userId,
      parsed.data.rejection_reason,
    );

    await this.auditClient.record({
      event_type: 'TRANSFER_PACKAGE_REJECTED',
      actor_id: user.userId,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      payload: {
        record_id: pkg.record_id,
        status: pkg.status,
        rejection_reason: pkg.rejection_reason,
      },
    });

    return pkg;
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive accepted package (requires ARCHIVE_RECEIVE capability)' })
  async archivePackage(
    @Param('id') packageId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TransferPackageDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot archive transfer packages');
    if (!hasCapability(user, Capability.ARCHIVE_RECEIVE)) {
      throw new ForbiddenException('ARCHIVE_RECEIVE capability required');
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      action: 'TRANSFER',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Transfer package archival denied: ${permCheck.reason_code}`);
    }

    const pkg = await this.documentsService.archiveTransferPackage(packageId);

    await this.auditClient.record({
      event_type: 'TRANSFER_PACKAGE_ARCHIVED',
      actor_id: user.userId,
      resource_type: 'TRANSFER_PACKAGE',
      resource_id: packageId,
      payload: { record_id: pkg.record_id, status: pkg.status },
    });

    return pkg;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer package by ID' })
  async getPackage(
    @Param('id') packageId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TransferPackageDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    const pkg = await this.documentsService.getTransferPackage(packageId);
    if (
      !isAdmin(user) &&
      pkg.submitter_id !== user.userId &&
      !hasCapability(user, Capability.ARCHIVE_RECEIVE)
    ) {
      throw new ForbiddenException('Transfer package access denied');
    }
    return pkg;
  }

  @Get()
  @ApiOperation({ summary: 'List transfer packages' })
  async listPackages(
    @Query('record_id') record_id?: string,
    @Query('status') status?: string,
    @Query('submitter_id') submitter_id?: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TransferPackageDto[]> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (!isAdmin(user) && !hasCapability(user, Capability.ARCHIVE_RECEIVE)) {
      return this.documentsService.listTransferPackages({
        record_id,
        status,
        submitter_id: user.userId,
      });
    }
    return this.documentsService.listTransferPackages({ record_id, status, submitter_id });
  }
}

/**
 * Retention and Disposal API (V3 §5.9).
 * Manages retention eligibility, holds, and controlled disposal.
 */
@ApiTags('retention-disposal')
@Controller('retention-disposal')
export class RetentionDisposalController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly permissionClient: PermissionClient,
    private readonly auditClient: AuditClient,
  ) {}

  @Post('check-eligibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check retention eligibility (idempotent worker)' })
  async checkEligibility(@CurrentUser() user?: AuthContext) {
    if (!user) throw new ForbiddenException('Authentication required');

    const eligibleIds = await this.documentsService.checkRetentionEligibility();

    for (const docId of eligibleIds) {
      await this.auditClient.record({
        event_type: 'RETENTION_ELIGIBLE',
        actor_id: user.userId,
        resource_type: 'DOCUMENT',
        resource_id: docId,
        payload: { status: 'DISPOSED_ELIGIBLE' },
      });
    }

    return { eligible_count: eligibleIds.length, eligible_ids: eligibleIds };
  }

  @Post('approve-disposal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve disposal (requires DISPOSAL_APPROVE capability)' })
  async approveDisposal(
    @Body() body: { document_id: string; reason: string },
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot approve disposal');
    if (!hasCapability(user, Capability.DISPOSAL_APPROVE)) {
      throw new ForbiddenException('DISPOSAL_APPROVE capability required');
    }

    const parsed = z
      .object({
        document_id: z.string().uuid(),
        reason: z.string().min(1),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: parsed.data.document_id,
      action: 'DISPOSE',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Disposal approval denied: ${permCheck.reason_code}`);
    }

    const approval = await this.documentsService.approveDisposal({
      document_id: parsed.data.document_id,
      approver_id: user.userId,
      reason: parsed.data.reason,
    });

    await this.auditClient.record({
      event_type: 'DISPOSAL_APPROVED',
      actor_id: user.userId,
      resource_type: 'DOCUMENT',
      resource_id: parsed.data.document_id,
      payload: { reason: parsed.data.reason, approval_id: approval.id },
    });

    return approval;
  }

  @Post('execute-disposal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute disposal (requires DISPOSAL_APPROVE capability)' })
  async executeDisposal(@Body() body: { document_id: string }, @CurrentUser() user?: AuthContext) {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot execute disposal');
    if (!hasCapability(user, Capability.DISPOSAL_APPROVE)) {
      throw new ForbiddenException('DISPOSAL_APPROVE capability required');
    }

    const parsed = z.object({ document_id: z.string().uuid() }).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: parsed.data.document_id,
      action: 'DISPOSE',
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Disposal execution denied: ${permCheck.reason_code}`);
    }

    const result = await this.documentsService.executeDisposal(parsed.data.document_id);

    const eventType = result.status === 'DISPOSED' ? 'DISPOSAL_EXECUTED' : 'DISPOSAL_FAILED';

    await this.auditClient.record({
      event_type: eventType,
      actor_id: user.userId,
      resource_type: 'DOCUMENT',
      resource_id: parsed.data.document_id,
      payload: {
        status: result.status,
        objects_deleted: result.objects_deleted,
      },
    });

    return result;
  }

  @Post('holds')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place a retention hold' })
  async placeHold(
    @Body() body: { document_id: string; reason: string },
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = z
      .object({
        document_id: z.string().uuid(),
        reason: z.string().min(1),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.documentsService.placeRetentionHold({
      document_id: parsed.data.document_id,
      reason: parsed.data.reason,
      placed_by: user.userId,
    });
  }

  @Post('holds/:id/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release a retention hold' })
  async releaseHold(@Param('id') holdId: string, @CurrentUser() user?: AuthContext) {
    if (!user) throw new ForbiddenException('Authentication required');
    return this.documentsService.releaseRetentionHold(holdId);
  }

  @Get('holds')
  @ApiOperation({ summary: 'List retention holds' })
  async listHolds(
    @Query('document_id') document_id?: string,
    @Query('released') released?: string,
  ) {
    return this.documentsService.listRetentionHolds({
      document_id,
      released: released === 'true' ? true : released === 'false' ? false : undefined,
    });
  }

  @Get('approvals')
  @ApiOperation({ summary: 'List disposal approvals' })
  async listApprovals(@Query('document_id') document_id?: string) {
    return this.documentsService.listDisposalApprovals({ document_id });
  }
}
