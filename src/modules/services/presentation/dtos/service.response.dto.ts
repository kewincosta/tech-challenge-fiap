import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatedServiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class ServiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Troca de oleo' })
  name!: string;

  @ApiPropertyOptional({ example: 'Inclui filtro', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 15099, description: 'Price in integer BRL cents' })
  priceCents!: number;

  @ApiProperty({ example: 60 })
  estimatedDurationMinutes!: number;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;
}
