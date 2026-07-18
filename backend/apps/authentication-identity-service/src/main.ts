import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { StructuredLogger } from '@c17/observability';

import { AppModule, SERVICE } from './app.module';

export const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Authentication and Identity Service')
        .setDescription('Owns credentials, sessions, and refresh-token rotation.')
        .setVersion('0.1.0')
        .build(),
    ),
  );

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
  logger.log(`${SERVICE} listening on port ${port}`, 'bootstrap');
}

void bootstrap();
