import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsOptional() @IsString() @MaxLength(100)
  enrollmentNumber?: string;

  @IsOptional() @IsString() @MaxLength(150)
  course?: string;

  @IsOptional() @IsString() @MaxLength(150)
  campus?: string;
}
