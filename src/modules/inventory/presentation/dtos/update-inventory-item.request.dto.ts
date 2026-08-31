import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateInventoryItemRequestDto {
  @ApiPropertyOptional({ example: 'Filtro de oleo', maxLength: 120 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    example: 'Filtro padrao',
    nullable: true,
    description: 'Send null to clear it; omit the field to leave it untouched.',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiPropertyOptional({ example: 3000, description: 'Unit price in integer BRL cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;
}
