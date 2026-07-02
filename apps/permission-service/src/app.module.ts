import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { PermissionsController } from './permissions/permissions.controller';
import { PermissionService } from './permissions/permission.service';
import { PermissionPrismaService } from './prisma/permission-prisma.service';

export const SERVICE = 'permission-service';

/** Sole authority for access decisions. Default deny, fail closed. */
export const envSchema = baseEnvSchema.extend({
  PERMISSION_DATABASE_URL: z.string().url(),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [PermissionsController],
  providers: [PermissionPrismaService, PermissionService],
})
export class AppModule {}
