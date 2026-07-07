import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { isContentAdjacentCapability, type Capability } from '@c17/contracts';

import { UserRolePrismaService } from '../prisma/user-role-prisma.service';

export interface UserDto {
  id: string;
  email: string;
  role: string;
  locked_at: string | null;
  capabilities: string[];
  created_at: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: UserRolePrismaService) {}

  async createUser(data: { id: string; email: string; role: string }): Promise<UserDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException('Email already exists');
    }
    const user = await this.prisma.user.create({
      data: { id: data.id, email: data.email, role: data.role },
      include: { Capability: true },
    });
    return this.toDto(user);
  }

  async getUser(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { Capability: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toDto(user);
  }

  async listUsers(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({ include: { Capability: true } });
    return users.map((u) => this.toDto(u));
  }

  async lockUser(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.locked_at) throw new BadRequestException('User is already locked');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { locked_at: new Date() },
      include: { Capability: true },
    });
    return this.toDto(updated);
  }

  async unlockUser(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.locked_at) throw new BadRequestException('User is not locked');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { locked_at: null },
      include: { Capability: true },
    });
    return this.toDto(updated);
  }

  async grantCapability(userId: string, capability: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Capability: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // V3 §5.2.2: capabilities held only by EMPLOYEE accounts
    if (user.role === 'ADMIN') {
      throw new BadRequestException('ADMIN cannot hold capabilities');
    }

    // V3 §5.2.2 / ADR-0004: ADMIN cannot hold content-adjacent capabilities
    if (user.role === 'ADMIN' && isContentAdjacentCapability(capability as Capability)) {
      throw new BadRequestException('ADMIN cannot hold content-adjacent capability');
    }

    const existing = user.Capability.find((c) => c.capability === capability);
    if (existing) {
      throw new ConflictException('Capability already granted');
    }

    await this.prisma.capability.create({
      data: { user_id: userId, capability },
    });

    return this.getUser(userId);
  }

  async revokeCapability(userId: string, capability: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const result = await this.prisma.capability.deleteMany({
      where: { user_id: userId, capability },
    });
    if (result.count === 0) {
      throw new NotFoundException('Capability not found');
    }
    return this.getUser(userId);
  }

  private toDto(user: {
    id: string;
    email: string;
    role: string;
    locked_at: Date | null;
    created_at: Date;
    Capability: Array<{ capability: string }>;
  }): UserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      locked_at: user.locked_at?.toISOString() ?? null,
      capabilities: user.Capability.map((c) => c.capability),
      created_at: user.created_at.toISOString(),
    };
  }
}
