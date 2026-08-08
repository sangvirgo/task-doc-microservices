import { AuthService } from '../src/auth/auth.service';
import { hashSync } from 'bcryptjs';

describe('AuthService user-role integration', () => {
  const jwtService = { sign: jest.fn().mockReturnValue('access-token') };
  const prisma = {
    user: {
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const redis = {
    setSession: jest.fn().mockResolvedValue(undefined),
    deleteUserSessions: jest.fn().mockResolvedValue(undefined),
  };
  const userRoleClient = {
    provisionUser: jest.fn().mockResolvedValue(undefined),
    getCapabilities: jest.fn().mockResolvedValue(['DISPOSAL_APPROVE']),
    getLockState: jest.fn().mockResolvedValue({ locked_at: null }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-session-id' });
    userRoleClient.getLockState.mockResolvedValue({ locked_at: null });
  });

  it('provisions the same employee identity in the user-role directory', async () => {
    prisma.user.create.mockImplementation(({ data }: { data: Record<string, string> }) => ({
      id: data.id,
      email: data.email,
      role: data.role,
    }));

    const service = new AuthService(
      jwtService as never,
      prisma as never,
      redis as never,
      userRoleClient as never,
    );

    const result = await service.register('new.employee@example.com', 'Password123!', 'EMPLOYEE');

    expect(result).toEqual({
      id: expect.any(String),
      email: 'new.employee@example.com',
      role: 'EMPLOYEE',
    });
    expect(userRoleClient.provisionUser).toHaveBeenCalledWith({
      id: result.id,
      email: result.email,
      role: result.role,
    });
  });

  it('puts current user-role capabilities in JWT and Redis session metadata', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001',
      email: 'employee@example.com',
      role: 'EMPLOYEE',
      locked_at: null,
      password_hash: hashSync('Password123!', 4),
    });

    const service = new AuthService(
      jwtService as never,
      prisma as never,
      redis as never,
      userRoleClient as never,
    );

    await service.login('employee@example.com', 'Password123!');

    expect(userRoleClient.getCapabilities).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
    );
    expect(jwtService.sign).toHaveBeenCalledWith(
      {
        sub: '10000000-0000-4000-8000-000000000001',
        email: 'employee@example.com',
        role: 'EMPLOYEE',
        capabilities: ['DISPOSAL_APPROVE'],
      },
      { expiresIn: 1800 },
    );
    expect(redis.setSession).toHaveBeenCalledWith(
      'refresh-session-id',
      expect.objectContaining({ capabilities: ['DISPOSAL_APPROVE'] }),
      7 * 24 * 60 * 60,
    );
  });

  it('rejects login when the user-role directory reports a locked account', async () => {
    const userId = '10000000-0000-4000-8000-000000000001';
    const lockedAt = '2026-08-07T10:00:00.000Z';
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'employee@example.com',
      role: 'EMPLOYEE',
      locked_at: null,
      password_hash: hashSync('Password123!', 4),
    });
    userRoleClient.getLockState.mockResolvedValue({ locked_at: lockedAt });

    const service = new AuthService(
      jwtService as never,
      prisma as never,
      redis as never,
      userRoleClient as never,
    );

    await expect(service.login('employee@example.com', 'Password123!')).rejects.toMatchObject({
      message: 'Account is locked',
    });
    expect(userRoleClient.getLockState).toHaveBeenCalledWith(userId);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { locked_at: new Date(lockedAt) },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(redis.deleteUserSessions).toHaveBeenCalledWith(userId);
  });

  it('rejects refresh when the user becomes locked after the token was issued', async () => {
    const userId = '10000000-0000-4000-8000-000000000001';
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-session-id',
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
      user: {
        id: userId,
        email: 'employee@example.com',
        role: 'EMPLOYEE',
        locked_at: null,
      },
    });
    userRoleClient.getLockState.mockResolvedValue({ locked_at: '2026-08-07T10:00:00.000Z' });

    const service = new AuthService(
      jwtService as never,
      prisma as never,
      redis as never,
      userRoleClient as never,
    );

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({
      message: 'Account is locked',
    });
    expect(userRoleClient.getLockState).toHaveBeenCalledWith(userId);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(redis.deleteUserSessions).toHaveBeenCalledWith(userId);
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
  });
});
