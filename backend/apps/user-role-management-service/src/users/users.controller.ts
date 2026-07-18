import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { UsersService, UserDto } from './users.service';

const createUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'EMPLOYEE']),
});

const capabilitySchema = z.object({
  capability: z.string().min(1),
});

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users' })
  listUsers(): Promise<UserDto[]> {
    return this.usersService.listUsers();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  getUser(@Param('id') id: string): Promise<UserDto> {
    return this.usersService.getUser(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  async createUser(@Body() body: z.infer<typeof createUserSchema>): Promise<UserDto> {
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.usersService.createUser(parsed.data);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock a user account' })
  lockUser(@Param('id') id: string): Promise<UserDto> {
    return this.usersService.lockUser(id);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlock a user account' })
  unlockUser(@Param('id') id: string): Promise<UserDto> {
    return this.usersService.unlockUser(id);
  }

  @Post(':id/capabilities')
  @ApiOperation({ summary: 'Grant a capability to a user' })
  async grantCapability(
    @Param('id') id: string,
    @Body() body: z.infer<typeof capabilitySchema>,
  ): Promise<UserDto> {
    const parsed = capabilitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.usersService.grantCapability(id, parsed.data.capability);
  }

  @Delete(':id/capabilities/:capability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a capability from a user' })
  revokeCapability(
    @Param('id') id: string,
    @Param('capability') capability: string,
  ): Promise<UserDto> {
    return this.usersService.revokeCapability(id, capability);
  }
}
