import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';

import { loginRequestSchema, type LoginRequest, type LoginResponse } from './login.dto';
import { AuthService } from './auth.service';

/**
 * Authentication API (V3 §5.1).
 *
 * POST /auth/login: email + password → access_token + refresh_token
 * (Other endpoints: /logout, /refresh, /revoke — deferred to Phase 2 if needed)
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly redis: Redis;

  constructor(private readonly authService: AuthService) {
    // Phase 1: connect to Redis at env URL
    // Phase 2: inject via dependency with proper provider setup
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate and obtain an access token' })
  async login(@Body() request: LoginRequest): Promise<LoginResponse> {
    const parsed = loginRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new BadRequestException('Invalid email or password format');
    }

    // Phase 1 baseline: no actual user lookup yet (database not wired).
    // In Phase 2, this would:
    // - look up user by email in auth_db
    // - verify password against stored hash
    // - return 401 if not found or password mismatch
    // For now, mock a successful login.

    const userId = 'user-' + Math.random().toString(36).slice(2, 9);
    const sessionId = 'session-' + Math.random().toString(36).slice(2, 9);

    // Generate real JWT token with 30-minute TTL (V3 §5.1).
    const accessToken = this.authService.generateAccessToken(userId, 'EMPLOYEE', []);

    // Generate refresh token (opaque ID; token itself stored in auth_db).
    const refreshToken = this.authService.generateRefreshToken();

    // Store session metadata in Redis (TTL: 7 days).
    const sessionMetadata = { userId, email: request.email, role: 'EMPLOYEE', capabilities: [] };
    await this.redis.setex(
      `session:${sessionId}`,
      7 * 24 * 60 * 60,
      JSON.stringify(sessionMetadata),
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in_seconds: 1800,
    };
  }
}
