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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { SecurityPipelineService, EncryptionRecordDto } from './security-pipeline.service';

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

@ApiTags('security')
@Controller('security')
export class SecurityController {
  constructor(private readonly securityService: SecurityPipelineService) {}

  @Post('process')
  @ApiOperation({ summary: 'Process a document through the security pipeline' })
  async processDocument(@Body() body: z.infer<typeof processDocumentSchema>): Promise<EncryptionRecordDto> {
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
    return this.securityService.updateScanResult(documentId, versionNum, parsed.data.scan_status, parsed.data.scan_result);
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

  @Get('records')
  @ApiOperation({ summary: 'List encryption records' })
  async listRecords(@Query('document_id') document_id?: string): Promise<EncryptionRecordDto[]> {
    return this.securityService.listRecords(document_id);
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
}
