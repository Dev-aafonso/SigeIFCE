import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import { SelectRoleDto } from '../auth/dto/select-role.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: SelectRoleDto) {
    return this.usersService.updateRole(id, dto.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}