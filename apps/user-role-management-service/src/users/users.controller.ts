import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  getUser(@Param('id') id: string) {
    return { id, email: 'user@example.com', role: 'EMPLOYEE' };
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  createUser(
    @Body()
    request: {
      email: string;
      role: string;
    },
  ) {
    return { id: 'uuid', email: request.email, role: request.role };
  }

  @Post(':id/lock')
  @ApiOperation({ summary: 'Lock a user' })
  lockUser(@Param('id') id: string) {
    return { id, locked: true };
  }

  @Post(':id/unlock')
  @ApiOperation({ summary: 'Unlock a user' })
  unlockUser(@Param('id') id: string) {
    return { id, locked: false };
  }
}
