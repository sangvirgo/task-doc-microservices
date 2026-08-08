import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  createPaginationMeta,
  PaginatedResponse,
  PaginationQuery,
  toPrismaPagination,
} from '@c17/contracts';

import { DocumentSecurityPrismaService } from '../prisma/document-security-prisma.service';
import { ClamavService } from './clamav.service';
import {
  DocumentSignatureService,
  type DocumentSignaturePayload,
} from './document-signature.service';
import { EnvKekProvider } from './kek-provider.service';
import { MinioStorageService } from './minio-storage.service';
import { PreviewRenderer, type PreviewRenderRequest } from './preview/preview-renderer.service';

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
  encrypted_dek: string;
  created_at: string;
}

export interface UploadPipelineResult {
  id: string;
  document_id: string;
  version: number;
  object_key: string;
  checksum: string;
  signature: string;
  encrypted_dek: string;
  kek_version: number;
  file_size: number;
  mime_type: string;
  scan_status: string;
}

export interface DecryptedDownloadArtifact {
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export interface PreviewPreparationResult {
  preview_id: string;
  page_count: number;
  mime_type: 'image/png';
  expires_at: string;
}

export interface PreviewPageArtifact {
  bytes: Buffer;
  mime_type: 'image/png';
}

interface StoredPreview {
  expiresAt: number;
  pages: Buffer[];
}

const DEFAULT_PAGINATION: PaginationQuery = { page: 1, page_size: 20 };

interface EncryptionMaterial {
  checksum: string;
  objectKey: string;
  encryptedDek: string;
  kekVersion: number;
  iv: string;
  authTag: string;
  signature: string;
}

@Injectable()
export class SecurityPipelineService {
  private readonly previews = new Map<string, StoredPreview>();

  constructor(
    private readonly prisma: DocumentSecurityPrismaService,
    private readonly clamavService: ClamavService,
    private readonly storageService: MinioStorageService,
    private readonly kekProvider: EnvKekProvider,
    private readonly signatureService: DocumentSignatureService,
    private readonly previewRenderer: PreviewRenderer = new PreviewRenderer(),
  ) {}

  async processUploadStream(data: {
    document_id: string;
    version: number;
    file_size: number;
    mime_type: string;
    stream: Readable;
  }): Promise<UploadPipelineResult> {
    await this.assertVersionAvailable(data.document_id, data.version);

    const tmpDir =
      process.env.DOCUMENT_SECURITY_TMP_DIR || join(tmpdir(), 'c17-document-security-uploads');
    await mkdir(tmpDir, { recursive: true });

    const plaintextPath = join(tmpDir, `${randomUUID()}.plaintext`);
    const ciphertextPath = join(tmpDir, `${randomUUID()}.ciphertext`);
    const writeStream = createWriteStream(plaintextPath);

    try {
      await pipeline(data.stream, writeStream);

      const fileStat = await stat(plaintextPath);
      if (fileStat.size !== data.file_size) {
        throw new BadRequestException('Declared file size does not match received upload');
      }

      const scan = await this.clamavService.scanFile(plaintextPath);
      if (!scan.clean) {
        throw new BadRequestException('Uploaded file failed malware scan');
      }

      const encryption = await this.encryptPlaintextFile({
        plaintextPath,
        ciphertextPath,
        documentId: data.document_id,
        version: data.version,
        fileSize: data.file_size,
        mimeType: data.mime_type,
      });

      let recordId = '';

      try {
        const ciphertextStats = await stat(ciphertextPath);
        await this.storageService.putObject(
          encryption.objectKey,
          ciphertextPath,
          ciphertextStats.size,
        );

        const record = await this.prisma.encryptionRecord.create({
          data: {
            document_id: data.document_id,
            version: data.version,
            object_key: encryption.objectKey,
            checksum: encryption.checksum,
            signature: encryption.signature,
            kek_version: encryption.kekVersion,
            encrypted_dek: encryption.encryptedDek,
            iv: encryption.iv,
            auth_tag: encryption.authTag,
            file_size: data.file_size,
            mime_type: data.mime_type,
            scan_status: 'CLEAN',
            scan_result: 'OK',
          },
        });
        recordId = record.id;

        return {
          id: recordId,
          document_id: record.document_id,
          version: record.version,
          object_key: record.object_key,
          checksum: record.checksum,
          signature: record.signature || '',
          encrypted_dek: record.encrypted_dek,
          kek_version: record.kek_version,
          file_size: record.file_size,
          mime_type: record.mime_type,
          scan_status: record.scan_status,
        };
      } catch (error) {
        await this.storageService.removeObject(encryption.objectKey).catch(() => undefined);
        if (recordId) {
          await this.prisma.encryptionRecord
            .delete({ where: { id: recordId } })
            .catch(() => undefined);
        }
        throw error;
      }
    } finally {
      await rm(plaintextPath, { force: true }).catch(() => undefined);
      await rm(ciphertextPath, { force: true }).catch(() => undefined);
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
    await this.assertVersionAvailable(data.document_id, data.version);

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
        kek_version: data.kek_version || this.kekProvider.getActiveVersion(),
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
    if (record.scan_status !== 'CLEAN') {
      throw new BadRequestException('Document must pass scan before signing');
    }

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

  async listRecords(
    document_id?: string,
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<EncryptionRecordDto>> {
    const where = document_id ? { document_id } : undefined;
    const [total, records] = await Promise.all([
      this.prisma.encryptionRecord.count({ where }),
      this.prisma.encryptionRecord.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...toPrismaPagination(pagination),
      }),
    ]);
    return {
      items: records.map((record) => this.toDto(record)),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
  }

  async getActiveKekVersion(): Promise<number> {
    const kek = await this.prisma.kekVersion.findFirst({
      where: { active: true },
      orderBy: { id: 'desc' },
    });
    return kek?.id ?? this.kekProvider.getActiveVersion();
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

  async decryptDocumentVersionToBuffer(document_id: string, version: number): Promise<Buffer> {
    const record = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id, version } },
    });
    if (!record) throw new NotFoundException('Encryption record not found');
    if (!record.signature) {
      throw new InternalServerErrorException('Missing integrity signature');
    }

    const signaturePayload = this.buildSignaturePayload({
      documentId: record.document_id,
      version: record.version,
      objectKey: record.object_key,
      checksum: record.checksum,
      encryptedDek: record.encrypted_dek,
      iv: record.iv,
      authTag: record.auth_tag,
      kekVersion: record.kek_version,
      fileSize: record.file_size,
      mimeType: record.mime_type,
    });

    if (!this.signatureService.verify(signaturePayload, record.signature)) {
      throw new ServiceUnavailableException('Stored document signature is invalid');
    }

    const encryptedStream = await this.storageService.getObject(record.object_key);
    const chunks: Buffer[] = [];
    encryptedStream.on('data', (chunk) => {
      chunks.push(toBufferChunk(chunk));
    });

    await new Promise<void>((resolve, reject) => {
      encryptedStream.once('end', () => resolve());
      encryptedStream.once('error', reject);
    });

    const ciphertext = Buffer.concat(chunks);
    const dek = this.kekProvider.unwrapDek(record.kek_version, record.encrypted_dek);
    const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const checksum = createHash('sha256').update(plaintext).digest('hex');
    if (checksum !== record.checksum) {
      throw new ServiceUnavailableException('Stored document checksum is invalid');
    }

    return plaintext;
  }

  async preparePreview(data: {
    document_id: string;
    version: number;
    actor_label: string;
    session_id: string;
  }): Promise<PreviewPreparationResult> {
    this.removeExpiredPreviews();
    const record = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id: data.document_id, version: data.version } },
    });
    if (!record) throw new NotFoundException('Encryption record not found');
    if (record.scan_status === 'INFECTED') {
      throw new BadRequestException('Document is not available for preview');
    }

    const content = await this.decryptDocumentVersionToBuffer(data.document_id, data.version);
    const rendered = await this.previewRenderer.render({
      content,
      mimeType: record.mime_type,
      watermark: {
        actorLabel: data.actor_label,
        documentId: data.document_id,
        version: data.version,
        sessionId: data.session_id,
        renderedAt: new Date(),
        page: 1,
      },
    } satisfies PreviewRenderRequest);
    const previewId = randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    this.previews.set(previewId, { expiresAt, pages: rendered.pages });

    return {
      preview_id: previewId,
      page_count: rendered.pages.length,
      mime_type: rendered.mimeType,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  getPreviewPage(previewId: string, page: number): PreviewPageArtifact {
    this.removeExpiredPreviews();
    const preview = this.previews.get(previewId);
    if (!preview) throw new ForbiddenException('Preview session is expired or revoked');
    const pageBytes = preview.pages[page - 1];
    if (!pageBytes) throw new NotFoundException('Preview page not found');
    return { bytes: pageBytes, mime_type: 'image/png' };
  }

  revokePreview(previewId: string): void {
    this.previews.delete(previewId);
  }

  private removeExpiredPreviews(): void {
    const now = Date.now();
    for (const [previewId, preview] of this.previews) {
      if (preview.expiresAt <= now) this.previews.delete(previewId);
    }
  }

  async preparePlaintextDownload(
    document_id: string,
    version: number,
  ): Promise<DecryptedDownloadArtifact> {
    const record = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id, version } },
    });
    if (!record) throw new NotFoundException('Encryption record not found');
    if (!record.signature) {
      throw new InternalServerErrorException('Missing integrity signature');
    }

    const signaturePayload = this.buildSignaturePayload({
      documentId: record.document_id,
      version: record.version,
      objectKey: record.object_key,
      checksum: record.checksum,
      encryptedDek: record.encrypted_dek,
      iv: record.iv,
      authTag: record.auth_tag,
      kekVersion: record.kek_version,
      fileSize: record.file_size,
      mimeType: record.mime_type,
    });

    if (!this.signatureService.verify(signaturePayload, record.signature)) {
      throw new ServiceUnavailableException('Stored document signature is invalid');
    }

    const tmpDir =
      process.env.DOCUMENT_SECURITY_TMP_DIR || join(tmpdir(), 'c17-document-security-uploads');
    await mkdir(tmpDir, { recursive: true });

    const plaintextPath = join(tmpDir, `${randomUUID()}.download`);
    const encryptedStream = await this.storageService.getObject(record.object_key);
    const dek = this.kekProvider.unwrapDek(record.kek_version, record.encrypted_dek);
    const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64'));
    const hash = createHash('sha256');

    decipher.on('data', (chunk: Buffer | string) => {
      hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    try {
      await pipeline(encryptedStream, decipher, createWriteStream(plaintextPath));
      const checksum = hash.digest('hex');
      if (checksum !== record.checksum) {
        throw new ServiceUnavailableException('Stored document checksum is invalid');
      }

      return {
        filePath: plaintextPath,
        fileSize: record.file_size,
        mimeType: record.mime_type,
      };
    } catch (error) {
      await rm(plaintextPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async assertVersionAvailable(documentId: string, version: number): Promise<void> {
    const existing = await this.prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id: documentId, version } },
    });
    if (existing) {
      throw new BadRequestException('Encryption record already exists for this version');
    }
  }

  private async encryptPlaintextFile(data: {
    plaintextPath: string;
    ciphertextPath: string;
    documentId: string;
    version: number;
    fileSize: number;
    mimeType: string;
  }): Promise<EncryptionMaterial> {
    const checksum = await this.computeChecksum(data.plaintextPath);
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);

    await pipeline(
      createReadStream(data.plaintextPath),
      cipher,
      createWriteStream(data.ciphertextPath),
    );

    const authTag = cipher.getAuthTag();
    const wrappedDek = this.kekProvider.wrapDek(dek);
    const objectKey = `documents/${data.documentId}/versions/${data.version}/${randomUUID()}.bin`;
    const signaturePayload = this.buildSignaturePayload({
      documentId: data.documentId,
      version: data.version,
      objectKey,
      checksum,
      encryptedDek: wrappedDek.encryptedDek,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      kekVersion: wrappedDek.kekVersion,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
    });

    return {
      checksum,
      objectKey,
      encryptedDek: wrappedDek.encryptedDek,
      kekVersion: wrappedDek.kekVersion,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      signature: this.signatureService.sign(signaturePayload),
    };
  }

  private async computeChecksum(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: Buffer | string) => {
      hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    await new Promise<void>((resolve, reject) => {
      stream.once('end', () => resolve());
      stream.once('error', reject);
    });

    return hash.digest('hex');
  }

  private buildSignaturePayload(data: {
    documentId: string;
    version: number;
    objectKey: string;
    checksum: string;
    encryptedDek: string;
    iv: string;
    authTag: string;
    kekVersion: number;
    fileSize: number;
    mimeType: string;
  }): DocumentSignaturePayload {
    return {
      document_id: data.documentId,
      version: data.version,
      object_key: data.objectKey,
      checksum: data.checksum,
      encrypted_dek: data.encryptedDek,
      iv: data.iv,
      auth_tag: data.authTag,
      kek_version: data.kekVersion,
      file_size: data.fileSize,
      mime_type: data.mimeType,
    };
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
    encrypted_dek: string;
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
      encrypted_dek: record.encrypted_dek,
      created_at: record.created_at.toISOString(),
    };
  }
}

function toBufferChunk(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk);
  throw new InternalServerErrorException('MinIO returned a non-buffer chunk');
}
