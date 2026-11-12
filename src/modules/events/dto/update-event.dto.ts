import {
  IsDateString,
  ValidateIf,
  IsInt,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @IsNotEmpty() @MaxLength(100)
  category?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1)
  workloadMinutes?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsDateString()
  registrationStartDate?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsDateString()
  registrationEndDate?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1)
  totalCapacity?: number;
}
