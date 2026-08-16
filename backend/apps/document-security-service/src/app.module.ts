import { Module } from '@nestjs/common';
import { z } from 'zod';

import {
  AppConfigModule,
  baseEnvSchema,
  clamavEnvFragment,
  objectStorageEnvFragment,
} from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { SecurityController } from './security/security.controller';
import { SecurityPipelineService } from './security/security-pipeline.service';
import { DocumentSecurityPrismaService } from './prisma/document-security-prisma.service';
import { ClamavService } from './security/clamav.service';
import { MinioStorageService } from './security/minio-storage.service';
import { EnvKekProvider } from './security/kek-provider.service';
import { DocumentSignatureService } from './security/document-signature.service';
import { PreviewRenderer } from './security/preview/preview-renderer.service';

export const SERVICE = 'document-security-service';

/** Runs the security pipeline: scan, checksum, encrypt, sign, store. */
export const envSchema = baseEnvSchema
  .merge(objectStorageEnvFragment)
  .merge(clamavEnvFragment)
  .extend({
    DOCUMENT_SECURITY_DATABASE_URL: z.string().url(),
    MINIO_BUCKET: z.string().min(1).default('documents'),
    DOCUMENT_ACTIVE_KEK_VERSION: z.coerce.number().int().positive().default(1),
    DOCUMENT_KEK_V1: z.string().min(1),
    DOCUMENT_SIGNATURE_KEY: z.string().min(1),
    DOCUMENT_SECURITY_TMP_DIR: z.string().min(1).optional(),
    CLAMAV_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    PREVIEW_RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
    PREVIEW_MAX_INPUT_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
    PREVIEW_MAX_PAGES: z.coerce.number().int().positive().default(200),
    PREVIEW_MAX_DIMENSION: z.coerce.number().int().positive().default(2400),
    PREVIEW_TEMP_ROOT: z.string().min(1).optional(),
  });

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [SecurityController],
  providers: [
    DocumentSecurityPrismaService,
    SecurityPipelineService,
    ClamavService,
    MinioStorageService,
    EnvKekProvider,
    DocumentSignatureService,
    {
      provide: PreviewRenderer,
      useFactory: () =>
        new PreviewRenderer({
          tempRoot: process.env.PREVIEW_TEMP_ROOT || undefined,
          maxInputBytes: Number(process.env.PREVIEW_MAX_INPUT_BYTES || 25 * 1024 * 1024),
          maxPages: Number(process.env.PREVIEW_MAX_PAGES || 200),
          maxDimension: Number(process.env.PREVIEW_MAX_DIMENSION || 2400),
          timeoutMs: Number(process.env.PREVIEW_RENDER_TIMEOUT_MS || 180_000),
        }),
    },
  ],
})
export class AppModule {}
