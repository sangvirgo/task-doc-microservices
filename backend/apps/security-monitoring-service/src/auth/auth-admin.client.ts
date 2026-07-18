import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthAdminClient {
  async revokeAllSessions(userId: string): Promise<void> {
    const response = await fetch(
      `${process.env.AUTHENTICATION_IDENTITY_SERVICE_URL || 'http://localhost:3001'}/auth/internal/sessions/revoke-all`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId }),
      },
    );

    if (!response.ok) {
      throw new Error(`auth revoke-all failed with status ${response.status}`);
    }
  }
}
