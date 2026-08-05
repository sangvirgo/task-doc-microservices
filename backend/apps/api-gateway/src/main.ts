import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { StructuredLogger } from '@c17/observability';

import { AppModule, SERVICE } from './app.module';

export const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    'http://13.229.104.126:3100,http://localhost:3001,http://localhost:3100'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('API Gateway')
        .setDescription(
          'Edge entry point: validates access tokens and routes to internal services.',
        )
        .setVersion('0.1.0')
        .build(),
    ),
  );

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
  logger.log(`${SERVICE} listening on port ${port}`, 'bootstrap');
}

void bootstrap();
