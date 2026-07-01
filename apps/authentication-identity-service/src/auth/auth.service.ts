import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { randomUUID } from 'crypto';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in_seconds: number;
}

export interface SessionMetadata {
  userId: string;
  email: string;
  role: string;
  capabilities: string[];
  refreshTokenId: string;
}

/**
 * Authentication service (V3 §5.1): password hashing, JWT generation, token rotation.
 *
 * Access tokens: 15–30 min TTL (configurable, default 1800s).
 * Refresh tokens: stored in auth_db, revocable, rotated on each use.
 */
@Injectable()
export class AuthService {
  private readonly accessTokenTtl = 1800; // 30 minutes (V3 §5.1)
  private readonly refreshTokenTtl = 7 * 24 * 60 * 60; // 7 days

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Hash a password for storage. Never store plaintext.
   * V3 §5.1: hash at registration/change only; never hash on every login.
   */
  async hashPassword(password: string): Promise<string> {
    return hash(password, 10);
  }

  /**
   * Verify a plaintext password against its hash.
   */
  async verifyPassword(plaintext: string, hash: string): Promise<boolean> {
    return compare(plaintext, hash);
  }

  /**
   * Generate an access token for a user.
   * TTL: 15–30 min per V3 §5.1; default 30 min.
   */
  generateAccessToken(userId: string, role: string, capabilities: string[]): string {
    const payload = { sub: userId, role, capabilities };
    return this.jwtService.sign(payload, { expiresIn: this.accessTokenTtl });
  }

  /**
   * Generate a refresh token (opaque ID; actual token is stored in auth_db).
   * TTL: 7 days; revocable.
   */
  generateRefreshToken(): string {
    return randomUUID();
  }

  /**
   * Verify and decode an access token.
   * Throws if invalid or expired.
   */
  verifyAccessToken(token: string): { sub: string; role: string; capabilities: string[] } {
    return this.jwtService.verify(token);
  }
}
