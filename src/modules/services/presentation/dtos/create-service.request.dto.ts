import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateServiceRequestDto {
  @ApiProperty({ example: 'Troca de oleo', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Inclui filtro', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ example: 15099, description: 'Price in integer BRL cents' })
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(1)
  estimatedDurationMinutes!: number;
}
