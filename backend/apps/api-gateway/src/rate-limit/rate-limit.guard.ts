import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Simple in-memory sliding-window rate limiter.
 * Per-IP, configurable window and max requests.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly buckets = new Map<string, number[]>();

  constructor() {
    this.windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
    this.maxRequests = Number(process.env.RATE_LIMIT_MAX || 100);

    // Periodic cleanup every 60 s
    setInterval(() => this.cleanup(), 60_000).unref();
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = this.getKey(request);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.buckets.get(key);
    if (!timestamps) {
      timestamps = [];
      this.buckets.set(key, timestamps);
    }

    // Remove expired entries
    while (timestamps.length > 0 && timestamps[0] < windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= this.maxRequests) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          retryAfter: Math.ceil(this.windowMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    timestamps.push(now);
    return true;
  }

  private getKey(request: Request): string {
    // Use authenticated user ID if available, otherwise IP
    const user = (request as unknown as Record<string, unknown>)['user'] as
      { userId: string } | undefined;
    if (user?.userId) return `user:${user.userId}`;
    return `ip:${request.ip || request.socket.remoteAddress || 'unknown'}`;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, timestamps] of this.buckets) {
      while (timestamps.length > 0 && timestamps[0] < cutoff) {
        timestamps.shift();
      }
      if (timestamps.length === 0) {
        this.buckets.delete(key);
      }
    }
  }
}
