import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { Match } from './match.decorator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsNotEmpty()
  @Match('password', { message: 'As senhas não coincidem.' })
  passwordConfirmation!: string;
}