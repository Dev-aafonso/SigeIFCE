import { IsIn } from 'class-validator';

export const USER_ROLES = [
  'ORGANIZADOR',
  'PROFESSOR',
  'ALUNO',
] as const;

export type UserRole = typeof USER_ROLES[number];

export class SelectRoleDto {
  @IsIn(USER_ROLES)
  role!: UserRole;
}

