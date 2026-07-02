import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { AuthService, TokenPair } from './auth.service';

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

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(
    @Body() body: z.infer<typeof registerSchema>,
  ): Promise<{ id: string; email: string; role: string }> {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.authService.register(parsed.data.email, parsed.data.password, parsed.data.role);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate and obtain tokens' })
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: z.infer<typeof loginSchema>): Promise<TokenPair> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid email or password format');
    }
    return this.authService.login(parsed.data.email, parsed.data.password);
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
    await this.authService.logout(parsed.data.refresh_token);
  }
}
