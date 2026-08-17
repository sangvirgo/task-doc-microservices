import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Request } from 'express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { rm } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { paginationQuerySchema } from '@c17/contracts';

import {
  SecurityPipelineService,
  DecryptedDownloadArtifact,
  EncryptionRecordDto,
  UploadPipelineResult,
} from './security-pipeline.service';

const processDocumentSchema = z.object({
  document_id: z.string().uuid(),
  version: z.number().int().positive(),
  object_key: z.string().min(1),
  checksum: z.string().min(1),
  encrypted_dek: z.string().min(1),
  iv: z.string().min(1),
  auth_tag: z.string().min(1),
  file_size: z.number().int().positive(),
  mime_type: z.string().min(1),
  kek_version: z.number().int().positive().optional(),
});

const scanResultSchema = z.object({
  scan_status: z.enum(['CLEAN', 'INFECTED', 'ERROR']),
  scan_result: z.string().optional(),
});

const signSchema = z.object({
  signature: z.string().min(1),
});

const uploadHeaderSchema = z.object({
  document_id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  file_size: z.coerce.number().int().positive(),
  mime_type: z.string().min(1),
});

const previewPrepareSchema = z.object({
  actor_label: z.string().min(1).max(320),
  session_id: z.string().uuid(),
  max_pages: z.coerce.number().int().positive().max(200).optional(),
});

const previewExtendSchema = z.object({
  start_page: z.coerce.number().int().positive(),
  end_page: z.coerce.number().int().positive(),
});

@ApiTags('security')
@Controller('security')
export class SecurityController {
  constructor(private readonly securityService: SecurityPipelineService) {}

  @Post('uploads/process')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Accept a streamed plaintext upload from Document Management' })
  async processUpload(@Req() req: Request): Promise<UploadPipelineResult> {
    const parsed = uploadHeaderSchema.safeParse({
      document_id: req.headers['x-document-id'],
      version: req.headers['x-document-version'],
      file_size: req.headers['x-document-file-size'] ?? req.headers['content-length'],
      mime_type: req.headers['content-type'],
    });
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    return this.securityService.processUploadStream({
      document_id: parsed.data.document_id,
      version: parsed.data.version,
      file_size: parsed.data.file_size,
      mime_type: parsed.data.mime_type,
      stream: req,
    });
  }

  @Post('process')
  @ApiOperation({ summary: 'Process a document through the security pipeline' })
  async processDocument(
    @Body() body: z.infer<typeof processDocumentSchema>,
  ): Promise<EncryptionRecordDto> {
    const parsed = processDocumentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.securityService.processDocument(parsed.data);
  }

  @Post(':documentId/versions/:version/scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update scan result for a document version' })
  async updateScan(
    @Param('documentId') documentId: string,
    @Param('version') version: string,
    @Body() body: z.infer<typeof scanResultSchema>,
  ): Promise<EncryptionRecordDto> {
    const parsed = scanResultSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) throw new BadRequestException('Invalid version number');
    return this.securityService.updateScanResult(
      documentId,
      versionNum,
      parsed.data.scan_status,
      parsed.data.scan_result,
    );
  }

  @Post(':documentId/versions/:version/sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign a document version (must be CLEAN)' })
  async signDocument(
    @Param('documentId') documentId: string,
    @Param('version') version: string,
    @Body() body: z.infer<typeof signSchema>,
  ): Promise<EncryptionRecordDto> {
    const parsed = signSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) throw new BadRequestException('Invalid version number');
    return this.securityService.signDocument(documentId, versionNum, parsed.data.signature);
  }

  @Get(':documentId/versions/:version')
  @ApiOperation({ summary: 'Get encryption record for a document version' })
  async getRecord(
    @Param('documentId') documentId: string,
    @Param('version') version: string,
  ): Promise<EncryptionRecordDto> {
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) throw new BadRequestException('Invalid version number');
    return this.securityService.getRecord(documentId, versionNum);
  }

  @Get(':documentId/versions/:version/plaintext')
  @ApiOperation({ summary: 'Stream verified plaintext for an encrypted document version' })
  async getPlaintext(
    @Param('documentId') documentId: string,
    @Param('version') version: string,
    @Res() res: Response,
  ): Promise<void> {
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) throw new BadRequestException('Invalid version number');

    const artifact = await this.securityService.preparePlaintextDownload(documentId, versionNum);
    await this.pipeArtifact(res, artifact);
  }

  @Post(':documentId/versions/:version/preview/prepare')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Prepare a short-lived server-rendered document preview' })
  async preparePreview(
    @Param('documentId') documentId: string,
    @Param('version') version: string,
    @Body() body: z.infer<typeof previewPrepareSchema>,
  ) {
    const parsed = previewPrepareSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const versionNum = parseInt(version, 10);
    if (isNaN(versionNum)) throw new BadRequestException('Invalid version number');

    return this.securityService.preparePreview({
      document_id: documentId,
      version: versionNum,
      actor_label: parsed.data.actor_label,
      session_id: parsed.data.session_id,
      max_pages: parsed.data.max_pages,
    });
  }

  @Post('preview/:previewId/pages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Render and append additional preview pages to an existing preview' })
  async extendPreview(
    @Param('previewId') previewId: string,
    @Body() body: z.infer<typeof previewExtendSchema>,
  ) {
    const parsed = previewExtendSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    return this.securityService.extendPreview(
      previewId,
      parsed.data.start_page,
      parsed.data.end_page,
    );
  }

  @Get('preview/:previewId/pages/:page')
  @ApiOperation({ summary: 'Return one internally prepared, watermarked preview page' })
  getPreviewPage(
    @Param('previewId') previewId: string,
    @Param('page') page: string,
    @Res() res: Response,
  ): void {
    const parsedPage = parseInt(page, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new BadRequestException('Invalid preview page number');
    }

    const artifact = this.securityService.getPreviewPage(previewId, parsedPage);
    res.setHeader('content-type', artifact.mime_type);
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('pragma', 'no-cache');
    res.setHeader('x-content-type-options', 'nosniff');
    res.status(HttpStatus.OK).send(artifact.bytes);
  }

  @Post('preview/:previewId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an internal preview handle' })
  revokePreview(@Param('previewId') previewId: string): void {
    this.securityService.revokePreview(previewId);
  }

  @Get('records')
  @ApiOperation({ summary: 'List encryption records' })
  async listRecords(
    @Query('document_id') document_id?: string,
    @Query('page') page?: string,
    @Query('page_size') page_size?: string,
  ): Promise<unknown> {
    const pagination = paginationQuerySchema.safeParse({ page, page_size });
    if (!pagination.success) throw new BadRequestException(pagination.error.issues);
    return this.securityService.listRecords(document_id, pagination.data);
  }

  @Get('kek/active')
  @ApiOperation({ summary: 'Get active KEK version' })
  async getActiveKek() {
    const version = await this.securityService.getActiveKekVersion();
    return { active_kek_version: version };
  }

  @Post('kek/rotate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate KEK (creates new version, deactivates old)' })
  async rotateKek() {
    return this.securityService.rotateKek();
  }

  private async pipeArtifact(res: Response, artifact: DecryptedDownloadArtifact): Promise<void> {
    res.setHeader('content-type', artifact.mimeType);
    res.setHeader('content-length', String(artifact.fileSize));
    res.status(HttpStatus.OK);

    try {
      await pipeline(createReadStream(artifact.filePath), res);
    } finally {
      await rm(artifact.filePath, { force: true }).catch(() => undefined);
    }
  }
}
