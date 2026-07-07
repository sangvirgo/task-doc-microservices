import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SecurityProcessResult {
  id: string;
  document_id: string;
  version: number;
  scan_status: string;
  signed: boolean;
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
}
