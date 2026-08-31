import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export class ReplenishStockRequestDto {
  @ApiProperty({ example: 10 })
  @IsInt()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ example: 2500, description: 'Unit price in integer BRL cents' })
  @IsInt()
  @Min(0)
  unitPriceCents!: number;

  @ApiPropertyOptional({ example: 'Reposicao mensal', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
