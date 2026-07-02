import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { SecurityController } from './security/security.controller';
import { SecurityPipelineService } from './security/security-pipeline.service';
import { DocumentSecurityPrismaService } from './prisma/document-security-prisma.service';

export const SERVICE = 'document-security-service';

/** Runs the security pipeline: scan, checksum, encrypt, sign, store. */
export const envSchema = baseEnvSchema.extend({
  DOCUMENT_SECURITY_DATABASE_URL: z.string().url(),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [SecurityController],
  providers: [DocumentSecurityPrismaService, SecurityPipelineService],
})
export class AppModule {}
