import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserRoleClient {
  private readonly logger = new Logger(UserRoleClient.name);
  private readonly userRoleServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.userRoleServiceUrl =
      this.configService.get<string>('USER_ROLE_SERVICE_URL') || 'http://localhost:3002';
    this.timeoutMs = this.configService.get<number>('USER_ROLE_LOOKUP_TIMEOUT_MS') || 2000;
  }

  async assertEmployee(userId: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.userRoleServiceUrl}/users/${userId}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`User role lookup failed: ${response.status} for ${userId}`);
        throw new BadRequestException('Target user must be an EMPLOYEE');
      }

      const body = (await response.json()) as { role?: string };
      if (body.role !== 'EMPLOYEE') {
        throw new BadRequestException('Target user must be an EMPLOYEE');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.warn(
        `User role lookup error for ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new BadRequestException('Target user must be an EMPLOYEE');
    } finally {
      clearTimeout(timeout);
    }
  }
}
