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
  ],
})
export class AppModule {}
