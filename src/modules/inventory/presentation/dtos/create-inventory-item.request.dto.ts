import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInventoryItemRequestDto {
  @ApiProperty({ example: 'FLT-001', maxLength: 40 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  sku!: string;

  @ApiProperty({ example: 'Filtro de oleo', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Filtro padrao', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ example: 'PART', enum: ['PART', 'SUPPLY'] })
  @IsIn(['PART', 'SUPPLY'])
  kind!: string;

  @ApiProperty({ example: 2500, description: 'Unit price in integer BRL cents' })
  @IsInt()
  @Min(0)
  unitPriceCents!: number;
}
