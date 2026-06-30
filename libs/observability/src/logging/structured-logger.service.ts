import { Inject, Injectable, LoggerService, Optional, Scope } from '@nestjs/common';
import pino, { type Logger as PinoLogger } from 'pino';

import { SERVICE_NAME } from '@c17/config';

import { getCorrelationId } from '../correlation/correlation-context';

/**
 * Field paths scrubbed from every log line. Structured logging makes it easy to log an object
 * wholesale, which is exactly how credentials and ciphertext keys end up on disk.
 */
export const REDACTED_PATHS = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'dek',
  'kek',
  'wrappedDek',
  'wrapped_dek',
  'content',
  'comment',
  '*.password',
  '*.token',
  '*.refresh_token',
];

export function createPinoLogger(serviceName: string, level = process.env.LOG_LEVEL ?? 'info') {
  return pino({
    level,
    base: { service: serviceName },
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

/**
 * The Nest logger for every application: JSON lines, one service field, and the ambient
 * correlation id stamped on every record.
 */
@Injectable({ scope: Scope.DEFAULT })
export class StructuredLogger implements LoggerService {
  private readonly logger: PinoLogger;
  private context?: string;

  constructor(@Optional() @Inject(SERVICE_NAME) serviceName?: string) {
    this.logger = createPinoLogger(serviceName ?? 'unknown-service');
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: unknown, context?: string): void {
    this.logger.info(this.bindings(context), asMessage(message));
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.logger.error({ ...this.bindings(context), stack }, asMessage(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(this.bindings(context), asMessage(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(this.bindings(context), asMessage(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(this.bindings(context), asMessage(message));
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal(this.bindings(context), asMessage(message));
  }

  private bindings(context?: string): Record<string, unknown> {
    return {
      context: context ?? this.context,
      correlation_id: getCorrelationId(),
    };
  }
}

function asMessage(message: unknown): string {
  return typeof message === 'string' ? message : JSON.stringify(message);
}
