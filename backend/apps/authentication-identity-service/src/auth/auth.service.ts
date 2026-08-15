import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compareSync, hashSync } from 'bcryptjs';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';

import { EmailService, verificationCodeEmail } from '@c17/email';

import { AuthPrismaService } from '../prisma/auth-prisma.service';
import { RedisService } from '../redis/redis.service';
import { UserRoleClient } from '../users/user-role.client';

export class AuthLoginFailedError extends UnauthorizedException {
  constructor(
    message: string,
    readonly email: string,
    readonly userId: string | null,
    readonly reasonCode: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'EMAIL_NOT_VERIFIED',
  ) {
    super(message);
  }
}

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

const REFRESH_TOKEN_TTL_DAYS = 7;
const SESSION_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 1800;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otpTtlSeconds = Number(process.env.OTP_TTL_SECONDS || 600);
  private readonly otpResendSeconds = Number(process.env.OTP_RESEND_SECONDS || 60);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: AuthPrismaService,
    private readonly redis: RedisService,
    private readonly userRoleClient: UserRoleClient,
    private readonly emailService: EmailService,
  ) {}

  hashPassword(password: string): string {
    return hashSync(password, 10);
  }

  verifyPassword(plaintext: string, passwordHash: string): boolean {
    return compareSync(plaintext, passwordHash);
  }

  async register(
    email: string,
    password: string,
    role: string = 'EMPLOYEE',
  ): Promise<{ id: string; email: string; role: string; email_verified: boolean }> {
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Email đã tồn tại');
    }

    const passwordHash = this.hashPassword(password);
    const user = await this.prisma.user.create({
      data: { id: randomUUID(), email, password_hash: passwordHash, role },
    }).catch((error: { code?: string }) => {
      if (error?.code === 'P2002') throw new ConflictException('Email đã tồn tại');
      throw error;
    });

    try {
      await this.userRoleClient.provisionUser({ id: user.id, email: user.email, role: user.role });
    } catch (error) {
      // Keep the credential store and the user-role directory from drifting after a failed signup.
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      throw error;
    }

    // Self-registered accounts must prove the email belongs to them before they can log in.
    // A failed delivery is not fatal — the user can request a new code via resend-otp.
    await this.issueVerifyOtp(user.id, user.email).catch((error: unknown) => {
      this.logger.warn(
        `OTP email delivery failed for ${user.email} — ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });

    return { id: user.id, email: user.email, role: user.role, email_verified: false };
  }

  async registerVerified(
    email: string,
    password: string,
    role: string = 'EMPLOYEE',
  ): Promise<{ id: string; email: string; role: string; email_verified: boolean }> {
    // Accounts provisioned by an administrator are trusted — no OTP confirmation needed.
    const passwordHash = this.hashPassword(password);
    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        password_hash: passwordHash,
        role,
        email_verified_at: new Date(),
      },
    }).catch((error: { code?: string }) => {
      if (error?.code === 'P2002') throw new ConflictException('Email đã tồn tại');
      throw error;
    });

    try {
      await this.userRoleClient.provisionUser({ id: user.id, email: user.email, role: user.role });
    } catch (error) {
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      throw error;
    }

    return { id: user.id, email: user.email, role: user.role, email_verified: true };
  }

  async verifyEmail(email: string, code: string): Promise<{ verified: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid or expired verification code');
    if (user.email_verified_at) return { verified: true };

    const expected = await this.redis.getClient().get(`otp:verify:${user.id}`);
    if (!expected || !this.constantTimeEquals(code, expected)) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { email_verified_at: new Date() },
    });
    await this.redis.getClient().del(`otp:verify:${user.id}`);
    await this.redis.getClient().del(`otp:resend:${user.id}`);
    return { verified: true };
  }

  async resendOtp(email: string): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('No pending account for this email');
    if (user.email_verified_at) throw new BadRequestException('Email is already verified');

    const rateLimitKey = `otp:resend:${user.id}`;
    if (await this.redis.getClient().get(rateLimitKey)) {
      throw new HttpException('Please wait before requesting another code', HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.issueVerifyOtp(user.id, user.email);
    return { sent: true };
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthLoginFailedError('Invalid credentials', email, null, 'INVALID_CREDENTIALS');
    }

    const isLocked = await this.synchronizeLockState(user.id, user.locked_at);
    if (isLocked) {
      await this.revokeAllUserTokens(user.id);
      throw new AuthLoginFailedError('Account is locked', email, user.id, 'ACCOUNT_LOCKED');
    }

    if (!this.verifyPassword(password, user.password_hash)) {
      throw new AuthLoginFailedError('Invalid credentials', email, user.id, 'INVALID_CREDENTIALS');
    }

    if (!user.email_verified_at) {
      throw new AuthLoginFailedError(
        'Email verification required',
        email,
        user.id,
        'EMAIL_NOT_VERIFIED',
      );
    }

    return this.issueTokenPair(user.id, user.email, user.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.revoked_at) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (storedToken.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const isLocked = await this.synchronizeLockState(
      storedToken.user.id,
      storedToken.user.locked_at,
    );
    if (isLocked) {
      await this.revokeAllUserTokens(storedToken.user.id);
      throw new UnauthorizedException('Account is locked');
    }

    // Rotate: revoke old token, issue new pair
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked_at: new Date() },
    });

    return this.issueTokenPair(storedToken.user.id, storedToken.user.email, storedToken.user.role);
  }

  async logout(
    refreshToken: string,
  ): Promise<{ user_id: string; refresh_token_id: string } | null> {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (storedToken && !storedToken.revoked_at) {
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked_at: new Date() },
      });
      await this.redis.deleteSession(storedToken.id);
      return { user_id: storedToken.user_id, refresh_token_id: storedToken.id };
    }

    return null;
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    await this.redis.deleteUserSessions(userId);
  }

  verifyAccessToken(token: string): { sub: string; role: string; capabilities: string[] } {
    return this.jwtService.verify(token);
  }

  private async synchronizeLockState(userId: string, localLockedAt: Date | null): Promise<boolean> {
    const directoryState = await this.userRoleClient.getLockState(userId);
    const directoryLockedAt = directoryState.locked_at ? new Date(directoryState.locked_at) : null;

    if ((localLockedAt?.getTime() ?? null) !== (directoryLockedAt?.getTime() ?? null)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { locked_at: directoryLockedAt },
      });
    }

    return directoryLockedAt !== null;
  }

  private async issueTokenPair(userId: string, email: string, role: string): Promise<TokenPair> {
    const capabilities = await this.userRoleClient.getCapabilities(userId);
    const accessToken = this.jwtService.sign(
      { sub: userId, email, role, capabilities },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    const rawRefreshToken = randomUUID();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    await this.redis.setSession(
      refreshTokenRecord.id,
      { userId, email, role, capabilities, refreshTokenId: refreshTokenRecord.id },
      SESSION_TTL_SECONDS,
    );

    return {
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in_seconds: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueVerifyOtp(userId: string, email: string): Promise<void> {
    const code = String(randomInt(100000, 999999));
    await this.redis.getClient().setex(`otp:verify:${userId}`, this.otpTtlSeconds, code);
    const envelope = verificationCodeEmail(code, Math.round(this.otpTtlSeconds / 60));
    await this.emailService.sendMail({ to: email, ...envelope });
    await this.redis.getClient().setex(`otp:resend:${userId}`, this.otpResendSeconds, '1');
  }

  private constantTimeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
