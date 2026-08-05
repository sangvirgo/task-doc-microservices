import { AuthService } from '../src/auth/auth.service';
import { hashSync } from 'bcryptjs';

describe('AuthService user-role integration', () => {
  const jwtService = { sign: jest.fn().mockReturnValue('access-token') };
  const prisma = {
    user: {
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
    },
  };
  const redis = { setSession: jest.fn().mockResolvedValue(undefined) };
  const userRoleClient = {
    provisionUser: jest.fn().mockResolvedValue(undefined),
    getCapabilities: jest.fn().mockResolvedValue(['DISPOSAL_APPROVE']),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-session-id' });
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
});
