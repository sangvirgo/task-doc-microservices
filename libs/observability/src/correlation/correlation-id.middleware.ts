import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { CORRELATION_ID_HEADER, runWithCorrelationId } from './correlation-context';

/**
 * Establishes one correlation id per inbound request and echoes it back on the response.
 *
 * An inbound id is honoured only when it is a well-formed UUID. Anything else is replaced: the id
 * reaches logs and event envelopes, and an unvalidated caller-supplied string is a log-injection
 * vector.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.header(CORRELATION_ID_HEADER);
    const correlationId = isUuid(inbound) ? inbound : randomUUID();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    runWithCorrelationId(correlationId, () => next());
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID_PATTERN.test(value);
}
