import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DocumentSecurityPrismaService } from '../prisma/document-security-prisma.service';
import { createWriteStream } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';

export interface EncryptionRecordDto {
  id: string;
  document_id: string;
  version: number;
  object_key: string;
  checksum: string;
  signature: string | null;
  kek_version: number;
  scan_status: string;
  scan_result: string | null;
  file_size: number;
  mime_type: string;
  created_at: string;
}

@Injectable()
export class SecurityPipelineService {
  constructor(private readonly prisma: DocumentSecurityPrismaService) {}

  async processUploadStream(data: {
    document_id: string;
    version: number;
    file_size: number;
    mime_type: string;
    stream: Readable;
  }): Promise<EncryptionRecordDto> {
    const existing = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id: data.document_id, version: data.version } },
    });
    if (existing)
      throw new BadRequestException('Encryption record already exists for this version');

    const tmpDir =
      process.env.DOCUMENT_SECURITY_TMP_DIR || join(tmpdir(), 'c17-document-security-uploads');
    await mkdir(tmpDir, { recursive: true });

    const tempPath = join(tmpDir, `${randomUUID()}.upload`);
    const hash = createHash('sha256');
    const writeStream = createWriteStream(tempPath);

    data.stream.on('data', (chunk: Buffer | string) => {
      hash.update(chunk);
    });

    try {
      await pipeline(data.stream, writeStream);

      const record = await this.prisma.encryptionRecord.create({
        data: {
          document_id: data.document_id,
          version: data.version,
          object_key: `pending/${randomUUID()}`,
          checksum: hash.digest('hex'),
          encrypted_dek: randomBytes(32).toString('base64'),
          iv: randomBytes(12).toString('base64'),
          auth_tag: randomBytes(16).toString('base64'),
          file_size: data.file_size,
          mime_type: data.mime_type,
          kek_version: 1,
          scan_status: 'PENDING',
        },
      });

      return this.toDto(record);
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  async processDocument(data: {
    document_id: string;
    version: number;
    object_key: string;
    checksum: string;
    encrypted_dek: string;
    iv: string;
    auth_tag: string;
    file_size: number;
    mime_type: string;
    kek_version?: number;
  }): Promise<EncryptionRecordDto> {
    const existing = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id: data.document_id, version: data.version } },
    });
    if (existing)
      throw new BadRequestException('Encryption record already exists for this version');

    const record = await this.prisma.encryptionRecord.create({
      data: {
        document_id: data.document_id,
        version: data.version,
        object_key: data.object_key,
        checksum: data.checksum,
        encrypted_dek: data.encrypted_dek,
        iv: data.iv,
        auth_tag: data.auth_tag,
        file_size: data.file_size,
        mime_type: data.mime_type,
        kek_version: data.kek_version || 1,
        scan_status: 'PENDING',
      },
    });
    return this.toDto(record);
  }

  async updateScanResult(
    document_id: string,
    version: number,
    scan_status: string,
    scan_result?: string,
  ): Promise<EncryptionRecordDto> {
    const record = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id, version } },
    });
    if (!record) throw new NotFoundException('Encryption record not found');

    const updated = await this.prisma.encryptionRecord.update({
      where: { document_id_version: { document_id, version } },
      data: { scan_status, scan_result: scan_result || null },
    });
    return this.toDto(updated);
  }

  async signDocument(
    document_id: string,
    version: number,
    signature: string,
  ): Promise<EncryptionRecordDto> {
    const record = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id, version } },
    });
    if (!record) throw new NotFoundException('Encryption record not found');
    if (record.scan_status !== 'CLEAN')
      throw new BadRequestException('Document must pass scan before signing');

    const updated = await this.prisma.encryptionRecord.update({
      where: { document_id_version: { document_id, version } },
      data: { signature },
    });
    return this.toDto(updated);
  }

  async getRecord(document_id: string, version: number): Promise<EncryptionRecordDto> {
    const record = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id, version } },
    });
    if (!record) throw new NotFoundException('Encryption record not found');
    return this.toDto(record);
  }

  async listRecords(document_id?: string): Promise<EncryptionRecordDto[]> {
    const records = await this.prisma.encryptionRecord.findMany({
      where: document_id ? { document_id } : undefined,
      orderBy: { created_at: 'desc' },
    });
    return records.map((r) => this.toDto(r));
  }

  async getActiveKekVersion(): Promise<number> {
    const kek = await this.prisma.kekVersion.findFirst({
      where: { active: true },
      orderBy: { id: 'desc' },
    });
    return kek?.id ?? 1;
  }

  async rotateKek(): Promise<{ id: number }> {
    await this.prisma.kekVersion.updateMany({
      where: { active: true },
      data: { active: false },
    });
    const newKek = await this.prisma.kekVersion.create({
      data: { active: true },
    });
    return { id: newKek.id };
  }

  private toDto(record: {
    id: string;
    document_id: string;
    version: number;
    object_key: string;
    checksum: string;
    signature: string | null;
    kek_version: number;
    scan_status: string;
    scan_result: string | null;
    file_size: number;
    mime_type: string;
    created_at: Date;
  }): EncryptionRecordDto {
    return {
      id: record.id,
      document_id: record.document_id,
      version: record.version,
      object_key: record.object_key,
      checksum: record.checksum,
      signature: record.signature,
      kek_version: record.kek_version,
      scan_status: record.scan_status,
      scan_result: record.scan_result,
      file_size: record.file_size,
      mime_type: record.mime_type,
      created_at: record.created_at.toISOString(),
    };
  }
}
