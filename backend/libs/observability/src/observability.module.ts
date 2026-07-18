import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { CorrelationIdMiddleware } from './correlation/correlation-id.middleware';
import { HealthModule } from './health/health.module';
import { StructuredLogger } from './logging/structured-logger.service';

/**
 * Structured logging, correlation id propagation, and the health endpoint. Every application
 * imports this exactly once.
 */
@Global()
@Module({
  imports: [HealthModule],
  providers: [StructuredLogger],
  exports: [StructuredLogger, HealthModule],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*path');
  }
}
