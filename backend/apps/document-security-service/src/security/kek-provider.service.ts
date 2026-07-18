import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export interface WrappedDekPayload {
  iv: string;
  auth_tag: string;
  ciphertext: string;
}

export interface KekProvider {
  getActiveVersion(): number;
  wrapDek(plainDek: Buffer): { kekVersion: number; encryptedDek: string };
  unwrapDek(kekVersion: number, encryptedDek: string): Buffer;
}

@Injectable()
export class EnvKekProvider implements KekProvider {
  constructor(private readonly configService: ConfigService) {}

  getActiveVersion(): number {
    return Number(this.configService.get<number | string>('DOCUMENT_ACTIVE_KEK_VERSION') || 1);
  }

  wrapDek(plainDek: Buffer): { kekVersion: number; encryptedDek: string } {
    const kekVersion = this.getActiveVersion();
    const kek = this.getVersionedKek(kekVersion);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', kek, iv);
    const ciphertext = Buffer.concat([cipher.update(plainDek), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      kekVersion,
      encryptedDek: JSON.stringify({
        iv: iv.toString('base64'),
        auth_tag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      } satisfies WrappedDekPayload),
    };
  }

  unwrapDek(kekVersion: number, encryptedDek: string): Buffer {
    const kek = this.getVersionedKek(kekVersion);
    const payload = parseWrappedDek(encryptedDek);
    const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.auth_tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
  }

  private getVersionedKek(version: number): Buffer {
    const configured = this.configService.get<string>(`DOCUMENT_KEK_V${version}`);
    if (!configured) {
      throw new InternalServerErrorException(`Missing configured KEK version ${version}`);
    }

    // Derive a stable 256-bit KEK from the configured secret text so local placeholder
    // values still become valid key material without committing binary secrets.
    return createHash('sha256').update(configured, 'utf8').digest();
  }
}

function parseWrappedDek(value: string): WrappedDekPayload {
  const parsed = JSON.parse(value) as Partial<WrappedDekPayload>;
  if (!parsed.iv || !parsed.auth_tag || !parsed.ciphertext) {
    throw new InternalServerErrorException('Stored wrapped DEK is malformed');
  }
  return {
    iv: parsed.iv,
    auth_tag: parsed.auth_tag,
    ciphertext: parsed.ciphertext,
  };
}
