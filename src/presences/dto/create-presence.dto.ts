import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePresenceDto {
  @IsString()
  @IsNotEmpty()
  registrationId!: string;
}