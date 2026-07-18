import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthContext } from './auth-context';

/** Property under which an authentication guard attaches the resolved caller to the request. */
export const AUTH_CONTEXT_PROPERTY = 'authContext';

export interface RequestWithAuthContext extends Request {
  [AUTH_CONTEXT_PROPERTY]?: AuthContext;
}

/**
 * Injects the authenticated caller into a handler.
 *
 * Throws when no context is attached rather than returning `undefined`: a handler that reads the
 * caller and silently gets nothing is how an unauthenticated request ends up treated as anonymous
 * but permitted.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<RequestWithAuthContext>();
    const auth = request[AUTH_CONTEXT_PROPERTY];

    if (!auth) {
      throw new UnauthorizedException('No authenticated caller on this request');
    }

    return auth;
  },
);
