import { Injectable, Logger } from '@nestjs/common';

export interface InternalUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Resolves user email addresses from the user-role directory. The notification service only
 * stores user ids, so real email delivery requires looking the address up at send time.
 */
@Injectable()
export class UserDirectoryClient {
  private readonly logger = new Logger(UserDirectoryClient.name);
  private readonly baseUrl = (process.env.USER_ROLE_SERVICE_URL || 'http://localhost:3002').replace(
    /\/$/,
    '',
  );
  private readonly timeoutMs = Number(process.env.USER_ROLE_LOOKUP_TIMEOUT_MS || 2000);

  async resolveUser(userId: string): Promise<InternalUser | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/users/internal/${encodeURIComponent(userId)}`, {
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const body = (await response.json()) as InternalUser;
      return body;
    } catch (error) {
      this.logger.warn(
        `user lookup failed for ${userId} — ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listAdmins(): Promise<InternalUser[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/users/internal/admins`, {
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const body = (await response.json()) as InternalUser[];
      return Array.isArray(body) ? body : [];
    } catch (error) {
      this.logger.warn(
        `admin lookup failed — ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}