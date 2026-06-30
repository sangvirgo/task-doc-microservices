import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';

import { validateEnv } from './validate-env';

/** Injection token for the validated, typed environment of the current service. */
export const APP_ENV = Symbol('APP_ENV');

/** Injection token for the current service's name, used by the logger and health endpoint. */
export const SERVICE_NAME = Symbol('SERVICE_NAME');

export interface AppConfigModuleOptions<TSchema extends z.ZodTypeAny> {
  serviceName: string;
  schema: TSchema;
  /** Overrides `process.env`. Tests use this; applications do not. */
  source?: Record<string, unknown>;
}

/**
 * Validates the environment once, at module construction, and exposes the result as `APP_ENV`.
 *
 * Construction happens before the HTTP listener is opened, so a service with a bad environment
 * fails to boot rather than serving traffic in an undefined state.
 */
@Global()
@Module({})
export class AppConfigModule {
  static forRoot<TSchema extends z.ZodTypeAny>(
    options: AppConfigModuleOptions<TSchema>,
  ): DynamicModule {
    const env: unknown = validateEnv(options.serviceName, options.schema, options.source);

    return {
      module: AppConfigModule,
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        { provide: APP_ENV, useValue: env },
        { provide: SERVICE_NAME, useValue: options.serviceName },
      ],
      exports: [APP_ENV, SERVICE_NAME],
    };
  }
}
