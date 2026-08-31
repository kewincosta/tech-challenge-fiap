import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const MIN_YEAR = 1950;
const MAX_YEAR = 2100;

export class UpdateVehicleRequestDto {
  @ApiPropertyOptional({ example: 'Toyota' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  brand?: string;

  @ApiPropertyOptional({ example: 'Corolla' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  year?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Transfers ownership when supplied.' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
