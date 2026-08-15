import type { NextFunction, Request, Response } from 'express';

import type { Capability, SystemRole } from '@c17/contracts';

import type { AuthContext } from './auth-context';
import { AUTH_CONTEXT_PROPERTY, type RequestWithAuthContext } from './current-user.decorator';

function parseCapabilities(value: string | undefined): Capability[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is Capability => typeof entry === 'string');
  } catch {
    return [];
  }
}

export function attachAuthContextFromHeaders(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = req.header('x-user-id');
  const role = req.header('x-user-role');

  if (!userId || !role) {
    next();
    return;
  }

  const authContext: AuthContext = {
    userId,
    email: req.header('x-user-email') ?? undefined,
    role: role as SystemRole,
    capabilities: parseCapabilities(req.header('x-user-capabilities') ?? undefined),
    sessionId: req.header('x-session-id') ?? '',
  };

  (req as RequestWithAuthContext)[AUTH_CONTEXT_PROPERTY] = authContext;
  next();
}
