import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface JwtPayload {
  sub: string;
  role: string;
  capabilities: string[];
  iat: number;
  exp: number;
}

/** Paths that bypass JWT validation */
const PUBLIC_PATHS = ['/health', '/docs'];

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    // Allow public paths (health, docs) without a token
    if (PUBLIC_PATHS.some((p) => request.path === p || request.path.startsWith(`${p}/`))) {
      return true;
    }
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization header');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      (request as unknown as Record<string, unknown>)['user'] = {
        userId: payload.sub,
        role: payload.role,
        capabilities: payload.capabilities ?? [],
        sessionId: '',
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth) return null;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? (token ?? null) : null;
  }
}
