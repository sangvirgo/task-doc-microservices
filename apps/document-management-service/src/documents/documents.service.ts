import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client-document';
import { randomUUID } from 'crypto';

import { EventType, Producer } from '@c17/contracts';

import { DocumentPrismaService } from '../prisma/document-prisma.service';

export interface DocumentDto {
  id: string;
  title: string;
  document_type: string;
  owner_id: string;
  creator_id: string;
  security_level: string;
  status: string;
  current_version: number;
  retention_policy: string | null;
  archive_status: string | null;
  record_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersionDto {
  id: string;
  document_id: string;
  version: number;
  signature: string | null;
  file_size: number;
  mime_type: string;
  created_by: string;
  created_at: string;
}

export interface RecordDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  creator_id: string;
  sealed_at: string | null;
  created_at: string;
  updated_at: string;
  entries: RecordEntryDto[];
}

export interface RecordEntryDto {
  id: string;
  record_id: string;
  document_id: string;
  document_version_id: string;
  added_at: string;
}

export interface DownloadTicketDto {
  id: string;
  document_id: string;
  version: number;
  actor_id: string;
  expires_at: string;
}

export interface DownloadTicketRecord {
  id: string;
  document_id: string;
  version: number;
  actor_id: string;
  expires_at: Date;
  used_at: Date | null;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: DocumentPrismaService) {}

  async createDocument(data: {
    id?: string;
    title: string;
    document_type: string;
    owner_id: string;
    creator_id: string;
    security_level?: string;
    retention_policy?: string;
    correlation_id?: string;
  }): Promise<DocumentDto> {
    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          id: data.id,
          title: data.title,
          document_type: data.document_type,
          owner_id: data.owner_id,
          creator_id: data.creator_id,
          security_level: data.security_level || 'INTERNAL',
          retention_policy: data.retention_policy || null,
        },
      });

      if (data.correlation_id) {
        await tx.outboxEvent.create({
          data: {
            document_id: created.id,
            event_id: randomUUID(),
            event_type: EventType.DOCUMENT_CREATED,
            correlation_id: data.correlation_id,
            producer: Producer.DOCUMENT_MANAGEMENT_SERVICE,
            actor_id: data.creator_id,
            resource_type: 'DOCUMENT',
            resource_id: created.id,
            payload: {
              title: created.title,
              document_type: created.document_type,
              owner_id: created.owner_id,
              version: created.current_version,
            },
            occurred_at: new Date(),
          },
        });
      }

      return created;
    });
    return this.toDto(document);
  }

  async getDocument(id: string): Promise<DocumentDto> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException('Document not found');
    return this.toDto(document);
  }

  async listDocuments(filters?: {
    owner_id?: string;
    creator_id?: string;
    status?: string;
  }): Promise<DocumentDto[]> {
    const documents = await this.prisma.document.findMany({ where: filters });
    return documents.map((d) => this.toDto(d));
  }

  async createUploadedDocument(data: {
    document_id: string;
    title: string;
    document_type: string;
    owner_id: string;
    creator_id: string;
    security_level?: string;
    retention_policy?: string;
    object_key: string;
    checksum: string;
    signature?: string;
    encrypted_dek: string;
    file_size: number;
    mime_type: string;
    kek_version?: number;
    correlation_id?: string;
  }): Promise<{ document: DocumentDto; version: DocumentVersionDto }> {
    const { document, version } = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          id: data.document_id,
          title: data.title,
          document_type: data.document_type,
          owner_id: data.owner_id,
          creator_id: data.creator_id,
          security_level: data.security_level || 'INTERNAL',
          retention_policy: data.retention_policy || null,
          current_version: 1,
        },
      });
      const version = await tx.documentVersion.create({
        data: {
          document_id: data.document_id,
          version: 1,
          object_key: data.object_key,
          checksum: data.checksum,
          signature: data.signature || null,
          encrypted_dek: data.encrypted_dek,
          file_size: data.file_size,
          mime_type: data.mime_type,
          created_by: data.creator_id,
          kek_version: data.kek_version || 1,
        },
      });

      if (data.correlation_id) {
        await tx.outboxEvent.create({
          data: {
            document_id: document.id,
            event_id: randomUUID(),
            event_type: EventType.DOCUMENT_CREATED,
            correlation_id: data.correlation_id,
            producer: Producer.DOCUMENT_MANAGEMENT_SERVICE,
            actor_id: data.creator_id,
            resource_type: 'DOCUMENT',
            resource_id: document.id,
            payload: {
              title: document.title,
              document_type: document.document_type,
              owner_id: document.owner_id,
              version: version.version,
            },
            occurred_at: new Date(),
          },
        });
      }

      return { document, version };
    });

    return {
      document: this.toDto(document),
      version: this.versionToDto(version),
    };
  }

  async createDocumentVersion(data: {
    document_id: string;
    object_key: string;
    checksum: string;
    signature?: string;
    kek_version?: number;
    encrypted_dek: string;
    file_size: number;
    mime_type: string;
    created_by: string;
  }): Promise<DocumentVersionDto> {
    const document = await this.prisma.document.findUnique({ where: { id: data.document_id } });
    if (!document) throw new NotFoundException('Document not found');

    const nextVersion = document.current_version + 1;
    const version = await this.prisma.documentVersion.create({
      data: {
        document_id: data.document_id,
        version: nextVersion,
        object_key: data.object_key,
        checksum: data.checksum,
        signature: data.signature || null,
        kek_version: data.kek_version || 1,
        encrypted_dek: data.encrypted_dek,
        file_size: data.file_size,
        mime_type: data.mime_type,
        created_by: data.created_by,
      },
    });

    // Update document's current_version
    await this.prisma.document.update({
      where: { id: data.document_id },
      data: { current_version: nextVersion },
    });

    return this.versionToDto(version);
  }

  async getDocumentVersion(documentId: string, version: number): Promise<DocumentVersionDto> {
    const documentVersion = await this.prisma.documentVersion.findUnique({
      where: { document_id_version: { document_id: documentId, version } },
    });
    if (!documentVersion) throw new NotFoundException('Document version not found');
    return this.versionToDto(documentVersion);
  }

  async getDocumentVersions(documentId: string): Promise<DocumentVersionDto[]> {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');

    const versions = await this.prisma.documentVersion.findMany({
      where: { document_id: documentId },
      orderBy: { version: 'desc' },
    });
    return versions.map((v) => this.versionToDto(v));
  }

  async getDocumentPreview(documentId: string): Promise<{
    id: string;
    title: string;
    security_level: string;
    document_type: string;
  }> {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');

    return {
      id: document.id,
      title: document.title,
      security_level: document.security_level,
      document_type: document.document_type,
    };
  }

  async createDownloadTicket(data: {
    document_id: string;
    version: number;
    actor_id: string;
    expires_in_seconds: number;
    max_expires_at?: Date;
  }): Promise<DownloadTicketDto> {
    const documentVersion = await this.prisma.documentVersion.findUnique({
      where: { document_id_version: { document_id: data.document_id, version: data.version } },
    });
    if (!documentVersion) throw new NotFoundException('Document version not found');

    const requestedExpiry = new Date(Date.now() + data.expires_in_seconds * 1000);
    const expires_at =
      data.max_expires_at && data.max_expires_at.getTime() < requestedExpiry.getTime()
        ? data.max_expires_at
        : requestedExpiry;
    const ticket = await this.prisma.downloadTicket.create({
      data: {
        document_id: data.document_id,
        version: data.version,
        actor_id: data.actor_id,
        object_key: documentVersion.object_key,
        expires_at,
      },
    });

    return this.ticketToDto(ticket);
  }

  async getDownloadTicket(ticketId: string): Promise<DownloadTicketRecord> {
    const ticket = await this.prisma.downloadTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Download ticket not found');

    return {
      id: ticket.id,
      document_id: ticket.document_id,
      version: ticket.version,
      actor_id: ticket.actor_id,
      expires_at: ticket.expires_at,
      used_at: ticket.used_at,
    };
  }

  async markDownloadTicketUsed(ticketId: string): Promise<boolean> {
    const result = await this.prisma.downloadTicket.updateMany({
      where: { id: ticketId, used_at: null },
      data: { used_at: new Date() },
    });
    return result.count === 1;
  }

  async createRecord(data: {
    title: string;
    description?: string;
    creator_id: string;
  }): Promise<RecordDto> {
    const record = await this.prisma.record.create({
      data: {
        title: data.title,
        description: data.description || null,
        creator_id: data.creator_id,
        status: 'DRAFT',
      },
      include: { entries: true },
    });
    return this.recordToDto(record);
  }

  async getRecord(id: string): Promise<RecordDto> {
    const record = await this.prisma.record.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!record) throw new NotFoundException('Record not found');
    return this.recordToDto(record);
  }

  async listRecords(filters?: { creator_id?: string; status?: string }): Promise<RecordDto[]> {
    const records = await this.prisma.record.findMany({
      where: filters,
      include: { entries: true },
    });
    return records.map((r) => this.recordToDto(r));
  }

  async addDocumentToRecord(
    record_id: string,
    document_id: string,
    document_version_id: string,
  ): Promise<RecordEntryDto> {
    const record = await this.prisma.record.findUnique({ where: { id: record_id } });
    if (!record) throw new NotFoundException('Record not found');
    if (record.status === 'SEALED') throw new BadRequestException('Record is sealed');

    const entry = await this.prisma.recordEntry.create({
      data: {
        record_id,
        document_id,
        document_version_id,
      },
    });
    return this.entryToDto(entry);
  }

  async sealRecord(record_id: string): Promise<RecordDto> {
    const record = await this.prisma.record.findUnique({
      where: { id: record_id },
      include: { entries: true },
    });
    if (!record) throw new NotFoundException('Record not found');
    if (record.entries.length === 0) throw new BadRequestException('Cannot seal empty record');

    const updated = await this.prisma.record.update({
      where: { id: record_id },
      data: { status: 'SEALED', sealed_at: new Date() },
      include: { entries: true },
    });
    return this.recordToDto(updated);
  }

  async createTransferPackage(data: {
    record_id: string;
    submitter_id: string;
    manifest?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<{
    id: string;
    record_id: string;
    status: string;
    submitted_at: string | null;
  }> {
    const record = await this.prisma.record.findUnique({ where: { id: data.record_id } });
    if (!record) throw new NotFoundException('Record not found');

    const pkg = await this.prisma.transferPackage.create({
      data: {
        record_id: data.record_id,
        submitter_id: data.submitter_id,
        status: 'DRAFT',
        manifest: data.manifest === undefined ? undefined : toJsonValue(data.manifest),
        metadata: data.metadata === undefined ? undefined : toJsonValue(data.metadata),
      },
    });

    return {
      id: pkg.id,
      record_id: pkg.record_id,
      status: pkg.status,
      submitted_at: pkg.submitted_at?.toISOString() ?? null,
    };
  }

  async submitTransferPackage(package_id: string): Promise<{
    id: string;
    status: string;
    submitted_at: string;
  }> {
    const pkg = await this.prisma.transferPackage.findUnique({ where: { id: package_id } });
    if (!pkg) throw new NotFoundException('Transfer package not found');
    if (pkg.status !== 'DRAFT') throw new BadRequestException('Package must be in DRAFT status');

    const updated = await this.prisma.transferPackage.update({
      where: { id: package_id },
      data: { status: 'SUBMITTED', submitted_at: new Date() },
    });

    return {
      id: updated.id,
      status: updated.status,
      submitted_at: updated.submitted_at!.toISOString(),
    };
  }

  async reviewTransferPackage(
    package_id: string,
    archivist_id: string,
    approved: boolean,
    rejection_reason?: string,
  ): Promise<{
    id: string;
    status: string;
    decided_at: string;
  }> {
    const pkg = await this.prisma.transferPackage.findUnique({ where: { id: package_id } });
    if (!pkg) throw new NotFoundException('Transfer package not found');
    if (pkg.status !== 'SUBMITTED')
      throw new BadRequestException('Package must be SUBMITTED for review');

    const newStatus = approved ? 'ACCEPTED' : 'REJECTED';
    const updated = await this.prisma.transferPackage.update({
      where: { id: package_id },
      data: {
        status: newStatus,
        archivist_id,
        rejection_reason: rejection_reason || null,
        decided_at: new Date(),
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      decided_at: updated.decided_at!.toISOString(),
    };
  }

  private toDto(document: {
    id: string;
    title: string;
    document_type: string;
    owner_id: string;
    creator_id: string;
    security_level: string;
    status: string;
    current_version: number;
    retention_policy: string | null;
    archive_status: string | null;
    record_id: string | null;
    created_at: Date;
    updated_at: Date;
  }): DocumentDto {
    return {
      id: document.id,
      title: document.title,
      document_type: document.document_type,
      owner_id: document.owner_id,
      creator_id: document.creator_id,
      security_level: document.security_level,
      status: document.status,
      current_version: document.current_version,
      retention_policy: document.retention_policy,
      archive_status: document.archive_status,
      record_id: document.record_id,
      created_at: document.created_at.toISOString(),
      updated_at: document.updated_at.toISOString(),
    };
  }

  private versionToDto(version: {
    id: string;
    document_id: string;
    version: number;
    object_key: string;
    signature: string | null;
    file_size: number;
    mime_type: string;
    created_by: string;
    created_at: Date;
  }): DocumentVersionDto {
    return {
      id: version.id,
      document_id: version.document_id,
      version: version.version,
      signature: version.signature,
      file_size: version.file_size,
      mime_type: version.mime_type,
      created_by: version.created_by,
      created_at: version.created_at.toISOString(),
    };
  }

  private ticketToDto(ticket: {
    id: string;
    document_id: string;
    version: number;
    actor_id: string;
    expires_at: Date;
    object_key: string;
  }): DownloadTicketDto {
    return {
      id: ticket.id,
      document_id: ticket.document_id,
      version: ticket.version,
      actor_id: ticket.actor_id,
      expires_at: ticket.expires_at.toISOString(),
    };
  }

  private recordToDto(record: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    creator_id: string;
    sealed_at: Date | null;
    created_at: Date;
    updated_at: Date;
    entries: Array<{
      id: string;
      record_id: string;
      document_id: string;
      document_version_id: string;
      added_at: Date;
    }>;
  }): RecordDto {
    return {
      id: record.id,
      title: record.title,
      description: record.description,
      status: record.status,
      creator_id: record.creator_id,
      sealed_at: record.sealed_at?.toISOString() ?? null,
      created_at: record.created_at.toISOString(),
      updated_at: record.updated_at.toISOString(),
      entries: record.entries.map((e) => this.entryToDto(e)),
    };
  }

  private entryToDto(entry: {
    id: string;
    record_id: string;
    document_id: string;
    document_version_id: string;
    added_at: Date;
  }): RecordEntryDto {
    return {
      id: entry.id,
      record_id: entry.record_id,
      document_id: entry.document_id,
      document_version_id: entry.document_version_id,
      added_at: entry.added_at.toISOString(),
    };
  }
}

function toJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
