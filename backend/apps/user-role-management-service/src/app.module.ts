import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { UserRolePrismaService } from './prisma/user-role-prisma.service';
import { UserStatisticsService } from './users/user-statistics.service';

export const SERVICE = 'user-role-management-service';

/** Owns users, departments, system roles, and capabilities. */
export const envSchema = baseEnvSchema.extend({
  USER_ROLE_DATABASE_URL: z.string().url(),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [UsersController],
  providers: [UserRolePrismaService, UsersService, UserStatisticsService],
})
export class AppModule {}
