import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { attachAuthContextFromHeaders } from '@c17/auth-context';
import { StructuredLogger } from '@c17/observability';

import { AppModule, SERVICE } from './app.module';

export const DEFAULT_PORT = 3003;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  app.use(attachAuthContextFromHeaders);

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Task Management Service')
        .setDescription(
          'Owns tasks, the task hierarchy, participation, comments, and TaskActivity.',
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
