import { IsEnum } from 'class-validator';
import { UserRole } from '../../../generated/prisma/client';

export class SelectRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}