import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsDateString()
  startDateFrom?: string;

  @IsOptional()
  @IsDateString()
  startDateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  actionId?: string;

  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';
}
