import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class AverageExecutionTimeQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: "A catalog service's external id" })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inclusive, filters on completedAt' })
  @IsOptional()
  @IsISO8601()
  completedFrom?: string;

  @ApiPropertyOptional({ example: '2026-01-31', description: 'Inclusive, filters on completedAt' })
  @IsOptional()
  @IsISO8601()
  completedTo?: string;
}
