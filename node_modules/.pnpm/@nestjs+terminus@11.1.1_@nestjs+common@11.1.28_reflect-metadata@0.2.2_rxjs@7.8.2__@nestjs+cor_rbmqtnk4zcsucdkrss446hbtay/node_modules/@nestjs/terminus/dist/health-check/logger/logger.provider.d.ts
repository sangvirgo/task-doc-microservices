import { type LoggerService, type Provider, type Type } from '@nestjs/common';
export declare function getLoggerProvider(logger?: Type<LoggerService> | boolean): Provider<LoggerService>;
