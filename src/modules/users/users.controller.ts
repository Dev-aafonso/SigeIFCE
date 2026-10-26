import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import { SelectRoleDto } from '../auth/dto/select-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

type AuthenticatedRequest = Request & {
  user?: {
    sub?: string;
  };
};

function getAuthenticatedUserId(request: AuthenticatedRequest): string {
  const id = request.user?.sub;

  if (typeof id !== 'string' || !id.trim()) {
    throw new UnauthorizedException(
      'Não foi possível identificar o usuário autenticado.',
    );
  }

  return id;
}

@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Roles(
    UserRole.ADMIN,
    UserRole.ORGANIZADOR,
    UserRole.PROFESSOR,
    UserRole.ALUNO,
  )
  findMyProfile(@Req() request: AuthenticatedRequest) {
    return this.usersService.findMyProfile(
      getAuthenticatedUserId(request),
    );
  }

  @Patch('me')
  @Roles(
    UserRole.ADMIN,
    UserRole.ORGANIZADOR,
    UserRole.PROFESSOR,
    UserRole.ALUNO,
  )
  updateMyProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateMyProfile(
      getAuthenticatedUserId(request),
      dto,
    );
  }

  @Patch('me/password')
  @Roles(
    UserRole.ADMIN,
    UserRole.ORGANIZADOR,
    UserRole.PROFESSOR,
    UserRole.ALUNO,
  )
  changeMyPassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changeMyPassword(
      getAuthenticatedUserId(request),
      dto,
    );
  }

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
