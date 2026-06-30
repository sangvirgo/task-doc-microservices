import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { loginRequestSchema, type LoginRequest, type LoginResponse } from './login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and obtain an access token' })
  async login(@Body() request: LoginRequest): Promise<LoginResponse> {
    const parsed = loginRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new Error('Invalid login request');
    }

    return {
      access_token: 'mock-token',
      refresh_token: 'mock-refresh',
      expires_in_seconds: 1800,
    };
  }
}
