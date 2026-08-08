import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UserRoleProvision {
  id: string;
  email: string;
  role: string;
}

export interface UserRoleLockState {
  locked_at: string | null;
}

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

  async provisionUser(data: UserRoleProvision): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.userRoleServiceUrl}/users`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.error(`User-role provisioning failed: ${response.status} for ${data.id}`);
        throw new ServiceUnavailableException('User directory provisioning failed');
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(
        `User-role provisioning error for ${data.id}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new ServiceUnavailableException('User directory is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  async getCapabilities(userId: string): Promise<string[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.userRoleServiceUrl}/users/${userId}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`User-role capability lookup failed: ${response.status} for ${userId}`);
        return [];
      }

      const body = (await response.json()) as { capabilities?: unknown };
      return Array.isArray(body.capabilities)
        ? body.capabilities.filter(
            (capability): capability is string => typeof capability === 'string',
          )
        : [];
    } catch (error) {
      // Login remains available, but capability checks fail closed when the directory is unavailable.
      this.logger.warn(
        `User-role capability lookup error for ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  async getLockState(userId: string): Promise<UserRoleLockState> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.userRoleServiceUrl}/users/${userId}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.error(`User-role lock-state lookup failed: ${response.status} for ${userId}`);
        throw new ServiceUnavailableException('User directory lock state is unavailable');
      }

      const body = (await response.json()) as { locked_at?: unknown };
      if (body.locked_at !== null && typeof body.locked_at !== 'string') {
        throw new ServiceUnavailableException('User directory returned an invalid lock state');
      }

      return { locked_at: body.locked_at ?? null };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(
        `User-role lock-state lookup error for ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new ServiceUnavailableException('User directory is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
