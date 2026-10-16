import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Filters are applied to the event start date and then consistently to its actions. */
export class DashboardQueryDto {
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
}
