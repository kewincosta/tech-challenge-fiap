import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class AddressRequestDto {
  @ApiProperty({ example: 'Rua das Flores' })
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @IsNotEmpty()
  number!: string;

  @ApiPropertyOptional({ example: 'Apto 45' })
  @IsOptional()
  @IsString()
  complement?: string;

  @ApiProperty({ example: 'Centro' })
  @IsString()
  @IsNotEmpty()
  district!: string;

  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'SP', minLength: 2, maxLength: 2 })
  @IsString()
  @Length(2, 2)
  state!: string;

  @ApiProperty({ example: '01001-000' })
  @IsString()
  @IsNotEmpty()
  zipCode!: string;
}
