import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface DocumentSignaturePayload {
  document_id: string;
  version: number;
  object_key: string;
  checksum: string;
  encrypted_dek: string;
  iv: string;
  auth_tag: string;
  kek_version: number;
  file_size: number;
  mime_type: string;
}

@Injectable()
export class DocumentSignatureService {
  constructor(private readonly configService: ConfigService) {}

  sign(payload: DocumentSignaturePayload): string {
    return this.buildHmac(payload);
  }

  verify(payload: DocumentSignaturePayload, signature: string): boolean {
    return this.buildHmac(payload) === signature;
  }

  private buildHmac(payload: DocumentSignaturePayload): string {
    const key = this.configService.get<string>('DOCUMENT_SIGNATURE_KEY') || '';
    return createHmac('sha256', key).update(canonicalize(payload), 'utf8').digest('base64');
  }
}

function canonicalize(payload: DocumentSignaturePayload): string {
  return JSON.stringify({
    document_id: payload.document_id,
    version: payload.version,
    object_key: payload.object_key,
    checksum: payload.checksum,
    encrypted_dek: payload.encrypted_dek,
    iv: payload.iv,
    auth_tag: payload.auth_tag,
    kek_version: payload.kek_version,
    file_size: payload.file_size,
    mime_type: payload.mime_type,
  });
}
