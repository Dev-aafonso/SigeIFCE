import {
  IsEmail,
  IsIn,
  IsOptional,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Match } from './match.decorator';

export class RegisterDto {
  @IsOptional() @IsIn(["ADMIN", "PROFESSOR", "ALUNO"]) role?: "ADMIN" | "PROFESSOR" | "ALUNO";
  @IsOptional() @IsString() @MaxLength(128) managerCode?: string;
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsNotEmpty()
  @Match('password', {
    message: 'As senhas não coincidem.',
  })
  passwordConfirmation!: string;
}
