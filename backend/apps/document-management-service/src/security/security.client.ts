import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';

export interface SecurityProcessResult {
  id: string;
  document_id: string;
  version: number;
  scan_status: string;
  signed: boolean;
}

export interface SecurityUploadResult {
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

export interface SecurityPreviewResult {
  preview_id: string;
  page_count: number;
  mime_type: 'image/png';
  expires_at: string;
}

export interface SecurityPreviewPage {
  bytes: Buffer;
  mime_type: 'image/png';
}

/**
 * HTTP client for Document Security Service.
 * Called when a new document version is uploaded to run it through the security pipeline.
 * Best-effort: security processing failures are logged but don't block the version creation.
 */
@Injectable()
export class SecurityClient {
  private readonly logger = new Logger(SecurityClient.name);
  private readonly securityServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.securityServiceUrl =
      this.configService.get<string>('DOCUMENT_SECURITY_URL') || 'http://localhost:3005';
    this.timeoutMs = this.configService.get<number>('SECURITY_TIMEOUT_MS') || 5000;
  }

  async processDocument(params: {
    document_id: string;
    version: number;
    object_key: string;
    checksum: string;
    encrypted_dek: string;
    file_size: number;
    mime_type: string;
    kek_version?: number;
  }): Promise<SecurityProcessResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.securityServiceUrl}/security/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: params.document_id,
          version: params.version,
          object_key: params.object_key,
          checksum: params.checksum,
          encrypted_dek: params.encrypted_dek,
          iv: 'placeholder-iv', // Placeholder: real IV comes from client-side encryption
          auth_tag: 'placeholder-tag', // Placeholder: real auth tag comes from client-side encryption
          file_size: params.file_size,
          mime_type: params.mime_type,
          kek_version: params.kek_version,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Security processing failed: ${response.status}`);
        return null;
      }

      return (await response.json()) as SecurityProcessResult;
    } catch (error) {
      this.logger.warn(
        `Security client error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async processUpload(params: {
    document_id: string;
    version: number;
    file_path: string;
    file_size: number;
    mime_type: string;
    original_filename: string;
  }): Promise<SecurityUploadResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.securityServiceUrl}/security/uploads/process`, {
        method: 'POST',
        headers: {
          'content-type': params.mime_type,
          'content-length': String(params.file_size),
          'x-document-id': params.document_id,
          'x-document-version': String(params.version),
          'x-document-file-size': String(params.file_size),
          'x-document-original-filename': params.original_filename,
        },
        body: createReadStream(params.file_path) as unknown as RequestInit['body'],
        duplex: 'half',
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Security upload processing failed: ${response.status}`);
        return null;
      }

      return (await response.json()) as SecurityUploadResult;
    } catch (error) {
      this.logger.warn(
        `Security upload client error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async redeemDownload(params: {
    document_id: string;
    version: number;
    correlation_id?: string;
  }): Promise<Response | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {};
      if (params.correlation_id) {
        headers['x-correlation-id'] = params.correlation_id;
      }

      const response = await fetch(
        `${this.securityServiceUrl}/security/${params.document_id}/versions/${params.version}/plaintext`,
        {
          method: 'GET',
          headers,
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        this.logger.warn(`Security download processing failed: ${response.status}`);
        return null;
      }

      return response;
    } catch (error) {
      this.logger.warn(
        `Security download client error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async preparePreview(params: {
    document_id: string;
    version: number;
    actor_label: string;
    session_id: string;
  }): Promise<SecurityPreviewResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.securityServiceUrl}/security/${params.document_id}/versions/${params.version}/preview/prepare`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            actor_label: params.actor_label,
            session_id: params.session_id,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        this.logger.warn(`Security preview preparation failed: ${response.status}`);
        return null;
      }
      return (await response.json()) as SecurityPreviewResult;
    } catch (error) {
      this.logger.warn(
        `Security preview preparation error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getPreviewPage(previewId: string, page: number): Promise<SecurityPreviewPage | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.securityServiceUrl}/security/preview/${previewId}/pages/${page}`,
        { method: 'GET', signal: controller.signal },
      );
      if (!response.ok) {
        this.logger.warn(`Security preview page failed: ${response.status}`);
        return null;
      }
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        mime_type: 'image/png',
      };
    } catch (error) {
      this.logger.warn(
        `Security preview page error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async revokePreview(previewId: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      await fetch(`${this.securityServiceUrl}/security/preview/${previewId}/revoke`, {
        method: 'POST',
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.warn(
        `Security preview revoke error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
