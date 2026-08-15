import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { buildEventEnvelope, EventType, Producer } from '@c17/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';
import { getCorrelationId } from '@c17/observability';

import { AuthLoginFailedError, AuthService, TokenPair } from './auth.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().uuid(),
});

const logoutSchema = z.object({
  refresh_token: z.string().uuid(),
});

const revokeAllSchema = z.object({
  user_id: z.string().uuid(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Optional() @Inject(EVENT_PUBLISHER) private readonly eventPublisher?: EventPublisher,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(
    @Body() body: z.infer<typeof registerSchema>,
  ): Promise<{ id: string; email: string; role: string; email_verified: boolean }> {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    if (parsed.data.role !== 'EMPLOYEE') {
      throw new ForbiddenException('Public registration is limited to EMPLOYEE accounts');
    }
    return this.authService.register(parsed.data.email, parsed.data.password, parsed.data.role);
  }

  @Post('admin/register')
  @ApiOperation({ summary: 'Create a user on behalf of an administrator (email pre-verified)' })
  async registerAdmin(
    @Body() body: z.infer<typeof registerSchema>,
    @Headers('x-user-role') callerRole?: string,
  ): Promise<{ id: string; email: string; role: string; email_verified: boolean }> {
    if (callerRole !== 'ADMIN') {
      throw new ForbiddenException('Administrator role required');
    }
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.authService.registerVerified(
      parsed.data.email,
      parsed.data.password,
      parsed.data.role,
    );
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an email address with a one-time code' })
  async verifyEmail(@Body() body: z.infer<typeof verifyEmailSchema>): Promise<{ verified: boolean }> {
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.authService.verifyEmail(parsed.data.email, parsed.data.code);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the email verification code' })
  async resendOtp(@Body() body: z.infer<typeof resendOtpSchema>): Promise<{ sent: boolean }> {
    const parsed = resendOtpSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.authService.resendOtp(parsed.data.email);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate and obtain tokens' })
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: z.infer<typeof loginSchema>): Promise<TokenPair> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid email or password format');
    }
    try {
      return await this.authService.login(parsed.data.email, parsed.data.password);
    } catch (error) {
      if (error instanceof AuthLoginFailedError) {
        void this.eventPublisher
          ?.publish(
            buildEventEnvelope({
              event_id: randomUUID(),
              event_type: EventType.AUTH_LOGIN_FAILED,
              occurred_at: new Date().toISOString(),
              producer: Producer.AUTHENTICATION_IDENTITY_SERVICE,
              correlation_id: getCorrelationId() ?? randomUUID(),
              actor_id: error.userId,
              resource_type: 'AUTH_ACCOUNT',
              resource_id: error.userId ?? error.email,
              payload: {
                email: error.email,
                reason_code: error.reasonCode,
              },
            }),
          )
          .catch(() => undefined);
      }
      throw error;
    }
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token for a new token pair' })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: z.infer<typeof refreshSchema>): Promise<TokenPair> {
    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid refresh token');
    }
    return this.authService.refresh(parsed.data.refresh_token);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token and clear session' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: z.infer<typeof logoutSchema>): Promise<void> {
    const parsed = logoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid refresh token');
    }
    const revoked = await this.authService.logout(parsed.data.refresh_token);
    if (revoked) {
      void this.eventPublisher
        ?.publish(
          buildEventEnvelope({
            event_id: randomUUID(),
            event_type: EventType.AUTH_SESSION_REVOKED,
            occurred_at: new Date().toISOString(),
            producer: Producer.AUTHENTICATION_IDENTITY_SERVICE,
            correlation_id: getCorrelationId() ?? randomUUID(),
            actor_id: revoked.user_id,
            resource_type: 'AUTH_ACCOUNT',
            resource_id: revoked.user_id,
            payload: {
              refresh_token_id: revoked.refresh_token_id,
              reason_code: 'LOGOUT',
            },
          }),
        )
        .catch(() => undefined);
    }
  }

  @Post('internal/sessions/revoke-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every active refresh session for a user' })
  async revokeAllSessions(@Body() body: z.infer<typeof revokeAllSchema>): Promise<void> {
    const parsed = revokeAllSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    await this.authService.revokeAllUserTokens(parsed.data.user_id);
    void this.eventPublisher
      ?.publish(
        buildEventEnvelope({
          event_id: randomUUID(),
          event_type: EventType.AUTH_SESSION_REVOKED,
          occurred_at: new Date().toISOString(),
          producer: Producer.AUTHENTICATION_IDENTITY_SERVICE,
          correlation_id: getCorrelationId() ?? randomUUID(),
          actor_id: parsed.data.user_id,
          resource_type: 'AUTH_ACCOUNT',
          resource_id: parsed.data.user_id,
          payload: {
            reason_code: 'SECURITY_LOCK',
          },
        }),
      )
      .catch(() => undefined);
  }
}
