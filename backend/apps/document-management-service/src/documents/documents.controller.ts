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
  UploadedFiles,
  UseInterceptors,
  Optional,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
import {
  Capability,
  createPaginationMeta,
  paginationQuerySchema,
  PaginatedResponse,
  PaginationQuery,
  PermissionAction,
} from '@c17/contracts';

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
import { TaskDocumentsService } from '../tasks/task-documents.service';
import { formatPreviewActorLabel } from '../security/preview-watermark-identity';
import type {
  TaskDocumentGrantInput,
  TaskDocumentGrantResult,
} from '../tasks/task-documents.service';
import {
  DocumentStatisticsService,
  parseDocumentStatisticsQuery,
} from './document-statistics.service';

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
  task_id: z.string().uuid(),
  version: z.number().int().positive(),
  expires_in_seconds: z.number().int().positive().default(3600),
});

const redeemDownloadTicketSchema = z.object({
  ticket_id: z.string().uuid(),
});

const previewSessionSchema = z.object({
  task_id: z.string().uuid().optional(),
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

const PERMISSION_SCAN_PAGE_SIZE = 100;

function parsePagination(page?: string, page_size?: string): PaginationQuery {
  const parsed = paginationQuerySchema.safeParse({ page, page_size });
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return parsed.data;
}
const MAX_UPLOAD_BYTES = Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
const MAX_UPLOAD_FILES = Number(process.env.DOCUMENT_UPLOAD_MAX_FILES || 10);
const PREVIEW_INITIAL_PAGES = Number(process.env.PREVIEW_INITIAL_PAGES || 10);
const PREVIEW_EXTEND_PAGES = Number(process.env.PREVIEW_EXTEND_PAGES || 10);
const ALLOWED_UPLOAD_MIME_TYPES = new Set(
  (
    process.env.DOCUMENT_ALLOWED_MIME_TYPES ||
    'application/pdf,text/plain,application/octet-stream,image/png,image/jpeg,image/gif,image/webp,image/bmp,image/tiff,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/csv,application/rtf,text/rtf,application/zip,application/x-rar-compressed,application/x-7z-compressed'
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

const taskDocumentGrantSchema = z
  .object({
    actor_id: z.string().uuid(),
    permissions: z.array(z.string()).min(1),
    expires_at: z.string().datetime(),
    parent_grant_id: z.string().uuid().optional(),
  })
  .strict();

const taskDocumentGrantListSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(taskDocumentGrantSchema).min(1));

const multipartUploadSchema = z
  .object({
    title: z.string().min(1),
    document_type: z.string().min(1),
    security_level: z
      .enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
      .default('INTERNAL'),
    retention_policy: z.string().optional(),
    declared_state_secret: rawBooleanSchema.default(false),
    task_id: z.string().uuid().optional(),
    grants: taskDocumentGrantListSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.task_id && !value.grants) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grants'],
        message: 'grants are required when task_id is supplied',
      });
    }

    if (value.grants && !value.task_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['task_id'],
        message: 'task_id is required when grants are supplied',
      });
    }
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
  association?: TaskDocumentGrantResult['association'];
  grants?: TaskDocumentGrantResult['grants'];
}

interface UploadedDocumentBatchResult {
  items: UploadedDocumentResult[];
}

type UploadDocumentsResponse = UploadedDocumentResult | UploadedDocumentBatchResult;

interface UploadMetadata {
  title: string;
  document_type: string;
  owner_id: string;
  security_level: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  retention_policy?: string;
  declared_state_secret: boolean;
  task_id?: string;
  grants?: TaskDocumentGrantInput[];
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
 * Actions that grant the right to view a document's page (metadata + versions).
 * A user holding any one of these may open the detail page; content-level actions
 * (PREVIEW content, DOWNLOAD) are enforced separately by their own endpoints.
 */
const DOCUMENT_VIEW_ACTIONS: readonly PermissionAction[] = [
  PermissionAction.PREVIEW,
  PermissionAction.DOWNLOAD,
  PermissionAction.SHARE,
  PermissionAction.DISPOSE,
];

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
    private readonly taskDocumentsService: TaskDocumentsService,
    @Optional() private readonly documentStatisticsService?: DocumentStatisticsService,
  ) {}

  @Get('internal/statistics')
  @ApiOperation({ summary: 'Get document statistics for an internal aggregator' })
  async getInternalStatistics(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthContext,
  ) {
    if (!this.documentStatisticsService) {
      throw new ServiceUnavailableException('Document statistics unavailable');
    }
    const parsed = parseDocumentStatisticsQuery(query);
    return this.documentStatisticsService.getOverview({ ...parsed, caller: user });
  }

  @Get('internal/titles')
  @ApiOperation({ summary: 'Resolve document titles for internal services' })
  async getInternalTitles(
    @Query('ids') ids?: string,
  ): Promise<Record<string, { title: string; document_type: string }>> {
    const parsed = z
      .string()
      .min(1)
      .safeParse(ids);
    if (!parsed.success) return {};
    const rawIds = parsed.data.split(',').map((value) => value.trim()).filter(Boolean);
    const uniqueIds = Array.from(new Set(rawIds));
    return this.documentsService.findTitlesByIds(uniqueIds);
  }

  @Get()
  @ApiOperation({ summary: 'List documents' })
  async listDocuments(
    @Query('owner_id') owner_id?: string,
    @Query('creator_id') creator_id?: string,
    @Query('status') status?: string,
    @CurrentUser() user?: AuthContext,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ): Promise<PaginatedResponse<DocumentDto>> {
    if (!user) throw new ForbiddenException('Authentication required');
    const pagination = parsePagination(page, page_size);

    if (!isAdmin(user)) {
      if (owner_id && owner_id !== user.userId) {
        throw new ForbiddenException('Employees may only list their own documents');
      }
      if (creator_id && creator_id !== user.userId) {
        throw new ForbiddenException('Employees may only list documents they created');
      }

      return this.documentsService.listDocuments(
        { owner_id: user.userId, creator_id, status },
        pagination,
      );
    }

    const allVisible: DocumentDto[] = [];
    let scanPage = 1;
    let hasNext = true;
    while (hasNext) {
      const documents = await this.documentsService.listDocuments(
        { owner_id, creator_id, status },
        { page: scanPage, page_size: PERMISSION_SCAN_PAGE_SIZE },
      );
      const visible = await Promise.all(
        documents.items.map(async (document) => {
          const decision = await this.permissionClient.check({
            actor_id: user.userId,
            actor_role: user.role,
            resource_type: 'DOCUMENT',
            resource_id: document.id,
            action: 'PREVIEW',
            owner_id: document.owner_id,
            creator_id: document.creator_id,
            correlation_id: getCorrelationId() ?? randomUUID(),
          });
          return decision.allowed ? document : null;
        }),
      );
      allVisible.push(...visible.filter((document): document is DocumentDto => document !== null));
      hasNext = documents.pagination.has_next;
      scanPage += 1;
    }

    const start = (pagination.page - 1) * pagination.page_size;
    return {
      items: allVisible.slice(start, start + pagination.page_size),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, allVisible.length),
    };
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('file', MAX_UPLOAD_FILES, {
      dest: TMP_UPLOAD_DIR,
      limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES },
    }),
  )
  @ApiOperation({ summary: 'Upload one or more documents with streamed downstream processing' })
  async uploadDocument(
    @UploadedFiles() files: UploadedFilePayload[] | undefined,
    @Body() body: Record<string, string>,
    @CurrentUser() user?: AuthContext,
  ): Promise<UploadDocumentsResponse> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot upload documents');
    if (!files?.length) throw new BadRequestException('A file upload is required');

    const parsed = multipartUploadSchema.safeParse(body);
    if (!parsed.success) {
      await Promise.all(files.map((file) => safeDelete(file.path)));
      throw new BadRequestException(parsed.error.issues);
    }

    const results: UploadedDocumentResult[] = [];
    const unprocessedPaths = new Set(files.map((file) => file.path));

    try {
      for (const file of files) {
        results.push(
          await this.handleUploadedFile(
            {
              filePath: file.path,
              fileSize: file.size,
              mimeType: normalizeMimeType(file.mimetype),
              originalName: file.originalname,
            },
            { ...parsed.data, owner_id: user.userId },
            user,
          ),
        );
        unprocessedPaths.delete(file.path);
      }
    } finally {
      await Promise.all([...unprocessedPaths].map((filePath) => safeDelete(filePath)));
    }

    return files.length === 1 ? results[0] : { items: results };
  }

  @Post('upload/raw')
  @ApiOperation({ summary: 'Upload a raw document stream with metadata headers' })
  async uploadRawDocument(
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @CurrentUser() user?: AuthContext,
  ): Promise<UploadedDocumentResult> {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot upload documents');

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
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot create documents');

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
      });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document metadata' })
  async getDocument(
    @Param('id') documentId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<DocumentDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const { document, allowed } = await this.checkAnyDocumentAccess(documentId, user);

    if (!allowed) {
      throw new ForbiddenException('Document access denied');
    }

    return document;
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Get document preview' })
  async getDocumentPreview(@Param('id') documentId: string, @CurrentUser() user?: AuthContext) {
    if (!user) throw new ForbiddenException('Authentication required');

    const { decision: permCheck } = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.PREVIEW,
    );

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
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot create document versions');

    const { decision: permCheck } = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.UPDATE,
    );
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
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ) {
    await this.requireAnyDocumentAccess(documentId, user);
    return this.documentsService.getDocumentVersions(documentId, parsePagination(page, page_size));
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Get specific document version' })
  async getVersion(
    @Param('id') documentId: string,
    @Param('version') version: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<DocumentVersionDto> {
    await this.requireAnyDocumentAccess(documentId, user);
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) throw new BadRequestException('Invalid version number');
    return this.documentsService.getDocumentVersion(documentId, versionNum);
  }

  private async requireAnyDocumentAccess(documentId: string, user?: AuthContext): Promise<void> {
    if (!user) throw new ForbiddenException('Authentication required');
    const { allowed } = await this.checkAnyDocumentAccess(documentId, user);
    if (!allowed) throw new ForbiddenException('Document access denied');
  }

  /**
   * A document page is viewable if the caller holds any document access action
   * (e.g. PREVIEW, DOWNLOAD, UPDATE, SHARE, DISPOSE) — not only PREVIEW. A user
   * with DOWNLOAD-only must be able to open the page and download, without preview.
   */
  private async checkAnyDocumentAccess(
    documentId: string,
    user: AuthContext,
  ): Promise<{ document: DocumentDto; allowed: boolean }> {
    const document = await this.documentsService.getDocument(documentId);
    for (const action of DOCUMENT_VIEW_ACTIONS) {
      const decision = await this.permissionClient.check({
        actor_id: user.userId,
        actor_role: user.role,
        resource_type: 'DOCUMENT',
        resource_id: documentId,
        action,
        task_id: null,
        owner_id: document.owner_id,
        creator_id: document.creator_id,
        correlation_id: getCorrelationId() ?? randomUUID(),
      });
      if (decision.allowed) return { document, allowed: true };
    }
    return { document, allowed: false };
  }

  @Post(':id/versions/:version/preview-session')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a short-lived, watermarked preview session' })
  async createPreviewSession(
    @Param('id') documentId: string,
    @Param('version') version: string,
    @Body() body: z.infer<typeof previewSessionSchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsedBody = previewSessionSchema.safeParse(body);
    if (!parsedBody.success) throw new BadRequestException(parsedBody.error.issues);
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum) || versionNum < 1) {
      throw new BadRequestException('Invalid version number');
    }

    const { document, decision: previewDecision } = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.PREVIEW,
      parsedBody.data.task_id,
    );
    if (!previewDecision.allowed) {
      await this.auditClient.record({
        event_type: 'DOCUMENT_PREVIEW_DENIED',
        actor_id: user.userId,
        resource_type: 'DOCUMENT',
        resource_id: documentId,
        payload: { version: versionNum, reason_code: previewDecision.reason_code },
      });
      throw new ForbiddenException(`Document preview denied: ${previewDecision.reason_code}`);
    }

    const sessionId = randomUUID();
    const securityPreview = await this.securityClient.preparePreview({
      document_id: documentId,
      version: versionNum,
      actor_label: formatPreviewActorLabel(user),
      session_id: sessionId,
      max_pages: PREVIEW_INITIAL_PAGES,
    });
    if (!securityPreview) {
      throw new ServiceUnavailableException('Document preview renderer is unavailable');
    }
    const previewExpiresAt = new Date(securityPreview.expires_at);
    if (Number.isNaN(previewExpiresAt.getTime()) || previewExpiresAt.getTime() <= Date.now()) {
      await this.securityClient.revokePreview(securityPreview.preview_id);
      throw new ServiceUnavailableException('Document preview renderer returned an invalid expiry');
    }

    const downloadDecision = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.DOWNLOAD,
      parsedBody.data.task_id,
    );
    const session = await this.documentsService.createPreviewSession({
      id: sessionId,
      document_id: documentId,
      task_id: parsedBody.data.task_id,
      version: versionNum,
      actor_id: user.userId,
      security_preview_id: securityPreview.preview_id,
      page_count: securityPreview.page_count,
      mime_type: securityPreview.mime_type,
      expires_at: previewExpiresAt,
    });

    await this.auditClient.record({
      event_type: 'DOCUMENT_PREVIEW_SESSION_CREATED',
      actor_id: user.userId,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      payload: { version: versionNum, session_id: session.id, page_count: session.page_count },
    });

    return {
      id: session.id,
      document_id: session.document_id,
      version: session.version,
      page_count: session.page_count,
      total_pages: securityPreview.total_pages,
      mime_type: session.mime_type,
      expires_at: session.expires_at,
      capabilities: { preview: true, download: downloadDecision.decision.allowed },
      title: document.title,
    };
  }

  @Post(':id/versions/:version/preview-session/:sessionId/pages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Render additional pages for an existing preview session' })
  async extendPreviewSession(
    @Param('id') documentId: string,
    @Param('version') version: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { to_page?: unknown },
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum) || versionNum < 1)
      throw new BadRequestException('Invalid version number');

    const parsedToPage = z.coerce.number().int().positive().safeParse(body?.to_page);
    if (!parsedToPage.success) throw new BadRequestException('Invalid target page');

    const session = await this.documentsService.getPreviewSession(sessionId);
    if (
      session.document_id !== documentId ||
      session.version !== versionNum ||
      session.actor_id !== user.userId
    ) {
      throw new ForbiddenException('Preview session access denied');
    }

    const { decision } = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.PREVIEW,
      session.task_id ?? undefined,
    );
    if (!decision.allowed) throw new ForbiddenException('Document preview permission revoked');

    const startPage = session.page_count + 1;
    const toPage = Math.min(parsedToPage.data, startPage + PREVIEW_EXTEND_PAGES - 1);
    if (toPage < startPage) {
      return { page_count: session.page_count, total_pages: session.page_count };
    }

    const extended = await this.securityClient.extendPreview(
      session.security_preview_id,
      startPage,
      toPage,
    );
    if (!extended) {
      throw new ServiceUnavailableException('Document preview renderer is unavailable');
    }

    const updated = await this.documentsService.updatePreviewSessionPageCount(
      sessionId,
      extended.page_count,
    );

    return {
      page_count: updated.page_count,
      total_pages: extended.total_pages,
    };
  }

  @Get(':id/versions/:version/preview-session/:sessionId/pages/:page')
  @ApiOperation({ summary: 'Get one server-rendered, watermarked preview page' })
  async getPreviewPage(
    @Param('id') documentId: string,
    @Param('version') version: string,
    @Param('sessionId') sessionId: string,
    @Param('page') page: string,
    @CurrentUser() user: AuthContext | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!user) throw new ForbiddenException('Authentication required');
    const versionNum = parseInt(version, 10);
    const pageNum = parseInt(page, 10);
    if (isNaN(versionNum) || versionNum < 1)
      throw new BadRequestException('Invalid version number');
    if (isNaN(pageNum) || pageNum < 1) throw new BadRequestException('Invalid preview page number');

    const session = await this.documentsService.getPreviewSession(sessionId);
    if (session.actor_id !== user.userId) throw new ForbiddenException('Preview access denied');

    const { decision } = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.PREVIEW,
      session.task_id ?? undefined,
    );
    if (!decision.allowed) throw new ForbiddenException('Document preview permission revoked');

    await this.documentsService.markPreviewPageRequested({
      session_id: sessionId,
      document_id: documentId,
      version: versionNum,
      actor_id: user.userId,
      page: pageNum,
    });

    const pageArtifact = await this.securityClient.getPreviewPage(
      session.security_preview_id,
      pageNum,
    );
    if (!pageArtifact) {
      throw new ServiceUnavailableException('Document preview page is unavailable');
    }

    res.setHeader('content-type', pageArtifact.mime_type);
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('pragma', 'no-cache');
    res.setHeader('x-content-type-options', 'nosniff');
    res.status(HttpStatus.OK).send(pageArtifact.bytes);

    await this.auditClient.record({
      event_type: 'DOCUMENT_PREVIEW_PAGE_VIEWED',
      actor_id: user.userId,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      payload: { version: versionNum, session_id: sessionId, page: pageNum },
    });
  }

  @Post(':id/versions/:version/preview-session/:sessionId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a preview session' })
  async revokePreviewSession(
    @Param('id') documentId: string,
    @Param('version') version: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<void> {
    if (!user) throw new ForbiddenException('Authentication required');
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum) || versionNum < 1)
      throw new BadRequestException('Invalid version number');
    const session = await this.documentsService.getPreviewSession(sessionId);
    if (
      session.document_id !== documentId ||
      session.version !== versionNum ||
      session.actor_id !== user.userId
    ) {
      throw new ForbiddenException('Preview session access denied');
    }

    await this.documentsService.revokePreviewSession(sessionId, user.userId);
    await this.securityClient.revokePreview(session.security_preview_id);
    await this.auditClient.record({
      event_type: 'DOCUMENT_PREVIEW_SESSION_REVOKED',
      actor_id: user.userId,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      payload: { version: versionNum, session_id: sessionId },
    });
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

    const { decision: permCheck } = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.DOWNLOAD,
      parsed.data.task_id,
    );

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Download denied: ${permCheck.reason_code}`);
    }

    return this.documentsService
      .createDownloadTicket({
        document_id: documentId,
        task_id: parsed.data.task_id,
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
    @Query('task_id') taskId: string | undefined,
    @CurrentUser() user?: AuthContext,
  ): Promise<DownloadTicketDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    const parsedTaskId = z.string().uuid().safeParse(taskId);
    if (!parsedTaskId.success) throw new BadRequestException('task_id is required');

    const { decision: permCheck } = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.DOWNLOAD,
      parsedTaskId.data,
    );

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Download denied: ${permCheck.reason_code}`);
    }

    const document = await this.documentsService.getDocument(documentId);
    return this.documentsService.createDownloadTicket({
      document_id: documentId,
      task_id: parsedTaskId.data,
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

    // Tickets issued before task binding have no safe context for a detachment
    // recheck, so deny them rather than allowing a legacy ticket to bypass it.
    if (!ticket.task_id) {
      await auditDeny('DOWNLOAD_TICKET_TASK_CONTEXT_MISSING');
      throw new ForbiddenException('Download denied');
    }

    const { decision: permCheck } = await this.checkDocumentPermission(
      documentId,
      user,
      PermissionAction.DOWNLOAD,
      ticket.task_id,
    );

    if (!permCheck.allowed) {
      await auditDeny(permCheck.reason_code || 'DOWNLOAD_DENIED');
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

  private async checkDocumentPermission(
    documentId: string,
    user: AuthContext,
    action: PermissionAction,
    taskId?: string | null,
  ) {
    const document = await this.documentsService.getDocument(documentId);
    const decision = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action,
      task_id: taskId,
      owner_id: document.owner_id,
      creator_id: document.creator_id,
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    return { document, decision };
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

      if (!metadata.task_id || !metadata.grants) return created;

      const attached = await this.taskDocumentsService.attach(
        metadata.task_id,
        created.document.id,
        metadata.grants,
        user,
      );

      return {
        ...created,
        association: attached.association,
        grants: attached.grants,
      };
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
    @Query('creator_id') _creator_id?: string,
    @Query('status') status?: string,
    @CurrentUser() user?: AuthContext,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot access records');
    return this.documentsService.listRecords(
      { creator_id: user.userId, status },
      parsePagination(page, page_size),
    );
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
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot access records');
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
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot access transfer packages');
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
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot access transfer packages');
    const pagination = parsePagination(page, page_size);
    if (!isAdmin(user) && !hasCapability(user, Capability.ARCHIVE_RECEIVE)) {
      return this.documentsService.listTransferPackages(
        { record_id, status, submitter_id: user.userId },
        pagination,
      );
    }
    return this.documentsService.listTransferPackages(
      { record_id, status, submitter_id },
      pagination,
    );
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
    if (isAdmin(user)) {
      throw new ForbiddenException('ADMIN cannot run retention eligibility checks');
    }

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

    const { decision: permCheck } = await this.checkDocumentPermission(
      parsed.data.document_id,
      user,
      PermissionAction.DISPOSE,
    );

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

    const { decision: permCheck } = await this.checkDocumentPermission(
      parsed.data.document_id,
      user,
      PermissionAction.DISPOSE,
    );

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

  private async checkDocumentPermission(
    documentId: string,
    user: AuthContext,
    action: PermissionAction,
    taskId?: string,
  ) {
    const document = await this.documentsService.getDocument(documentId);
    const decision = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: 'DOCUMENT',
      resource_id: documentId,
      action,
      task_id: taskId,
      owner_id: document.owner_id,
      creator_id: document.creator_id,
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    return { document, decision };
  }

  @Post('holds')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place a retention hold' })
  async placeHold(
    @Body() body: { document_id: string; reason: string },
    @CurrentUser() user?: AuthContext,
  ) {
    const operator = this.requireRetentionEmployee(user);

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
      placed_by: operator.userId,
    });
  }

  @Post('holds/:id/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release a retention hold' })
  async releaseHold(@Param('id') holdId: string, @CurrentUser() user?: AuthContext) {
    const operator = this.requireRetentionEmployee(user);
    return this.documentsService.releaseRetentionHold(holdId, operator.userId);
  }

  @Get('holds')
  @ApiOperation({ summary: 'List retention holds' })
  async listHolds(
    @Query('document_id') document_id?: string,
    @Query('released') released?: string,
    @CurrentUser() user?: AuthContext,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ) {
    const operator = this.requireRetentionEmployee(user);
    return this.documentsService.listRetentionHolds(
      {
        document_id,
        released: released === 'true' ? true : released === 'false' ? false : undefined,
        placed_by: operator.userId,
      },
      parsePagination(page, page_size),
    );
  }

  @Get('approvals')
  @ApiOperation({ summary: 'List disposal approvals' })
  async listApprovals(
    @Query('document_id') document_id?: string,
    @CurrentUser() user?: AuthContext,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ) {
    const operator = this.requireRetentionEmployee(user);
    return this.documentsService.listDisposalApprovals(
      { document_id, approver_id: operator.userId },
      parsePagination(page, page_size),
    );
  }

  private requireRetentionEmployee(user?: AuthContext): AuthContext {
    if (!user) throw new ForbiddenException('Authentication required');
    if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot manage retention state');
    return user;
  }
}
